/**
 * orderStore — commandes transmises aux enseignes (persisté : `cabas/order`).
 *
 * État : `orders: StoredOrder[]` (OrderHandoff + `weekStart`, `savingsCents`,
 * `mealPlanId`), plus récentes d'abord.
 * Actions :
 *  - `prepareOrder(part, storeId, channel?)` → StoredOrder (core › buildOrderHandoff :
 *    URL du drive avec UTM, lignes du panier). Une commande « préparée » non
 *    confirmée pour le même magasin et la même semaine est remplacée. Programme
 *    un rappel de commande le lendemain matin si le réglage est actif. REFUSÉE
 *    (null) si une ligne contient un allergène déclaré du profil (panier calculé
 *    avant la déclaration) ; `openOrder` / `orderText` aussi ;
 *  - `openOrder(id)` → boolean : ouvre le drive (navigateur intégré) et passe à « opened » ;
 *  - `markOpened(id)` ;
 *  - `confirmOrder(id)` → SpendingEntry | null : statut « confirmed » + dépense
 *    ajoutée au budget (économies = part de `basket.plan.savingsCents`) ;
 *  - `copyOrderText(id)` → boolean (presse-papiers) ; `orderText(id)` → texte ;
 *  - `reset()`.
 * Sélecteurs purs : `lastOrderForWeek(orders, weekStart, storeId?)`, `ordersForWeek(orders, ws)`.
 * Hook : `useLastOrderForWeek(weekStart?, storeId?)`.
 * Alertes prix (produits habituels) : voir stores/priceWatch.ts.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { BasketStorePart, OrderChannel, OrderHandoff, SpendingEntry } from '@/core';
import { buildOrderHandoff, formatOrderAsText, spendingFromHandoff, storeDisplayName } from '@/core';
import { track } from '@/services/analytics';
import { linesHaveAllergen } from '@/services/basket';
import { getCatalogSnapshot } from '@/services/catalog';
import { cancelOrderReminder, scheduleOrderReminder } from '@/services/notifications';
import { copyListToClipboard, openOrder as openOrderService } from '@/services/order';

import { useBasketStore } from './basketStore';
import { useBudgetStore } from './budgetStore';
import { usePlanStore } from './planStore';
import { useProfileStore } from './profileStore';
import { basePersistOptions, registerPersistedStore } from './registry';
import { useSettingsStore } from './settingsStore';
import { activeWeek, useWeekStore } from './weekStore';

export interface StoredOrder extends OrderHandoff {
  weekStart: string;
  /** Économie attribuée à cette commande (part du panier optimisé), centimes. */
  savingsCents: number;
  mealPlanId: string | null;
  confirmedAt?: string;
}

export interface OrderState {
  hydrated: boolean;
  orders: StoredOrder[];
  prepareOrder(part: BasketStorePart, storeId: string, channel?: OrderChannel): StoredOrder | null;
  openOrder(id: string): Promise<boolean>;
  markOpened(id: string): void;
  confirmOrder(id: string): SpendingEntry | null;
  orderText(id: string): string | null;
  copyOrderText(id: string): Promise<boolean>;
  setOrders(orders: StoredOrder[]): void;
  reset(): void;
}

const MAX_ORDERS = 100;

/** Lignes contenant un allergène déclaré du profil (jamais commandées ni copiées). */
function unsafeForProfile(lines: readonly { productId: string }[]): boolean {
  return linesHaveAllergen(lines, useProfileStore.getState().profile?.allergens, getCatalogSnapshot());
}

export function ordersForWeek(orders: readonly StoredOrder[], weekStart: string): StoredOrder[] {
  return orders.filter((o) => o.weekStart === weekStart);
}

/** Dernière commande d'une semaine (éventuellement pour un magasin). */
export function lastOrderForWeek(orders: readonly StoredOrder[], weekStart: string, storeId?: string): StoredOrder | null {
  let best: StoredOrder | null = null;
  for (const o of orders) {
    if (o.weekStart !== weekStart || (storeId && o.storeId !== storeId)) continue;
    if (!best || o.createdAt > best.createdAt) best = o;
  }
  return best;
}

/** Rappel « pense à commander » : demain à 10 h. */
function reminderDate(now = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d;
}

export const useOrderStore = create<OrderState>()(
  persist(
    (set, get) => {
      const patch = (id: string, fn: (o: StoredOrder) => StoredOrder) =>
        set({ orders: get().orders.map((o) => (o.id === id ? fn(o) : o)) });

      return {
        hydrated: false,
        orders: [],

        prepareOrder(part, storeId, channel) {
          const catalog = getCatalogSnapshot();
          const store = catalog.storesById[storeId];
          if (!store || part.lines.length === 0) return null;
          // Panier calculé avant une nouvelle allergie : à recalculer, jamais à commander.
          if (unsafeForProfile(part.lines)) return null;
          const basket = useBasketStore.getState();
          const ch = channel ?? basket.channel;
          const handoff = buildOrderHandoff(part, store, catalog.productsById, ch);
          const plan = basket.plan;
          const partTotal = part.subtotalCents + part.feesCents;
          const savings =
            plan && plan.totalCents > 0 ? Math.max(0, Math.round((plan.savingsCents * partTotal) / plan.totalCents)) : 0;
          const ws = basket.weekStart ?? activeWeek();
          const order: StoredOrder = {
            ...handoff,
            weekStart: ws,
            savingsCents: savings,
            mealPlanId: usePlanStore.getState().plans[ws]?.id ?? null,
          };
          const others = get().orders.filter(
            (o) => !(o.status !== 'confirmed' && o.weekStart === ws && o.storeId === storeId),
          );
          set({ orders: [order, ...others].slice(0, MAX_ORDERS) });
          track('order_prepared', { storeId, channel: ch, lines: order.lines.length, totalCents: order.totalCents });
          if (useSettingsStore.getState().notificationPrefs.orderReminder) {
            void scheduleOrderReminder(reminderDate());
          }
          return order;
        },
        async openOrder(id) {
          const order = get().orders.find((o) => o.id === id);
          if (!order || unsafeForProfile(order.lines)) return false;
          const ok = await openOrderService(order);
          if (ok) get().markOpened(id);
          return ok;
        },
        markOpened(id) {
          patch(id, (o) => (o.status === 'prepared' ? { ...o, status: 'opened' } : o));
        },
        confirmOrder(id) {
          const order = get().orders.find((o) => o.id === id);
          if (!order) return null;
          const confirmedAt = new Date().toISOString();
          patch(id, (o) => ({ ...o, status: 'confirmed', confirmedAt }));
          const store = getCatalogSnapshot().storesById[order.storeId];
          const entry = spendingFromHandoff(
            { ...order, createdAt: confirmedAt },
            order.savingsCents,
            store ? `Courses ${storeDisplayName(store, { short: true })}` : undefined,
          );
          useBudgetStore.getState().addEntry(entry);
          void cancelOrderReminder();
          track('order_confirmed', {
            storeId: order.storeId,
            channel: order.channel,
            totalCents: order.totalCents,
            savingsCents: order.savingsCents,
          });
          return entry;
        },
        orderText(id) {
          const order = get().orders.find((o) => o.id === id);
          if (!order || unsafeForProfile(order.lines)) return null;
          const catalog = getCatalogSnapshot();
          const store = catalog.storesById[order.storeId];
          return store ? formatOrderAsText(order, store, catalog.productsById) : null;
        },
        async copyOrderText(id) {
          const text = get().orderText(id);
          return text ? copyListToClipboard(text) : false;
        },
        setOrders(orders) {
          set({ orders: orders.slice(0, MAX_ORDERS) });
        },
        reset() {
          set({ orders: [] });
        },
      };
    },
    {
      ...basePersistOptions<Partial<OrderState>>('order'),
      partialize: (s) => ({ orders: s.orders }),
    },
  ),
);

registerPersistedStore('order', useOrderStore);

/** Dernière commande de la semaine (défaut : semaine active). */
export function useLastOrderForWeek(weekStart?: string, storeId?: string): StoredOrder | null {
  const active = useWeekStore((s) => s.activeWeekStart);
  const ws = weekStart ?? active;
  // Sélection d'un élément existant (référence stable) : pas de boucle de rendu.
  return useOrderStore((s) => lastOrderForWeek(s.orders, ws, storeId));
}

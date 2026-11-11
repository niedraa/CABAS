/**
 * listStore — liste de courses, une par semaine (persisté : `cabas/list`).
 * 100 % hors-ligne : tout est calculé sur l'appareil.
 *
 * État : `lists: Record<weekStart, ShoppingList>`.
 * Actions (semaine par défaut : `weekStore.activeWeekStart`) :
 *  - `regenerateFromPlan(plan)` → ShoppingList : core › buildShoppingList (conditionnements
 *    réels des produits, déduction du placard) puis core › mergeWithExisting (les
 *    articles manuels et les cases cochées sont conservés). Appelée
 *    automatiquement par planStore après chaque changement du planning ;
 *  - `toggleItem(itemId, weekStart?)`, `setChecked(itemId, checked, weekStart?)` ;
 *  - `addManualItem(label, quantity?, unit?, weekStart?)` → article (rayon deviné) ou null ;
 *  - `updateItem(itemId, patch, weekStart?)`, `removeItem(itemId, weekStart?)` ;
 *  - `clearChecked(weekStart?)` (retire les articles cochés), `uncheckAll(weekStart?)` ;
 *  - `restoreItems(items, weekStart?)` : annulation d'un retrait (les articles reviennent pour de bon) ;
 *  - `storeLeftovers(weekStart?)` → nombre d'articles rangés : le surplus des articles
 *    cochés pas encore rangés rejoint le placard (pantryStore › addFromShopping) ;
 *  - `reset()`.
 * `dismissed: Record<weekStart, ListDismissals>` : articles du MENU retirés à la main
 * (vider les cochés, glisser pour retirer). La liste régénérée ne les fait pas
 * revenir — sauf si le planning en demande davantage (core › withoutDismissed).
 * La quantité retenue est celle du menu, pas une quantité retouchée.
 * `overrides: Record<weekStart, Record<dismissalKey, ListItemOverride>>` : retouches
 * d'un article du MENU (libellé, rayon, quantité) réappliquées à chaque régénération ;
 * une quantité saisie ne tient que tant que le besoin du menu ne change pas.
 * `leftovers: Record<weekStart, LeftoversRecord>` : articles cochés dont le surplus a
 * déjà été rangé au placard (`storeLeftovers` ne les range pas deux fois).
 * Mémoires locales à l'appareil (non synchronisées).
 * Sélecteurs purs : `groupItemsByAisle(items)` (rayons dans l'ordre de parcours,
 * non cochés d'abord), `listProgressOf(items)`, `emptyList(weekStart)`.
 * Hooks mémoïsés : `useActiveList()`, `useListSections(weekStart?)`, `useListProgress(weekStart?)`.
 */
import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Aisle, BaseUnit, ListDismissals, MealPlan, ShoppingList, ShoppingListItem } from '@/core';
import {
  buildShoppingList,
  createManualItem,
  dismissalKey,
  forgetDismissals,
  groupByAisle,
  listProgress,
  mergeWithExisting,
  recordDismissals,
  toggleItem as toggleCore,
  withoutDismissed,
} from '@/core';
import { track } from '@/services/analytics';
import { getCatalogSnapshot } from '@/services/catalog';

import { pantryForWeekList, usePantryStore } from './pantryStore';
import { basePersistOptions, registerPersistedStore } from './registry';
import { activeWeek, useWeekStore } from './weekStore';

export type ListItemPatch = Partial<Pick<ShoppingListItem, 'label' | 'quantity' | 'unit' | 'aisle' | 'note' | 'checked'>>;

/** Retouches de l'utilisateur sur un article du menu. */
export interface ListItemOverride {
  label?: string;
  aisle?: Aisle;
  /** Quantité saisie, et celle que le menu demandait alors (`planned`). */
  quantity?: { value: number; planned: number };
}

/** Surplus rangé au placard pour une semaine. */
export interface LeftoversRecord {
  /** Articles (cochés) déjà traités, qu'ils aient eu un surplus ou non. */
  itemIds: string[];
  /** Nombre d'articles ajoutés au placard (cumulé). */
  stored: number;
}

export interface ListState {
  hydrated: boolean;
  lists: Record<string, ShoppingList>;
  /** Semaine → articles du menu retirés à la main. */
  dismissed: Record<string, ListDismissals>;
  /** Semaine → retouches des articles du menu (clé : core › dismissalKey). */
  overrides: Record<string, Record<string, ListItemOverride>>;
  /** Semaine → surplus déjà rangé au placard. */
  leftovers: Record<string, LeftoversRecord>;
  regenerateFromPlan(plan: MealPlan): ShoppingList;
  toggleItem(itemId: string, weekStart?: string): void;
  setChecked(itemId: string, checked: boolean, weekStart?: string): void;
  addManualItem(label: string, quantity?: number, unit?: BaseUnit, weekStart?: string): ShoppingListItem | null;
  updateItem(itemId: string, patch: ListItemPatch, weekStart?: string): void;
  removeItem(itemId: string, weekStart?: string): void;
  clearChecked(weekStart?: string): void;
  uncheckAll(weekStart?: string): void;
  restoreItems(items: readonly ShoppingListItem[], weekStart?: string): void;
  storeLeftovers(weekStart?: string): number;
  setList(weekStart: string, list: ShoppingList): void;
  reset(): void;
}

export function emptyList(weekStart: string): ShoppingList {
  return { id: `list_${weekStart}`, mealPlanId: null, items: [], updatedAt: new Date(0).toISOString() };
}

/** Rayons dans l'ordre de parcours, articles non cochés d'abord. */
export function groupItemsByAisle(items: readonly ShoppingListItem[]): { aisle: Aisle; items: ShoppingListItem[] }[] {
  return groupByAisle(items);
}

export function listProgressOf(items: readonly ShoppingListItem[]) {
  return listProgress(items);
}

const sameQuantity = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** Quantité demandée par le menu (et non la quantité retouchée par l'utilisateur). */
export function plannedQuantityOf(item: ShoppingListItem, overrides: Readonly<Record<string, ListItemOverride>>): number {
  if (item.source !== 'plan') return item.quantity;
  return overrides[dismissalKey(item)]?.quantity?.planned ?? item.quantity;
}

/**
 * Réapplique les retouches de l'utilisateur à une liste régénérée. Une quantité
 * saisie ne vaut que pour le besoin d'alors : si le menu (repas, placard) en
 * demande une autre, Cabas recalcule et la retouche de quantité est oubliée.
 */
export function applyItemOverrides(
  items: readonly ShoppingListItem[],
  overrides: Readonly<Record<string, ListItemOverride>>,
): { items: ShoppingListItem[]; overrides: Record<string, ListItemOverride> } {
  const kept: Record<string, ListItemOverride> = { ...overrides };
  const next = items.map((item) => {
    if (item.source !== 'plan') return item;
    const key = dismissalKey(item);
    const o = overrides[key];
    if (!o) return item;
    const patched: ShoppingListItem = { ...item };
    if (o.label) patched.label = o.label;
    if (o.aisle) patched.aisle = o.aisle;
    if (o.quantity) {
      if (sameQuantity(item.quantity, o.quantity.planned)) {
        patched.quantity = o.quantity.value;
        // Quantité retouchée : l'arrondi au conditionnement ne vaut plus (comme `updateItem`).
        delete patched.packaging;
      } else {
        const { quantity: _stale, ...rest } = o;
        if (Object.keys(rest).length > 0) kept[key] = rest;
        else delete kept[key];
      }
    }
    return patched;
  });
  return { items: next, overrides: kept };
}

export const useListStore = create<ListState>()(
  persist(
    (set, get) => {
      /** Applique une transformation aux articles d'une semaine. */
      const mutate = (weekStart: string | undefined, fn: (items: ShoppingListItem[]) => ShoppingListItem[]) => {
        const ws = weekStart ?? activeWeek();
        const list = get().lists[ws] ?? emptyList(ws);
        const items = fn(list.items);
        set({ lists: { ...get().lists, [ws]: { ...list, items, updatedAt: new Date().toISOString() } } });
      };

      /** Retire des articles d'une semaine et mémorise ceux du menu (ils ne reviendront pas à la régénération). */
      const dismiss = (weekStart: string | undefined, shouldRemove: (item: ShoppingListItem) => boolean) => {
        const ws = weekStart ?? activeWeek();
        const list = get().lists[ws] ?? emptyList(ws);
        const removed = list.items.filter(shouldRemove);
        if (removed.length === 0) return;
        // On retient le besoin du menu, pas une quantité retouchée : l'article ne revient
        // que si le menu en demande vraiment davantage.
        const overrides = get().overrides[ws] ?? {};
        const asPlanned = removed.map((i) => ({ ...i, quantity: plannedQuantityOf(i, overrides) }));
        set({
          lists: {
            ...get().lists,
            [ws]: { ...list, items: list.items.filter((i) => !shouldRemove(i)), updatedAt: new Date().toISOString() },
          },
          dismissed: { ...get().dismissed, [ws]: recordDismissals(get().dismissed[ws] ?? {}, asPlanned) },
        });
      };

      return {
        hydrated: false,
        lists: {},
        dismissed: {},
        overrides: {},
        leftovers: {},

        regenerateFromPlan(plan) {
          const catalog = getCatalogSnapshot();
          const { items: pantryItems, origins } = usePantryStore.getState();
          const pantry = pantryForWeekList(pantryItems, origins, plan.weekStart);
          const generated = buildShoppingList(plan, catalog.recipesById, catalog.ingredientsById, {
            products: catalog.products,
            pantry,
          });
          // Les articles du menu déjà retirés à la main ne reviennent pas (sauf besoin accru).
          const fresh = withoutDismissed(generated, get().dismissed[plan.weekStart] ?? {});
          const previous = get().lists[plan.weekStart] ?? emptyList(plan.weekStart);
          const overrides = get().overrides[plan.weekStart] ?? {};
          // Une coche tient tant que le besoin ne dépasse ni la quantité saisie ni celle
          // que le menu demandait quand l'utilisateur l'a retouchée.
          const previousForMerge = previous.items.map((i) => {
            const planned = plannedQuantityOf(i, overrides);
            return planned > i.quantity ? { ...i, quantity: planned } : i;
          });
          const merged = applyItemOverrides(mergeWithExisting(previousForMerge, fresh), overrides);
          const list: ShoppingList = {
            id: previous.id,
            mealPlanId: plan.id,
            items: merged.items,
            updatedAt: new Date().toISOString(),
          };
          set({
            lists: { ...get().lists, [plan.weekStart]: list },
            overrides: { ...get().overrides, [plan.weekStart]: merged.overrides },
          });
          track('list_generated', {
            items: list.items.length,
            manual: list.items.filter((i) => i.source === 'manual').length,
            meals: plan.meals.length,
          });
          return list;
        },
        toggleItem(itemId, weekStart) {
          let checked = false;
          mutate(weekStart, (items) => {
            const next = toggleCore(items, itemId);
            checked = next.find((i) => i.id === itemId)?.checked ?? false;
            return next;
          });
          if (checked) track('item_checked');
        },
        setChecked(itemId, checked, weekStart) {
          mutate(weekStart, (items) => toggleCore(items, itemId, checked));
        },
        addManualItem(label, quantity, unit, weekStart) {
          if (!label.trim()) return null;
          const item = createManualItem(label, { quantity, unit });
          mutate(weekStart, (items) => [...items, item]);
          track('manual_item_added', { aisle: item.aisle });
          return item;
        },
        updateItem(itemId, patch, weekStart) {
          const ws = weekStart ?? activeWeek();
          let before: ShoppingListItem | undefined;
          let after: ShoppingListItem | undefined;
          mutate(ws, (items) =>
            items.map((i) => {
              if (i.id !== itemId) return i;
              const next: ShoppingListItem = { ...i, ...patch };
              if (patch.label !== undefined) next.label = patch.label.trim() || i.label;
              if (patch.quantity !== undefined) {
                next.quantity = Number.isFinite(patch.quantity) && patch.quantity > 0 ? patch.quantity : i.quantity;
                // La quantité a changé : l'ancien arrondi au conditionnement ne vaut plus.
                if (next.quantity !== i.quantity) delete next.packaging;
              }
              before = i;
              after = next;
              return next;
            }),
          );
          // Article du menu : la retouche est mémorisée pour survivre aux régénérations.
          if (!before || !after || before.source !== 'plan') return;
          if (after.label === before.label && after.aisle === before.aisle && after.quantity === before.quantity) return;
          const key = dismissalKey(before);
          const weekOverrides = get().overrides[ws] ?? {};
          const o: ListItemOverride = { ...weekOverrides[key] };
          if (after.label !== before.label) o.label = after.label;
          if (after.aisle !== before.aisle) o.aisle = after.aisle;
          if (after.quantity !== before.quantity) {
            const planned = plannedQuantityOf(before, weekOverrides);
            if (sameQuantity(after.quantity, planned)) delete o.quantity;
            else o.quantity = { value: after.quantity, planned };
          }
          const nextOverrides = { ...weekOverrides };
          if (Object.keys(o).length > 0) nextOverrides[key] = o;
          else delete nextOverrides[key];
          set({ overrides: { ...get().overrides, [ws]: nextOverrides } });
        },
        removeItem(itemId, weekStart) {
          dismiss(weekStart, (i) => i.id === itemId);
        },
        clearChecked(weekStart) {
          dismiss(weekStart, (i) => i.checked);
        },
        uncheckAll(weekStart) {
          mutate(weekStart, (items) => items.map((i) => (i.checked ? { ...i, checked: false } : i)));
        },
        restoreItems(restored, weekStart) {
          const ws = weekStart ?? activeWeek();
          const list = get().lists[ws] ?? emptyList(ws);
          const ids = new Set(list.items.map((i) => i.id));
          const back = restored.filter((i) => !ids.has(i.id));
          set({
            lists: { ...get().lists, [ws]: { ...list, items: [...list.items, ...back], updatedAt: new Date().toISOString() } },
            dismissed: { ...get().dismissed, [ws]: forgetDismissals(get().dismissed[ws] ?? {}, restored) },
          });
        },
        storeLeftovers(weekStart) {
          const ws = weekStart ?? activeWeek();
          const record = get().leftovers[ws] ?? { itemIds: [], stored: 0 };
          const done = new Set(record.itemIds);
          // Seulement les articles cochés pas encore rangés : un second passage ne
          // réécrit pas ce que l'utilisateur a déjà consommé ou daté au placard.
          const pending = (get().lists[ws] ?? emptyList(ws)).items.filter((i) => i.checked && !done.has(i.id));
          if (pending.length === 0) return 0;
          const n = usePantryStore.getState().addFromShopping(pending, ws);
          set({
            leftovers: {
              ...get().leftovers,
              [ws]: { itemIds: [...record.itemIds, ...pending.map((i) => i.id)], stored: record.stored + n },
            },
          });
          return n;
        },
        setList(weekStart, list) {
          set({ lists: { ...get().lists, [weekStart]: list } });
        },
        reset() {
          set({ lists: {}, dismissed: {}, overrides: {}, leftovers: {} });
        },
      };
    },
    {
      ...basePersistOptions<Partial<ListState>>('list'),
      partialize: (s) => ({ lists: s.lists, dismissed: s.dismissed, overrides: s.overrides, leftovers: s.leftovers }),
    },
  ),
);

registerPersistedStore('list', useListStore);

/** Liste d'une semaine (hors React ; liste vide si absente). */
export function getList(weekStart: string = activeWeek()): ShoppingList {
  return useListStore.getState().lists[weekStart] ?? emptyList(weekStart);
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/** Liste de la semaine (défaut : semaine active), ou null si jamais générée. */
export function useWeekList(weekStart?: string): ShoppingList | null {
  const active = useWeekStore((s) => s.activeWeekStart);
  const ws = weekStart ?? active;
  return useListStore((s) => s.lists[ws] ?? null);
}

export function useActiveList(): ShoppingList | null {
  return useWeekList();
}

/** Articles groupés par rayon (mémoïsé). */
export function useListSections(weekStart?: string) {
  const list = useWeekList(weekStart);
  return useMemo(() => groupByAisle(list?.items ?? []), [list]);
}

export function useListProgress(weekStart?: string) {
  const list = useWeekList(weekStart);
  return useMemo(() => listProgress(list?.items ?? []), [list]);
}

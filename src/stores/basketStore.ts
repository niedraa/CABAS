/**
 * basketStore — comparateur de prix + panier optimisé (persisté : `cabas/basket`).
 *
 * État :
 *  - `mode: 'cheapest' | 'single_store'` (demandé), `channel: 'drive' | 'delivery'` ;
 *  - `comparisons: ItemComparison[]` (TOUS les magasins : ≥ 3 enseignes par produit) ;
 *  - `plan: BasketPlan | null` (panier calculé ; `plan.mode` = mode réellement appliqué) ;
 *  - `downgraded` : un compte gratuit a demandé « le moins cher » et reçoit
 *    « un seul magasin » (→ proposer Premium) ;
 *  - `status: 'idle' | 'computing' | 'ready' | 'error'`, `error`, `source` ;
 *  - `weekStart` / `listUpdatedAt` : liste qui a servi au calcul (voir `isBasketStale`) ;
 *  - `selectedAlternatives: Record<itemId, productId>` (ex. MDD moins chère choisie).
 * Actions (async) :
 *  - `compute()` : articles NON cochés de la liste active, magasins préférés du profil
 *    (tous si aucun) ; comparaison toujours disponible, panier multi-magasins Premium ;
 *  - `setMode(mode)`, `setChannel(channel)` : recalculent si un panier existe ;
 *  - `selectAlternative(itemId, productId | null)` : recalcule ;
 *  - `reset()`.
 * Sélecteurs purs : `isBasketStale(state, list)`, `comparisonFor(state, itemId)`.
 * Hooks : `useBasketIsStale()`.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { BasketMode, BasketPlan, ItemComparison, OrderChannel, ShoppingList } from '@/core';
import { track } from '@/services/analytics';
import { getBasketService, type BasketResult } from '@/services/basket';
import { captureError } from '@/services/monitoring';

import { getList, useListStore } from './listStore';
import { useProfileStore } from './profileStore';
import { basePersistOptions, registerPersistedStore } from './registry';
import { currentEntitlement } from './subscriptionStore';
import { activeWeek, useWeekStore } from './weekStore';

export type BasketStatus = 'idle' | 'computing' | 'ready' | 'error';

export interface BasketState {
  hydrated: boolean;
  mode: BasketMode;
  channel: OrderChannel;
  comparisons: ItemComparison[];
  plan: BasketPlan | null;
  downgraded: boolean;
  status: BasketStatus;
  error: string | null;
  source: BasketResult['source'] | null;
  weekStart: string | null;
  listUpdatedAt: string | null;
  storeIds: string[];
  selectedAlternatives: Record<string, string>;
  compute(): Promise<BasketPlan | null>;
  setMode(mode: BasketMode): Promise<void>;
  setChannel(channel: OrderChannel): Promise<void>;
  selectAlternative(itemId: string, productId: string | null): Promise<void>;
  reset(): void;
}

/** Le panier ne correspond plus à la liste (articles cochés / ajoutés depuis). */
export function isBasketStale(state: Pick<BasketState, 'weekStart' | 'listUpdatedAt' | 'plan'>, list: ShoppingList | null, weekStart: string): boolean {
  if (!state.plan) return true;
  if (state.weekStart !== weekStart) return true;
  return (list?.updatedAt ?? null) !== state.listUpdatedAt;
}

export function comparisonFor(state: Pick<BasketState, 'comparisons'>, itemId: string): ItemComparison | undefined {
  return state.comparisons.find((c) => c.itemId === itemId);
}

let computeSeq = 0;

export const useBasketStore = create<BasketState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      mode: 'single_store',
      channel: 'drive',
      comparisons: [],
      plan: null,
      downgraded: false,
      status: 'idle',
      error: null,
      source: null,
      weekStart: null,
      listUpdatedAt: null,
      storeIds: [],
      selectedAlternatives: {},

      async compute() {
        const seq = ++computeSeq;
        const ws = activeWeek();
        const list = getList(ws);
        const profile = useProfileStore.getState().profile;
        const storeIds = profile?.preferredStoreIds ?? [];
        const { mode, channel, selectedAlternatives } = get();
        set({ status: 'computing', error: null });
        try {
          const entitlement = currentEntitlement();
          const res = await getBasketService().computeBasket({
            items: list.items,
            mode,
            storeIds,
            channel,
            entitlement,
            productChoices: selectedAlternatives,
          });
          // Un calcul plus récent a été lancé entre-temps : on l'ignore.
          if (seq !== computeSeq) return get().plan;
          set({
            comparisons: res.comparisons,
            plan: res.plan,
            downgraded: res.downgraded,
            status: 'ready',
            source: res.source,
            weekStart: ws,
            listUpdatedAt: list.updatedAt,
            storeIds,
          });
          track('basket_computed', {
            mode: res.mode,
            requestedMode: mode,
            downgraded: res.downgraded,
            channel,
            items: res.comparisons.length,
            stores: res.plan.parts.length,
            totalCents: res.plan.totalCents,
            savingsCents: res.plan.savingsCents,
            missing: res.plan.missingItemIds.length,
            source: res.source,
            entitlement,
          });
          return res.plan;
        } catch (err) {
          if (seq !== computeSeq) return get().plan;
          captureError(err, { where: 'basket.compute' });
          set({ status: 'error', error: 'Impossible de comparer les prix pour le moment.' });
          return null;
        }
      },
      async setMode(mode) {
        if (mode === get().mode && get().plan) return;
        set({ mode });
        track('basket_mode_changed', { mode });
        if (get().plan || get().status === 'ready') await get().compute();
      },
      async setChannel(channel) {
        if (channel === get().channel) return;
        set({ channel });
        if (get().plan) await get().compute();
      },
      async selectAlternative(itemId, productId) {
        const next = { ...get().selectedAlternatives };
        if (productId) next[itemId] = productId;
        else delete next[itemId];
        set({ selectedAlternatives: next });
        if (productId) track('alternative_selected', { productId });
        await get().compute();
      },
      reset() {
        computeSeq++;
        set({
          mode: 'single_store',
          channel: 'drive',
          comparisons: [],
          plan: null,
          downgraded: false,
          status: 'idle',
          error: null,
          source: null,
          weekStart: null,
          listUpdatedAt: null,
          storeIds: [],
          selectedAlternatives: {},
        });
      },
    }),
    {
      ...basePersistOptions<Partial<BasketState>>('basket'),
      partialize: (s) => ({
        mode: s.mode,
        channel: s.channel,
        comparisons: s.comparisons,
        plan: s.plan,
        downgraded: s.downgraded,
        source: s.source,
        weekStart: s.weekStart,
        listUpdatedAt: s.listUpdatedAt,
        storeIds: s.storeIds,
        selectedAlternatives: s.selectedAlternatives,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<BasketState>;
        // Un panier restauré est « prêt » (affichable hors-ligne) ; jamais « en calcul ».
        return { ...current, ...p, status: p.plan ? 'ready' : 'idle' };
      },
    },
  ),
);

registerPersistedStore('basket', useBasketStore);

/** Vrai si le panier doit être recalculé (liste modifiée, autre semaine, jamais calculé). */
export function useBasketIsStale(): boolean {
  const ws = useWeekStore((s) => s.activeWeekStart);
  const list = useListStore((s) => s.lists[ws] ?? null);
  const plan = useBasketStore((s) => s.plan);
  const weekStart = useBasketStore((s) => s.weekStart);
  const listUpdatedAt = useBasketStore((s) => s.listUpdatedAt);
  return isBasketStale({ plan, weekStart, listUpdatedAt }, list, ws);
}

/**
 * subscriptionStore — abonnement Premium (persisté : `cabas/subscription`,
 * pour garder le droit hors-ligne).
 *
 * État :
 *  - `state: SubscriptionState` (droit brut renvoyé par RevenueCat / le magasin simulé) ;
 *  - `offerings: NormalizedOfferings | null` (`{ monthly, annual }`, prix localisés, essai) ;
 *  - `status: 'idle' | 'loading' | 'purchasing' | 'restoring'`, `loading: boolean`, `error` ;
 *  - `lastCheckedAt`.
 * Actions (async) :
 *  - `refresh()` : état + offres ;
 *  - `purchase(packageId)` → PurchaseResult (`success` | `cancelled` | `error`) ;
 *  - `restore()` → PurchaseResult ;
 *  - `applyState(state)` (écouteur RevenueCat), `reset()`.
 * Sélecteurs purs : `effectiveEntitlement(state, now?)` (premium seulement s'il
 * n'a pas expiré), `selectEntitlement(s)`, `selectIsPremium(s)`, `selectIsTrial(s)`.
 * Hook : `useEntitlement()` (src/hooks).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Entitlement, SubscriptionState } from '@/core';
import { track } from '@/services/analytics';
import {
  FREE_SUBSCRIPTION,
  getPurchases,
  type NormalizedOfferings,
  type PackageId,
  type PurchaseResult,
} from '@/services/purchases';
import { errorMessage } from '@/services/supabase';

import { basePersistOptions, registerPersistedStore } from './registry';

export type SubscriptionStatus = 'idle' | 'loading' | 'purchasing' | 'restoring';

export interface SubscriptionStoreState {
  hydrated: boolean;
  state: SubscriptionState;
  offerings: NormalizedOfferings | null;
  status: SubscriptionStatus;
  loading: boolean;
  error: string | null;
  lastCheckedAt: string | null;
  refresh(): Promise<void>;
  purchase(packageId: PackageId): Promise<PurchaseResult>;
  restore(): Promise<PurchaseResult>;
  applyState(state: SubscriptionState): void;
  reset(): void;
}

/** Droit effectif : un Premium expiré redevient gratuit (même hors-ligne). */
export function effectiveEntitlement(state: SubscriptionState, nowMs: number = Date.now()): Entitlement {
  if (state.entitlement !== 'premium') return 'free';
  if (!state.expiresAt) return 'premium';
  const t = Date.parse(state.expiresAt);
  return Number.isFinite(t) && t > nowMs ? 'premium' : 'free';
}

export const selectEntitlement = (s: SubscriptionStoreState): Entitlement => effectiveEntitlement(s.state);
export const selectIsPremium = (s: SubscriptionStoreState): boolean => selectEntitlement(s) === 'premium';
export const selectIsTrial = (s: SubscriptionStoreState): boolean => selectIsPremium(s) && s.state.isTrial;

export const useSubscriptionStore = create<SubscriptionStoreState>()(
  persist(
    (set, get) => {
      const setStatus = (status: SubscriptionStatus) => set({ status, loading: status !== 'idle' });
      return {
        hydrated: false,
        state: { ...FREE_SUBSCRIPTION },
        offerings: null,
        status: 'idle',
        loading: false,
        error: null,
        lastCheckedAt: null,

        async refresh() {
          if (get().status !== 'idle') return;
          setStatus('loading');
          try {
            const service = getPurchases();
            const [state, offerings] = await Promise.all([
              service.getSubscriptionState(),
              service.getOfferings().catch(() => get().offerings),
            ]);
            set({ state, offerings, error: null, lastCheckedAt: new Date().toISOString() });
          } catch (err) {
            // Hors-ligne : on garde le dernier état connu (persisté).
            set({ error: errorMessage(err) });
          } finally {
            setStatus('idle');
          }
        },
        async purchase(packageId) {
          setStatus('purchasing');
          set({ error: null });
          track('purchase_started', { package: packageId });
          try {
            const res = await getPurchases().purchase(packageId);
            if (res.status === 'success') {
              set({ state: res.state, lastCheckedAt: new Date().toISOString() });
              track('purchase_completed', { package: packageId, trial: res.state.isTrial });
              // Les offres changent (essai consommé).
              void getPurchases()
                .getOfferings()
                .then((offerings) => set({ offerings }))
                .catch(() => undefined);
            } else if (res.status === 'cancelled') {
              track('purchase_cancelled', { package: packageId });
            } else {
              set({ error: res.message });
              track('purchase_failed', { package: packageId });
            }
            return res;
          } finally {
            setStatus('idle');
          }
        },
        async restore() {
          setStatus('restoring');
          set({ error: null });
          try {
            const res = await getPurchases().restore();
            if (res.status === 'success') {
              set({ state: res.state, lastCheckedAt: new Date().toISOString() });
              track('purchase_restored', { premium: effectiveEntitlement(res.state) === 'premium' });
            } else if (res.status === 'error') {
              set({ error: res.message });
            }
            return res;
          } finally {
            setStatus('idle');
          }
        },
        applyState(state) {
          set({ state, lastCheckedAt: new Date().toISOString() });
        },
        reset() {
          set({ state: { ...FREE_SUBSCRIPTION }, offerings: null, status: 'idle', loading: false, error: null, lastCheckedAt: null });
        },
      };
    },
    {
      ...basePersistOptions<Partial<SubscriptionStoreState>>('subscription'),
      partialize: (s) => ({ state: s.state, offerings: s.offerings, lastCheckedAt: s.lastCheckedAt }),
    },
  ),
);

registerPersistedStore('subscription', useSubscriptionStore);

/** Droit effectif courant (hors React). */
export function currentEntitlement(): Entitlement {
  return selectEntitlement(useSubscriptionStore.getState());
}

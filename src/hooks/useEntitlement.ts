/**
 * Droits de l'utilisateur (gratuit / Premium).
 *
 * - `useEntitlement()` → 'free' | 'premium' (un Premium expiré redevient gratuit) ;
 * - `useSubscription()` → `{ entitlement, isPremium, isTrial, expiresAt, willRenew,
 *   maxMealsPerWeek, canUse(feature) }` — pour le paywall, les badges « Premium »
 *   et les limites (3 repas / semaine en gratuit).
 */
import { useMemo } from 'react';

import type { Entitlement, Feature } from '@/core';
import { canUse, maxMealsPerWeek } from '@/core';
import { effectiveEntitlement, useSubscriptionStore } from '@/stores';

export function useEntitlement(): Entitlement {
  return useSubscriptionStore((s) => effectiveEntitlement(s.state));
}

export interface SubscriptionInfo {
  entitlement: Entitlement;
  isPremium: boolean;
  isTrial: boolean;
  expiresAt: string | null;
  willRenew: boolean;
  maxMealsPerWeek: number;
  canUse(feature: Feature): boolean;
}

export function useSubscription(): SubscriptionInfo {
  const entitlement = useEntitlement();
  const state = useSubscriptionStore((s) => s.state);
  return useMemo(
    () => ({
      entitlement,
      isPremium: entitlement === 'premium',
      isTrial: entitlement === 'premium' && state.isTrial,
      expiresAt: state.expiresAt,
      willRenew: state.willRenew,
      maxMealsPerWeek: maxMealsPerWeek(entitlement),
      canUse: (feature: Feature) => canUse(feature, entitlement),
    }),
    [entitlement, state],
  );
}

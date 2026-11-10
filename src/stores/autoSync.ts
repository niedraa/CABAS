/**
 * Synchronisation automatique stores ⇄ Supabase (production uniquement).
 *
 * - `startAutoSync()` : observe les stores et pousse chaque changement en
 *   différé (services/sync › schedulePush). Renvoie la fonction d'arrêt.
 *   Sans effet en mode démo.
 * - `applyPulledData(data)` : fusionne l'état serveur récupéré au lancement.
 *   Nouvel appareil (aucun profil local) → tout est restauré ; sinon seuls les
 *   plannings manquants et les dépenses inconnues sont ajoutés (l'appareil,
 *   utilisable hors-ligne, reste prioritaire).
 */
import type { MealPlan, ShoppingList } from '@/core';
import {
  isSyncEnabled,
  pushList,
  pushNotificationPrefs,
  pushOrder,
  pushPantry,
  pushPlan,
  pushProfile,
  pushSpending,
  schedulePush,
  type PulledData,
} from '@/services/sync';

import { useBudgetStore } from './budgetStore';
import { useListStore } from './listStore';
import { useOrderStore } from './orderStore';
import { usePantryStore } from './pantryStore';
import { usePlanStore } from './planStore';
import { useProfileStore } from './profileStore';
import { useSettingsStore } from './settingsStore';

function changedEntries<T>(next: Record<string, T>, prev: Record<string, T>): [string, T][] {
  return Object.entries(next).filter(([k, v]) => prev[k] !== v);
}

export function startAutoSync(): () => void {
  if (!isSyncEnabled()) return () => undefined;
  const unsubs: (() => void)[] = [];

  unsubs.push(
    useProfileStore.subscribe((s, prev) => {
      if (!s.profile || !s.onboardingCompleted) return;
      if (s.profile === prev.profile && s.onboardingCompletedAt === prev.onboardingCompletedAt) return;
      const profile = s.profile;
      const at = s.onboardingCompletedAt;
      schedulePush('profile', () => pushProfile(profile, at));
    }),
  );
  unsubs.push(
    usePlanStore.subscribe((s, prev) => {
      if (s.plans === prev.plans) return;
      for (const [ws, plan] of changedEntries<MealPlan>(s.plans, prev.plans)) {
        schedulePush(`plan:${ws}`, () => pushPlan(plan));
      }
    }),
  );
  unsubs.push(
    useListStore.subscribe((s, prev) => {
      if (s.lists === prev.lists) return;
      for (const [ws, list] of changedEntries<ShoppingList>(s.lists, prev.lists)) {
        // Un peu plus tard que le planning : la liste référence son id serveur.
        schedulePush(`list:${ws}`, () => pushList(list), 2500);
      }
    }),
  );
  unsubs.push(
    usePantryStore.subscribe((s, prev) => {
      if (s.items !== prev.items) schedulePush('pantry', () => pushPantry(s.items));
    }),
  );
  unsubs.push(
    useBudgetStore.subscribe((s, prev) => {
      if (s.entries !== prev.entries) schedulePush('spending', () => pushSpending(s.entries));
    }),
  );
  unsubs.push(
    useOrderStore.subscribe((s, prev) => {
      if (s.orders === prev.orders) return;
      const before = new Map(prev.orders.map((o) => [o.id, o]));
      for (const o of s.orders) {
        if (before.get(o.id) !== o) schedulePush(`order:${o.id}`, () => pushOrder(o, o.mealPlanId), 3000);
      }
    }),
  );
  unsubs.push(
    useSettingsStore.subscribe((s, prev) => {
      if (s.notificationPrefs !== prev.notificationPrefs) {
        schedulePush('notification-prefs', () => pushNotificationPrefs(s.notificationPrefs));
      }
    }),
  );
  return () => {
    for (const u of unsubs) u();
  };
}

export function applyPulledData(data: PulledData | null): void {
  if (!data) return;
  const profileState = useProfileStore.getState();
  const newDevice = !profileState.profile;
  if (newDevice && data.profile && data.onboardingCompleted) {
    profileState.setProfile(data.profile, true);
    if (data.notificationPrefs) void useSettingsStore.getState().updateNotificationPrefs(data.notificationPrefs);
    if (data.pantry.length > 0 && usePantryStore.getState().items.length === 0) {
      usePantryStore.getState().setItems(data.pantry);
    }
  }
  const plans = usePlanStore.getState().plans;
  for (const plan of data.plans) {
    if (!plans[plan.weekStart] && plan.meals.length > 0) usePlanStore.getState().setPlan(plan);
  }
  if (data.spending.length > 0) {
    const known = new Set(useBudgetStore.getState().entries.map((e) => e.id));
    const missing = data.spending.filter((e) => !known.has(e.id));
    if (missing.length > 0) useBudgetStore.getState().setEntries([...useBudgetStore.getState().entries, ...missing]);
  }
}

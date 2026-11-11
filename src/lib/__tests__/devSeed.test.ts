import { isRecipeSafe, weekSlots } from '@/core';
import { getCatalogSnapshot } from '@/services/catalog';
import {
  getList,
  selectIsPremium,
  useBasketStore,
  useBudgetStore,
  usePantryStore,
  usePlanStore,
  useProfileStore,
  useSubscriptionStore,
  useWeekStore,
} from '@/stores';

import { parseSeedVariant, seedDemoState } from '../devSeed';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'undetermined', canAskAgain: true })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  SchedulableTriggerInputTypes: { WEEKLY: 'weekly', DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {}, PURCHASES_ERROR_CODE: {} }));

/** Créneaux du profil encore à venir cette semaine (rien n'est planifié sur un jour passé). */
function upcomingSlots(): number {
  const { today, currentWeekStart } = useWeekStore.getState();
  return weekSlots(useProfileStore.getState().profile!, currentWeekStart).filter((s) => s.date >= today).length;
}

describe('seedDemoState', () => {
  it('parseSeedVariant', () => {
    expect(parseSeedVariant('premium')).toBe('premium');
    expect(parseSeedVariant(['fresh'])).toBe('fresh');
    expect(parseSeedVariant('n’importe quoi')).toBe('onboarded');
    expect(parseSeedVariant(undefined)).toBe('onboarded');
  });

  it('premium : Camille, 9 repas sûrs, liste, placard, budget, panier « le moins cher »', async () => {
    const summary = await seedDemoState('premium');
    const ws = useWeekStore.getState().currentWeekStart;
    const profile = useProfileStore.getState().profile!;
    expect(profile).toMatchObject({
      displayName: 'Camille',
      household: { adults: 2, children: 1 },
      allergens: ['arachides'],
      weeklyBudgetCents: 12000,
      preferredStoreIds: ['leclerc', 'carrefour', 'auchan'],
    });
    expect(profile.healthDataConsentAt).toBeTruthy();
    expect(selectIsPremium(useSubscriptionStore.getState())).toBe(true);
    expect(useSubscriptionStore.getState().state.isTrial).toBe(true);

    const plan = usePlanStore.getState().plans[ws];
    expect(plan.meals).toHaveLength(upcomingSlots()); // 9 un lundi
    expect(plan.meals.every((m) => m.date >= useWeekStore.getState().today)).toBe(true);
    const cat = getCatalogSnapshot();
    for (const m of plan.meals) expect(isRecipeSafe(cat.recipesById[m.recipeId], profile, cat.ingredientsById)).toBe(true);

    expect(getList(ws).items.length).toBeGreaterThan(0);
    expect(usePantryStore.getState().items.length).toBeGreaterThanOrEqual(3);
    expect(useBudgetStore.getState().entries).toHaveLength(3);
    expect(useBasketStore.getState().plan?.mode).toBe('cheapest');
    expect(summary).toMatchObject({ variant: 'premium', premium: true, meals: upcomingSlots() });
    expect(summary.listItems).toBeGreaterThan(0);
    expect(summary.durationMs).toBeLessThan(10_000);
  });

  it('onboarded : offre gratuite (3 repas, panier un seul magasin)', async () => {
    const summary = await seedDemoState('onboarded');
    expect(summary).toMatchObject({ premium: false, meals: Math.min(3, upcomingSlots()) });
    expect(useBasketStore.getState().plan?.mode).toBe('single_store');
  });

  it('fresh : tout est vide, onboarding à faire', async () => {
    await seedDemoState('premium');
    const summary = await seedDemoState('fresh');
    expect(summary).toMatchObject({ premium: false, meals: 0, listItems: 0, pantryItems: 0, spendingEntries: 0 });
    expect(useProfileStore.getState().onboardingCompleted).toBe(false);
  });

  it('mutualise deux appels simultanés', async () => {
    const [a, b] = [seedDemoState('onboarded'), seedDemoState('onboarded')];
    expect(a).toBe(b);
    await a;
  });
});

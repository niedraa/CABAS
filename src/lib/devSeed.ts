/**
 * Données de démonstration (outils de développement uniquement).
 *
 * `seedDemoState(variant)` remet l'app à zéro puis la remplit :
 *  - 'fresh'     : rien (premier lancement, onboarding à faire) ;
 *  - 'onboarded' : profil « Camille » (2 adultes + 1 enfant, allergie aux
 *    arachides, budget 120 €, Leclerc / Carrefour / Auchan, dîners du lundi au
 *    dimanche + déjeuners du week-end), quelques restes au placard, dépenses
 *    des semaines passées, planning de la semaine (offre gratuite : 3 repas),
 *    liste de courses et panier « un seul magasin » ;
 *  - 'premium'   : idem + Premium (essai de 7 jours, magasin simulé), planning
 *    complet (9 repas) et panier « le moins cher » multi-magasins.
 * Utilisé par la route `/dev/seed?variant=…` et par les tests e2e.
 *
 * Exception assumée aux règles de dépendance (lib → stores) : ce module n'est
 * importé que par la route de dev, jamais par un service.
 */
import type { Allergen, Diet, SpendingEntry, UserProfile } from '@/core';
import { addDays, DEFAULT_MEAL_SLOTS, storeDisplayName } from '@/core';
import { ensureSession } from '@/services/auth';
import { getCatalogSnapshot } from '@/services/catalog';
import { getPurchases } from '@/services/purchases';
import {
  resetAllStores,
  useBasketStore,
  useBudgetStore,
  useListStore,
  usePantryStore,
  usePlanStore,
  useProfileStore,
  useSubscriptionStore,
  useWeekStore,
  waitForHydration,
} from '@/stores';

export type SeedVariant = 'fresh' | 'onboarded' | 'premium';

export const SEED_VARIANTS: readonly SeedVariant[] = ['fresh', 'onboarded', 'premium'];

export function parseSeedVariant(value: unknown): SeedVariant {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === 'string' && (SEED_VARIANTS as readonly string[]).includes(v) ? (v as SeedVariant) : 'onboarded';
}

export interface SeedSummary {
  variant: SeedVariant;
  premium: boolean;
  meals: number;
  listItems: number;
  pantryItems: number;
  spendingEntries: number;
  basketTotalCents: number | null;
  durationMs: number;
}

/** Profil de démonstration (sans id ni horodatages). */
export const DEMO_PROFILE: Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt' | 'healthDataConsentAt'> = {
  displayName: 'Camille',
  household: { adults: 2, children: 1 },
  diets: [] as Diet[],
  allergens: ['arachides'] as Allergen[],
  dislikedIngredientIds: [],
  favoriteCuisines: ['francaise', 'italienne', 'asiatique', 'mediterraneenne'],
  weeklyBudgetCents: 12000,
  maxCookTimeWeekdayMin: 30,
  maxCookTimeWeekendMin: 60,
  equipment: ['plaques', 'four', 'mixeur', 'micro_ondes'],
  preferredStoreIds: ['leclerc', 'carrefour', 'auchan'],
  mealSlots: DEFAULT_MEAL_SLOTS,
};

/** Restes au placard : ingrédient, quantité (unité de base), péremption dans N jours. */
const DEMO_PANTRY: { ingredientId: string; quantity: number; expiresInDays?: number }[] = [
  { ingredientId: 'riz_basmati', quantity: 400 },
  { ingredientId: 'creme_fraiche', quantity: 100, expiresInDays: 2 },
  { ingredientId: 'oeuf', quantity: 4, expiresInDays: 6 },
  { ingredientId: 'pates_penne', quantity: 250 },
];

/** Dépenses des semaines passées : semaines avant la semaine en cours, magasin, total, économie. */
const DEMO_SPENDING: { weeksAgo: number; dayOffset: number; storeId: string; totalCents: number; savingsCents: number }[] = [
  { weeksAgo: 3, dayOffset: 5, storeId: 'leclerc', totalCents: 11240, savingsCents: 860 },
  { weeksAgo: 2, dayOffset: 4, storeId: 'carrefour', totalCents: 12890, savingsCents: 540 },
  { weeksAgo: 1, dayOffset: 5, storeId: 'leclerc', totalCents: 10475, savingsCents: 1230 },
];

const inFlight = new Map<SeedVariant, Promise<SeedSummary>>();

/** Remplit l'app (appels concurrents de la même variante mutualisés). */
export function seedDemoState(variant: SeedVariant): Promise<SeedSummary> {
  const running = inFlight.get(variant);
  if (running) return running;
  const p = runSeed(variant).finally(() => inFlight.delete(variant));
  inFlight.set(variant, p);
  return p;
}

async function runSeed(variant: SeedVariant): Promise<SeedSummary> {
  const started = Date.now();
  await waitForHydration();
  await resetAllStores({ resetSimulatedPurchases: true });

  const summary = (): SeedSummary => {
    const ws = useWeekStore.getState().currentWeekStart;
    return {
      variant,
      premium: useSubscriptionStore.getState().state.entitlement === 'premium',
      meals: usePlanStore.getState().plans[ws]?.meals.length ?? 0,
      listItems: useListStore.getState().lists[ws]?.items.length ?? 0,
      pantryItems: usePantryStore.getState().items.length,
      spendingEntries: useBudgetStore.getState().entries.length,
      basketTotalCents: useBasketStore.getState().plan?.totalCents ?? null,
      durationMs: Date.now() - started,
    };
  };
  if (variant === 'fresh') return summary();

  // Le profil prend l'id de la session (RLS en production).
  await ensureSession();
  const catalog = getCatalogSnapshot();
  const { currentWeekStart, today } = useWeekStore.getState();

  // 1. Onboarding, par le même chemin que l'utilisateur (validation comprise).
  const profileStore = useProfileStore.getState();
  profileStore.startOnboarding();
  profileStore.updateDraft({
    ...DEMO_PROFILE,
    preferredStoreIds: DEMO_PROFILE.preferredStoreIds.filter((id) => !!catalog.storesById[id]),
  });
  profileStore.setHealthDataConsent(true);
  const done = useProfileStore.getState().completeOnboarding();
  if (!done.ok) throw new Error(`Profil de démo invalide : ${done.issues.map((i) => i.message).join(' ')}`);

  // 2. Premium (magasin simulé : essai de 7 jours).
  if (variant === 'premium') {
    if (getPurchases().isSimulated()) {
      const res = await useSubscriptionStore.getState().purchase('annual');
      if (res.status !== 'success') throw new Error('Achat simulé impossible.');
    } else {
      // Build natif de production avec outils de dev : droit local uniquement.
      useSubscriptionStore.getState().applyState({
        entitlement: 'premium',
        isTrial: true,
        expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        productId: 'cabas_premium_annual',
        willRenew: true,
      });
    }
  }

  // 3. Placard (avant le planning : bonus anti-gaspi du moteur).
  for (const p of DEMO_PANTRY) {
    const ing = catalog.ingredientsById[p.ingredientId];
    if (!ing) continue;
    usePantryStore.getState().add({
      label: ing.name,
      quantity: p.quantity,
      unit: ing.baseUnit,
      ingredientId: ing.id,
      ...(p.expiresInDays !== undefined ? { expiresAt: addDays(today, p.expiresInDays) } : {}),
    });
  }

  // 4. Dépenses passées (suivi du budget).
  const entries: SpendingEntry[] = DEMO_SPENDING.filter((s) => !!catalog.storesById[s.storeId]).map((s, i) => ({
    id: `spend_demo_${i + 1}`,
    date: addDays(addDays(currentWeekStart, -7 * s.weeksAgo), s.dayOffset),
    storeId: s.storeId,
    totalCents: s.totalCents,
    savingsCents: s.savingsCents,
    source: 'order',
    label: `Courses ${storeDisplayName(catalog.storesById[s.storeId], { short: true })}`,
  }));
  useBudgetStore.getState().setEntries(entries);

  // 5. Planning de la semaine → liste de courses (régénérée automatiquement).
  const plan = await usePlanStore.getState().generate(currentWeekStart, { keepLocked: false });
  if (!plan.ok) throw new Error(plan.message);

  // 6. Panier (le mode « le moins cher » est Premium).
  await useBasketStore.getState().setMode(variant === 'premium' ? 'cheapest' : 'single_store');
  await useBasketStore.getState().compute();

  return summary();
}

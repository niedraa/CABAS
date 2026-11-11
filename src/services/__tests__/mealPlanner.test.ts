import type { MealPlan, UserProfile } from '@/core';
import { addDays, DEFAULT_MEAL_SLOTS, isRecipeSafe, startOfWeek, todayISO } from '@/core';

import { getCatalogSnapshot } from '../catalog';
import { clampMeals, createMealPlanner, parseRemotePlan, type MealPlanRemote } from '../mealPlanner';

const WEEK = startOfWeek(todayISO());
const PEANUT_RECIPE = 'rec_pad_thai_poulet';

function profile(over: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'u1',
    displayName: 'Camille',
    household: { adults: 2, children: 1 },
    diets: [],
    allergens: ['arachides'],
    dislikedIngredientIds: [],
    favoriteCuisines: [],
    weeklyBudgetCents: 12000,
    maxCookTimeWeekdayMin: 45,
    maxCookTimeWeekendMin: 90,
    equipment: ['plaques', 'four', 'mixeur', 'micro_ondes'],
    preferredStoreIds: ['leclerc'],
    mealSlots: DEFAULT_MEAL_SLOTS,
    healthDataConsentAt: '2026-11-01T00:00:00.000Z',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...over,
  };
}

function assertAllSafe(plan: MealPlan, p: UserProfile) {
  const cat = getCatalogSnapshot();
  for (const m of plan.meals) {
    expect(isRecipeSafe(cat.recipesById[m.recipeId], p, cat.ingredientsById)).toBe(true);
  }
}

describe('mealPlanner', () => {
  it('le catalogue de test contient bien un plat aux arachides', () => {
    const r = getCatalogSnapshot().recipesById[PEANUT_RECIPE];
    expect(r).toBeDefined();
    expect(isRecipeSafe(r, profile(), getCatalogSnapshot().ingredientsById)).toBe(false);
  });

  it('mode démo : moteur local, offre gratuite limitée à 3 repas, aucun allergène', async () => {
    const planner = createMealPlanner({ remote: null });
    const p = profile();
    const res = await planner.requestMealPlan({ profile: p, weekStart: WEEK, entitlement: 'free', seed: 1 });
    expect(res.source).toBe('local');
    expect(res.plan.meals.length).toBe(3);
    expect(res.plan.weekStart).toBe(WEEK);
    expect(res.durationMs).toBeLessThan(10_000);
    assertAllSafe(res.plan, p);
  });

  it('Premium : tous les créneaux du profil (9)', async () => {
    const planner = createMealPlanner({ remote: null });
    const res = await planner.requestMealPlan({ profile: profile(), weekStart: WEEK, entitlement: 'premium', seed: 2 });
    expect(res.plan.meals.length).toBe(9);
  });

  it('repli local quand la fonction distante échoue', async () => {
    const remote: MealPlanRemote = jest.fn().mockRejectedValue(new Error('réseau indisponible'));
    const planner = createMealPlanner({ remote });
    const res = await planner.requestMealPlan({ profile: profile(), weekStart: WEEK, entitlement: 'premium', seed: 3 });
    expect(remote).toHaveBeenCalledTimes(1);
    expect(res.source).toBe('fallback');
    expect(res.fallbackReason).toContain('réseau');
    expect(res.plan.meals.length).toBe(9);
    // Le corps envoyé ne contient AUCUNE donnée de santé (le serveur lit le profil en base).
    const body = (remote as jest.Mock).mock.calls[0][0];
    expect(JSON.stringify(body)).not.toMatch(/arachides|allerg/);
    expect(body.maxMeals).toBe(14);
  });

  it('repli local sur réponse illisible', async () => {
    const planner = createMealPlanner({ remote: async () => ({ nope: true }) });
    const res = await planner.requestMealPlan({ profile: profile(), weekStart: WEEK, entitlement: 'free' });
    expect(res.source).toBe('fallback');
    expect(res.plan.meals.length).toBe(3);
  });

  it('défense en profondeur : un plat dangereux renvoyé par le serveur est remplacé', async () => {
    const remote: MealPlanRemote = async () => ({
      plan: {
        id: 'plan_srv',
        weekStart: WEEK,
        generatedAt: new Date().toISOString(),
        source: 'ai',
        meals: [
          { id: 'm1', date: WEEK, type: 'diner', recipeId: PEANUT_RECIPE, servings: 3 },
          { id: 'm2', date: WEEK, type: 'diner', recipeId: 'rec_ratatouille', servings: 3 }, // doublon de créneau
          { id: 'm3', date: '1999-01-01', type: 'diner', recipeId: 'rec_ratatouille', servings: 3 }, // hors semaine
        ],
      },
    });
    const p = profile();
    const res = await createMealPlanner({ remote }).requestMealPlan({ profile: p, weekStart: WEEK, entitlement: 'premium' });
    expect(res.source).toBe('remote');
    expect(res.replacedUnsafeMeals).toBe(1);
    expect(res.plan.meals).toHaveLength(1);
    expect(res.plan.meals[0].recipeId).not.toBe(PEANUT_RECIPE);
    assertAllSafe(res.plan, p);
  });

  it('à partir d’aujourd’hui : rien sur un jour passé, les repas passés confiés au serveur gardent leur état', async () => {
    const thursday = addDays(WEEK, 3);
    const local = await createMealPlanner({ remote: null }).requestMealPlan({
      profile: profile(),
      weekStart: WEEK,
      entitlement: 'premium',
      seed: 6,
      fromDate: thursday,
    });
    expect(local.plan.meals.every((m) => m.date >= thursday)).toBe(true);

    const existing: MealPlan = {
      id: 'plan_x',
      weekStart: WEEK,
      generatedAt: new Date().toISOString(),
      source: 'rules',
      meals: [
        { id: 'past', date: WEEK, type: 'diner', recipeId: 'rec_ratatouille', servings: 3 },
        { id: 'keep', date: addDays(WEEK, 4), type: 'diner', recipeId: 'rec_curry_pois_chiches', servings: 3, locked: true },
        { id: 'old', date: addDays(WEEK, 5), type: 'diner', recipeId: 'rec_penne_thon_tomate', servings: 3 },
      ],
    };
    let body: Parameters<MealPlanRemote>[0] | null = null;
    const remote: MealPlanRemote = async (b) => {
      body = b;
      // Le serveur renvoie tout ce qu'on lui a confié comme verrouillé.
      return { plan: { ...existing, meals: b.lockedMeals.map((m) => ({ ...m, locked: true })) } };
    };
    const res = await createMealPlanner({ remote }).requestMealPlan({
      profile: profile(),
      weekStart: WEEK,
      entitlement: 'premium',
      existing,
      fromDate: thursday,
    });
    expect(body).toMatchObject({ fromDate: thursday });
    expect(body!.lockedMeals.map((m) => m.id)).toEqual(['past', 'keep']);
    expect(res.plan.meals.find((m) => m.id === 'past')?.locked).toBeUndefined();
    expect(res.plan.meals.find((m) => m.id === 'keep')?.locked).toBe(true);
  });

  it('réapplique la limite gratuite même si le serveur en renvoie plus', async () => {
    const local = await createMealPlanner({ remote: null }).requestMealPlan({
      profile: profile(),
      weekStart: WEEK,
      entitlement: 'premium',
      seed: 4,
    });
    const res = await createMealPlanner({ remote: async () => ({ plan: local.plan }) }).requestMealPlan({
      profile: profile(),
      weekStart: WEEK,
      entitlement: 'free',
    });
    expect(res.plan.meals.length).toBe(3);
  });

  it('remplacement : refuse un plat non sûr, accepte une alternative proposée', async () => {
    const planner = createMealPlanner({ remote: null });
    const p = profile();
    const { plan } = await planner.requestMealPlan({ profile: p, weekStart: WEEK, entitlement: 'premium', seed: 5 });
    const dinner = plan.meals.find((m) => m.type === 'diner')!;
    const unsafe = planner.swapMeal(plan, dinner.id, PEANUT_RECIPE, p);
    expect(unsafe).toMatchObject({ ok: false, reason: 'unsafe' });

    const alts = planner.alternativesFor(plan, dinner.id, { profile: p });
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.map((r) => r.id)).not.toContain(PEANUT_RECIPE);
    const ok = planner.swapMeal(plan, dinner.id, alts[0].id, p);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.plan.meals.find((m) => m.id === dinner.id)?.recipeId).toBe(alts[0].id);

    expect(planner.swapMeal(plan, 'inconnu', alts[0].id, p)).toMatchObject({ ok: false, reason: 'unknown_meal' });
    expect(planner.swapMeal(plan, dinner.id, 'rec_inexistante', p)).toMatchObject({ ok: false, reason: 'unknown_recipe' });
  });

  it('parseRemotePlan et clampMeals', () => {
    expect(parseRemotePlan(null, WEEK)).toBeNull();
    const parsed = parseRemotePlan(
      { meals: [{ date: WEEK, type: 'diner', recipeId: 'rec_ratatouille', servings: 999, locked: true }] },
      WEEK,
    )!;
    expect(parsed.meals[0]).toMatchObject({ servings: 50, locked: true });
    const clamped = clampMeals(
      {
        ...parsed,
        meals: [
          { id: 'a', date: WEEK, type: 'dejeuner', recipeId: 'x', servings: 2 },
          { id: 'b', date: WEEK, type: 'diner', recipeId: 'y', servings: 2, locked: true },
        ],
      },
      1,
    );
    expect(clamped.meals.map((m) => m.id)).toEqual(['b']);
  });
});

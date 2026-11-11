/// <reference types="jest" />
import { INGREDIENTS_BY_ID as I, RECIPES, RECIPES_BY_ID as R, makeProfile, recipe } from './fixtures';
import {
  DEFAULT_MEAL_SLOTS,
  buildLlmPrompt,
  extractJson,
  generateMealPlan,
  openSlots,
  parseLlmResponse,
  planFromSelection,
  removeMeal,
  replaceMeal,
  selectLlmCandidates,
  setMealLocked,
  setMealServings,
  suggestAlternatives,
  weekSlots,
  type MealEngineInput,
} from '../mealEngine';
import { assertPlanSafe, recipeTotalTime } from '../constraints';
import { isWeekend, weekDates } from '../dates';
import { maxMealsPerWeek } from '../entitlements';
import { mulberry32 } from '../random';
import { ALLERGENS, DIETS, EQUIPMENT, type Allergen, type Diet, type Equipment, type Ingredient, type MealPlan, type Recipe, type UserProfile } from '../types';

const WEEK = '2026-09-14';
const NOW = '2026-09-13T18:00:00.000Z';

function input(o: Partial<MealEngineInput> = {}, profile: Partial<UserProfile> = {}): MealEngineInput {
  return { profile: makeProfile(profile), recipes: RECIPES, ingredientsById: I, weekStart: WEEK, seed: 'test', now: NOW, ...o };
}

const recipeOf = (id: string) => R[id];

describe('generateMealPlan — bases', () => {
  const plan = generateMealPlan(input());

  it('remplit les créneaux par défaut (dîners + déjeuners du week-end)', () => {
    expect(plan.meals).toHaveLength(DEFAULT_MEAL_SLOTS.length);
    expect(plan.weekStart).toBe(WEEK);
    expect(plan.source).toBe('rules');
    expect(plan.generatedAt).toBe(NOW);
    const days = weekDates(WEEK);
    for (const m of plan.meals) {
      expect(days).toContain(m.date);
      expect(recipeOf(m.recipeId).mealTypes).toContain(m.type);
      expect(m.servings).toBe(3); // 2 adultes + 1 enfant = 2,6 → 3
      expect(typeof m.reason).toBe('string');
      expect((m.reason ?? '').length).toBeGreaterThan(3);
    }
    const lunches = plan.meals.filter((m) => m.type === 'dejeuner');
    expect(lunches.every((m) => isWeekend(m.date))).toBe(true);
    // tri chronologique, déjeuner avant dîner
    const keys = plan.meals.map((m) => `${m.date}|${m.type === 'dejeuner' ? 0 : 1}`);
    expect([...keys].sort()).toEqual(keys);
  });

  it('ne répète pas une recette dans la semaine', () => {
    expect(new Set(plan.meals.map((m) => m.recipeId)).size).toBe(plan.meals.length);
  });

  it('respecte le temps max en semaine et le week-end', () => {
    for (const m of plan.meals) {
      const max = isWeekend(m.date) ? 90 : 30;
      expect(recipeTotalTime(recipeOf(m.recipeId))).toBeLessThanOrEqual(max);
    }
  });

  it('est déterministe pour une graine et varie avec la graine', () => {
    expect(generateMealPlan(input())).toEqual(plan);
    const others = ['a', 'b', 'c', 'd', 'e'].map((s) => generateMealPlan(input({ seed: s })).meals.map((m) => m.recipeId).join());
    expect(new Set(others).size).toBeGreaterThan(1);
    expect(generateMealPlan(input({ seed: 42 })).meals[0].id).toMatch(/^meal_[0-9a-z]+$/);
    expect(plan.id).toMatch(/^plan_2026-09-14_/);
  });

  it('graine par défaut = profil + semaine ; horodatage courant par défaut', () => {
    const a = generateMealPlan(input({ seed: undefined, now: undefined }));
    const b = generateMealPlan(input({ seed: undefined, now: undefined }));
    expect(a.meals).toEqual(b.meals);
    expect(Number.isNaN(Date.parse(a.generatedAt))).toBe(false);
  });

  it('les jours de semaine rapides sont expliqués', () => {
    for (const m of plan.meals.filter((x) => !isWeekend(x.date))) expect(m.reason).toMatch(/^Rapide : \d+ min/);
  });
});

describe('generateMealPlan — créneaux et offre gratuite', () => {
  it('offre gratuite : 3 repas max, les plus tôt dans la semaine', () => {
    const plan = generateMealPlan(input({ maxMeals: maxMealsPerWeek('free') }));
    expect(plan.meals.map((m) => `${m.date} ${m.type}`)).toEqual(['2026-09-14 diner', '2026-09-15 diner', '2026-09-16 diner']);
  });

  it('premium : plafonné à 14 repas', () => {
    const all = DEFAULT_MEAL_SLOTS.concat([0, 1, 2, 3, 4].map((d) => ({ weekday: d as 0, type: 'dejeuner' as const })));
    const many: Recipe[] = Array.from({ length: 30 }, (_, i) =>
      recipe(`r${i}`, { title: `R${i}`, ingredients: [{ ingredientId: 'riz', quantity: 100, unit: 'g' }] }),
    );
    const plan = generateMealPlan(input({ recipes: many, maxMeals: maxMealsPerWeek('premium') }, { mealSlots: all }));
    expect(plan.meals).toHaveLength(14);
    expect(generateMealPlan(input({ recipes: many, maxMeals: 99 }, { mealSlots: all })).meals).toHaveLength(14);
  });

  it('maxMeals = 0 → planning vide', () => {
    expect(generateMealPlan(input({ maxMeals: 0 })).meals).toEqual([]);
  });

  it('créneaux personnalisés, dédoublonnés, jours invalides ignorés', () => {
    const slots = weekSlots(
      { mealSlots: [{ weekday: 2, type: 'dejeuner' }, { weekday: 2, type: 'dejeuner' }, { weekday: 9 as 0, type: 'diner' }, { weekday: 0, type: 'diner' }] },
      WEEK,
    );
    expect(slots).toEqual([
      { date: '2026-09-14', type: 'diner' },
      { date: '2026-09-16', type: 'dejeuner' },
    ]);
  });

  it('semaine à cheval sur deux mois et semaine de changement d’heure', () => {
    const p1 = generateMealPlan(input({ weekStart: '2026-09-28' }));
    expect(p1.meals.map((m) => m.date)).toContain('2026-10-04');
    const p2 = generateMealPlan(input({ weekStart: '2026-10-19' }));
    expect(p2.meals.filter((m) => m.date === '2026-10-25')).toHaveLength(2);
    const p3 = generateMealPlan(input({ weekStart: '2026-03-23' }));
    expect(p3.meals.filter((m) => m.date === '2026-03-29')).toHaveLength(2);
  });
});

describe('generateMealPlan — repas verrouillés', () => {
  const base = generateMealPlan(input());
  const wedDinner = base.meals.find((m) => m.date === '2026-09-16' && m.type === 'diner') as MealPlan['meals'][number];

  it('conserve les repas verrouillés tels quels', () => {
    const existing: MealPlan = {
      ...base,
      meals: base.meals.map((m) =>
        m.id === wedDinner.id ? { ...m, recipeId: 'boeuf_bourguignon', locked: true, servings: 6, reason: 'Le plat du mercredi' } : m,
      ),
    };
    const plan = generateMealPlan(input({ existing, seed: 'autre' }));
    const kept = plan.meals.find((m) => m.id === wedDinner.id);
    expect(kept).toEqual({ ...wedDinner, recipeId: 'boeuf_bourguignon', locked: true, servings: 6, reason: 'Le plat du mercredi' });
    expect(plan.meals.filter((m) => m.recipeId === 'boeuf_bourguignon')).toHaveLength(1);
    expect(plan.meals).toHaveLength(base.meals.length);
    expect(plan.id).toBe(base.id); // même semaine → même id de planning
  });

  it('retire un repas verrouillé devenu dangereux et remplit le créneau', () => {
    const existing: MealPlan = {
      ...base,
      meals: [{ ...wedDinner, recipeId: 'pad_thai', locked: true }],
    };
    const plan = generateMealPlan(input({ existing }, { allergens: ['arachides'] }));
    expect(plan.meals.some((m) => m.recipeId === 'pad_thai')).toBe(false);
    expect(plan.meals.some((m) => m.date === '2026-09-16' && m.type === 'diner')).toBe(true);
  });

  it('ignore les verrouillés hors semaine, en doublon ou de recette inconnue', () => {
    const existing: MealPlan = {
      ...base,
      id: 'old_plan',
      weekStart: '2026-09-07',
      meals: [
        { id: 'old', date: '2026-09-08', type: 'diner', recipeId: 'dahl', servings: 3, locked: true },
        { id: 'x1', date: '2026-09-14', type: 'diner', recipeId: 'dahl', servings: 3, locked: true },
        { id: 'x2', date: '2026-09-14', type: 'diner', recipeId: 'omelette', servings: 3, locked: true },
        { id: 'x3', date: '2026-09-15', type: 'diner', recipeId: 'supprimee', servings: 3, locked: true },
      ],
    };
    const plan = generateMealPlan(input({ existing }));
    expect(plan.meals.find((m) => m.id === 'old')).toBeUndefined();
    expect(plan.meals.find((m) => m.id === 'x1')?.recipeId).toBe('dahl');
    expect(plan.meals.find((m) => m.id === 'x2')).toBeUndefined();
    expect(plan.meals.find((m) => m.id === 'x3')).toBeUndefined();
    expect(plan.id).not.toBe('old_plan'); // autre semaine → nouvel id
  });

  it('les verrouillés comptent dans la limite gratuite', () => {
    const existing: MealPlan = { ...base, meals: [{ ...wedDinner, locked: true }] };
    const plan = generateMealPlan(input({ existing, maxMeals: 3 }));
    expect(plan.meals).toHaveLength(3);
    expect(plan.meals.map((m) => m.date)).toEqual(['2026-09-14', '2026-09-15', '2026-09-16']);
  });
});

describe('generateMealPlan — à partir d’aujourd’hui (fromDate)', () => {
  const thursday = '2026-09-17';

  it('aucun créneau passé n’est rempli, y compris en offre gratuite', () => {
    const free = generateMealPlan(input({ maxMeals: 3, fromDate: thursday }));
    expect(free.meals.map((m) => `${m.date}|${m.type}`)).toEqual(['2026-09-17|diner', '2026-09-18|diner', '2026-09-19|dejeuner']);
    const all = generateMealPlan(input({ fromDate: thursday }));
    expect(all.meals.every((m) => m.date >= thursday)).toBe(true);
    expect(all.meals).toHaveLength(DEFAULT_MEAL_SLOTS.filter((s) => s.weekday >= 3).length);
    expect(openSlots(input({ fromDate: thursday })).every((s) => s.date >= thursday)).toBe(true);
    // Semaine à venir : fromDate antérieur, sans effet.
    expect(generateMealPlan(input({ fromDate: '2026-09-10' })).meals).toEqual(generateMealPlan(input()).meals);
  });

  it('les repas des jours passés sont conservés comme s’ils étaient verrouillés, et comptent dans la limite', () => {
    const base = generateMealPlan(input());
    const past = base.meals.filter((m) => m.date < thursday);
    const plan = generateMealPlan(input({ existing: base, seed: 'autre', fromDate: thursday }));
    for (const m of past) expect(plan.meals.find((x) => x.id === m.id)).toEqual(m);
    expect(plan.meals).toHaveLength(base.meals.length);
    // Gratuit : 3 repas déjà passés → rien de plus à planifier.
    const free = generateMealPlan(input({ existing: base, maxMeals: 3, fromDate: thursday }));
    expect(free.meals).toEqual(past.slice(0, 3));
  });

  it('parseLlmResponse refuse un créneau passé', () => {
    const inp = input({ fromDate: thursday });
    const candidates = selectLlmCandidates(inp, 60);
    const dinner = candidates.find((r) => r.mealTypes.includes('diner'))!;
    const sel = parseLlmResponse(JSON.stringify({ meals: [{ date: '2026-09-15', type: 'diner', recipeId: dinner.id }] }), inp, candidates);
    expect(sel?.meals).toEqual([]);
  });
});

describe('generateMealPlan — contraintes et relâchement', () => {
  it('n’inclut jamais un allergène déclaré', () => {
    const plan = generateMealPlan(input({}, { allergens: ['gluten', 'lait'] }));
    expect(plan.meals.length).toBeGreaterThan(0);
    for (const m of plan.meals) {
      for (const x of recipeOf(m.recipeId).ingredients) {
        expect(I[x.ingredientId].allergens).not.toContain('gluten');
        expect(I[x.ingredientId].allergens).not.toContain('lait');
      }
    }
  });

  it('vegan : relâche la répétition plutôt que la sécurité', () => {
    const plan = generateMealPlan(input({}, { diets: ['vegan'] }));
    expect(plan.meals).toHaveLength(9);
    const ids = plan.meals.map((m) => m.recipeId);
    expect(new Set(ids).size).toBeLessThan(ids.length); // 7 recettes vegan pour 9 créneaux
    expect(assertPlanSafe(plan, R, makeProfile({ diets: ['vegan'] }), I).ok).toBe(true);
  });

  it('aucune recette sûre pour un type de repas → créneau laissé vide', () => {
    const plan = generateMealPlan(input({ recipes: [R.moules_marinieres] }));
    expect(plan.meals).toHaveLength(7); // dîners uniquement
    expect(plan.meals.every((m) => m.type === 'diner')).toBe(true);
    expect(generateMealPlan(input({ recipes: [R.moules_marinieres] }, { allergens: ['mollusques'] })).meals).toEqual([]);
  });

  it('relâche le temps (raison explicite) puis les ustensiles', () => {
    const slow = recipe('lent', { title: 'Lent', prepTimeMin: 60, cookTimeMin: 60, ingredients: [{ ingredientId: 'riz', quantity: 1, unit: 'g' }] });
    const plan = generateMealPlan(input({ recipes: [slow], maxMeals: 1 }));
    expect(plan.meals[0].recipeId).toBe('lent');
    expect(plan.meals[0].reason).toMatch(/^Un peu plus long : 120 min/);
    const oven = recipe('four', { title: 'Four', equipment: ['four'], ingredients: [{ ingredientId: 'riz', quantity: 1, unit: 'g' }] });
    const p2 = generateMealPlan(input({ recipes: [oven], maxMeals: 2 }, { equipment: ['plaques'] }));
    expect(p2.meals.map((m) => m.recipeId)).toEqual(['four', 'four']);
  });

  it('évite les ingrédients détestés tant que possible', () => {
    const plan = generateMealPlan(input({}, { dislikedIngredientIds: ['oignon'] }));
    for (const m of plan.meals) {
      expect(recipeOf(m.recipeId).ingredients.some((x) => x.ingredientId === 'oignon' && !x.optional)).toBe(false);
    }
    const onlyOnion = generateMealPlan(input({ recipes: [R.pates_tomate], maxMeals: 1 }, { dislikedIngredientIds: ['oignon'] }));
    expect(onlyOnion.meals[0].recipeId).toBe('pates_tomate'); // dernier recours
  });

  it('petit budget : évite les plats chers', () => {
    const plan = generateMealPlan(input({}, { weeklyBudgetCents: 3000 }));
    expect(plan.meals.every((m) => recipeOf(m.recipeId).costLevel < 3)).toBe(true);
    // budget inconnu : cible moyenne, planning complet
    expect(generateMealPlan(input({}, { weeklyBudgetCents: 0 })).meals).toHaveLength(9);
    // gros budget : tout est permis
    expect(generateMealPlan(input({}, { weeklyBudgetCents: 100000, household: { adults: 1, children: 0 } })).meals).toHaveLength(9);
  });

  it('privilégie les cuisines préférées et l’explique', () => {
    const plan = generateMealPlan(input({}, { favoriteCuisines: ['indienne'] }));
    const indian = plan.meals.filter((m) => recipeOf(m.recipeId).cuisine === 'indienne');
    expect(indian.length).toBeGreaterThanOrEqual(2);
    expect(indian.some((m) => (m.reason ?? '').includes('Cuisine indienne, ta préférée'))).toBe(true);
  });

  it('bonus placard anti-gaspi', () => {
    const plan = generateMealPlan(input({ pantryIngredientIds: ['lentilles', 'lait_coco', 'tomate', 'oignon'] }));
    expect(plan.meals.some((m) => m.recipeId === 'dahl')).toBe(true);
    expect(plan.meals.some((m) => (m.reason ?? '').includes('Anti-gaspi'))).toBe(true);
  });

  it('végétarien et de saison', () => {
    const plan = generateMealPlan(input({}, { diets: ['vegetarien'] }));
    expect(plan.meals.some((m) => (m.reason ?? '').includes('Végétarien et de saison'))).toBe(true);
  });

  it('pénalise les recettes récentes', () => {
    const first = generateMealPlan(input());
    const ids = first.meals.map((m) => m.recipeId);
    const second = generateMealPlan(input({ recentRecipeIds: ids }));
    const overlap = second.meals.filter((m) => ids.includes(m.recipeId)).length;
    expect(overlap).toBeLessThan(ids.length);
  });

  it('varie les protéines d’un jour à l’autre', () => {
    for (const seed of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']) {
      const dinners = generateMealPlan(input({ seed })).meals.filter((m) => m.type === 'diner');
      for (let i = 1; i < dinners.length; i++) {
        const prot = (id: string) =>
          recipeOf(id).ingredients.find((x) => I[x.ingredientId].isMeat || I[x.ingredientId].isFish || I[x.ingredientId].isSeafood)
            ?.ingredientId;
        const a = prot(dinners[i - 1].recipeId);
        if (a) expect(prot(dinners[i].recipeId)).not.toBe(a);
      }
    }
  });

  it('raisons de repli (week-end mijoté, facile, varier)', () => {
    const slowWeekend = recipe('mijote', {
      title: 'Mijoté',
      prepTimeMin: 20,
      cookTimeMin: 60,
      costLevel: 2,
      ingredients: [{ ingredientId: 'riz', quantity: 1, unit: 'g' }],
    });
    const plan = generateMealPlan(input({ recipes: [slowWeekend] }, { mealSlots: [{ weekday: 5, type: 'diner' }] }));
    expect(plan.meals[0].reason).toBe('Un plat à mijoter le week-end');
    const easy = recipe('facile', { title: 'Facile', costLevel: 2, prepTimeMin: 20, cookTimeMin: 0, ingredients: [{ ingredientId: 'riz', quantity: 1, unit: 'g' }] });
    expect(generateMealPlan(input({ recipes: [easy] }, { mealSlots: [{ weekday: 5, type: 'diner' }] })).meals[0].reason).toBe('Facile à réaliser');
    const hard = { ...easy, id: 'dur', difficulty: 3 as const };
    expect(generateMealPlan(input({ recipes: [hard] }, { mealSlots: [{ weekday: 5, type: 'diner' }] })).meals[0].reason).toBe('Pour varier ta semaine');
  });

  it('génère une semaine en bien moins de 10 s sur un gros catalogue', () => {
    const rand = mulberry32(1);
    const ids = Object.keys(I);
    const big: Recipe[] = Array.from({ length: 3000 }, (_, i) =>
      recipe(`big_${i}`, {
        title: `Recette ${i}`,
        cuisine: (['francaise', 'italienne', 'asiatique', 'indienne'] as const)[i % 4],
        costLevel: ((i % 3) + 1) as 1 | 2 | 3,
        ingredients: Array.from({ length: 6 }, () => ({ ingredientId: ids[Math.floor(rand() * ids.length)], quantity: 100, unit: 'g' as const })),
      }),
    );
    const t0 = Date.now();
    const plan = generateMealPlan(input({ recipes: big, maxMeals: 14 }, { allergens: ['gluten'], mealSlots: [] }));
    const elapsed = Date.now() - t0;
    expect(plan.meals.length).toBe(9);
    expect(elapsed).toBeLessThan(3000);
  });
});

describe('remplacement de plat', () => {
  const inp = input({}, { allergens: ['arachides'] });
  const plan = generateMealPlan(inp);
  const target = plan.meals[0];

  it('suggestAlternatives : sûres, bon type, hors planning, triées', () => {
    const alts = suggestAlternatives(inp, plan, target.id);
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.length).toBeLessThanOrEqual(6);
    const inPlan = new Set(plan.meals.map((m) => m.recipeId));
    for (const r of alts) {
      expect(inPlan.has(r.id)).toBe(false);
      expect(r.mealTypes).toContain(target.type);
      expect(r.id).not.toBe('pad_thai');
    }
    // les recettes trop longues pour un soir de semaine passent après
    const firstSlowIdx = alts.findIndex((r) => recipeTotalTime(r) > 30);
    if (firstSlowIdx >= 0) expect(alts.slice(firstSlowIdx).every((r) => recipeTotalTime(r) > 30 || r.equipment.length > 0)).toBe(true);
    expect(suggestAlternatives(inp, plan, target.id, 2)).toHaveLength(2);
    expect(suggestAlternatives(inp, plan, 'inconnu')).toEqual([]);
    expect(suggestAlternatives(inp, plan, target.id, -1)).toEqual([]);
  });

  it('replaceMeal est immuable', () => {
    const next = replaceMeal(plan, target.id, 'dahl');
    expect(next).not.toBe(plan);
    expect(next.meals.find((m) => m.id === target.id)).toMatchObject({ recipeId: 'dahl', reason: 'Choisi par toi' });
    expect(plan.meals[0].recipeId).toBe(target.recipeId);
    expect(replaceMeal(plan, 'inconnu', 'dahl')).toBe(plan);
  });

  it('verrouillage, portions, suppression', () => {
    expect(setMealLocked(plan, target.id, true).meals[0].locked).toBe(true);
    expect(setMealServings(plan, target.id, 0).meals[0].servings).toBe(1);
    expect(setMealServings(plan, target.id, 4.4).meals[0].servings).toBe(4);
    expect(removeMeal(plan, target.id).meals).toHaveLength(plan.meals.length - 1);
    expect(plan.meals).toHaveLength(9);
  });
});

describe('mode IA', () => {
  const inp = input({ maxMeals: 3 }, { allergens: ['arachides'], diets: ['sans_porc'], favoriteCuisines: ['italienne'] });
  const candidates = selectLlmCandidates(inp, 12);

  it('selectLlmCandidates : sûrs, du bon type, limités', () => {
    expect(candidates.length).toBeLessThanOrEqual(12);
    expect(candidates.length).toBeGreaterThan(3);
    for (const r of candidates) {
      expect(r.id).not.toBe('pad_thai');
      expect(r.id).not.toBe('carbonara');
    }
    expect(selectLlmCandidates(inp, 0)).toEqual([]);
    expect(selectLlmCandidates(input({ maxMeals: 0 }))).toEqual([]); // aucun créneau ouvert
  });

  it('buildLlmPrompt : français, JSON strict, candidats et créneaux, sans données de santé', () => {
    const { system, user } = buildLlmPrompt(
      { ...inp, pantryIngredientIds: ['riz', 'inconnu'], recentRecipeIds: ['omelette'] },
      candidates,
    );
    expect(system).toContain('JSON');
    expect(system).toContain('"meals"');
    expect(system).toContain('UNIQUEMENT');
    expect(user).toContain('14 – 20 sept.');
    expect(user).toContain('2026-09-14 diner (Lundi soir)');
    expect(user).not.toContain('2026-09-17');
    for (const r of candidates) expect(user).toContain(`${r.id} | ${r.title}`);
    expect(user).toContain('Italienne');
    expect(user).toContain('riz');
    expect(user).toContain('omelette');
    expect(user).toContain('80,00');
    const all = `${system}\n${user}`.toLowerCase();
    expect(all).not.toContain('arachide');
    expect(all).not.toContain('porc');
    // seule la mention générique « déjà filtrés pour les allergies » subsiste
    expect(user.toLowerCase()).not.toContain('allerg');
    // profil minimal (sans préférences ni budget)
    const bare = buildLlmPrompt(input({}, { favoriteCuisines: [], weeklyBudgetCents: 0 }), []);
    expect(bare.user).not.toContain('Cuisines préférées');
    expect(bare.user).not.toContain('Budget');
  });

  it('parseLlmResponse : tolérant au texte autour, strict sur le contenu', () => {
    const safeIds = candidates.map((r) => r.id);
    const text = [
      'Voici ta semaine !',
      '```json',
      JSON.stringify({
        meals: [
          { date: '2026-09-14', type: 'diner', recipeId: safeIds[0], reason: '  Rapide et bon  ' },
          { date: '2026-09-14', type: 'diner', recipeId: safeIds[1] }, // créneau en double
          { date: '2026-09-15', type: 'diner', recipeId: safeIds[0] }, // recette en double
          { date: '2026-09-15', type: 'diner', recipeId: 'pad_thai' }, // inconnu des candidats (et dangereux)
          { date: '2026-09-15', type: 'diner', recipeId: 'invente_123' },
          { date: '2026-09-18', type: 'diner', recipeId: safeIds[2] }, // hors créneaux (gratuit : 3 repas)
          { date: '2026-09-15', type: 'brunch', recipeId: safeIds[2] },
          { date: 20260915, type: 'diner', recipeId: safeIds[2] },
          null,
          'texte',
          { date: '2026-09-15', type: 'diner', recipeId: safeIds[2], reason: 42 },
        ],
      }),
      '```',
      'Bon appétit {pas du json}',
    ].join('\n');
    const res = parseLlmResponse(text, inp, candidates);
    expect(res).toEqual({
      meals: [
        { date: '2026-09-14', type: 'diner', recipeId: safeIds[0], reason: 'Rapide et bon' },
        { date: '2026-09-15', type: 'diner', recipeId: safeIds[2] },
      ],
    });
  });

  it('parseLlmResponse : revalide la sécurité même si le candidat est dangereux', () => {
    const res = parseLlmResponse(
      JSON.stringify({ meals: [{ date: '2026-09-14', type: 'diner', recipeId: 'pad_thai' }] }),
      inp,
      [R.pad_thai],
    );
    expect(res).toEqual({ meals: [] });
  });

  it('parseLlmResponse : type de repas incompatible et repas verrouillé', () => {
    const lunchOnly = R.salade_courgette;
    expect(
      parseLlmResponse(JSON.stringify([{ date: '2026-09-14', type: 'diner', recipeId: lunchOnly.id }]), inp, [lunchOnly]),
    ).toEqual({ meals: [] });
    const existing: MealPlan = {
      id: 'p',
      weekStart: WEEK,
      generatedAt: NOW,
      source: 'rules',
      meals: [{ id: 'l', date: '2026-09-14', type: 'diner', recipeId: 'dahl', servings: 3, locked: true }],
    };
    const res = parseLlmResponse(
      JSON.stringify({ meals: [{ date: '2026-09-15', type: 'diner', recipeId: 'dahl' }] }),
      { ...inp, existing },
      [R.dahl],
    );
    expect(res).toEqual({ meals: [] }); // déjà utilisée par le repas verrouillé
  });

  it('parseLlmResponse : null si pas de JSON exploitable', () => {
    expect(parseLlmResponse('Désolé, je ne peux pas.', inp, candidates)).toBeNull();
    expect(parseLlmResponse('{"plats": []}', inp, candidates)).toBeNull();
    expect(parseLlmResponse('{"meals": "non"}', inp, candidates)).toBeNull();
    expect(parseLlmResponse('', inp, candidates)).toBeNull();
    expect(parseLlmResponse('42', inp, candidates)).toBeNull();
  });

  it('extractJson trouve l’objet même avec des accolades parasites', () => {
    expect(extractJson('blabla {"a": 1} fin }')).toEqual({ a: 1 });
    expect(extractJson('[1,2] et {')).toEqual([1, 2]);
    expect(extractJson('{ cassé')).toBeUndefined();
  });

  it('planFromSelection : respecte la sélection et complète avec les règles', () => {
    const sel = { meals: [{ date: '2026-09-15', type: 'diner' as const, recipeId: candidates[0].id, reason: 'Choix du chef' }] };
    const plan = planFromSelection(inp, sel, 'ai');
    expect(plan.source).toBe('ai');
    expect(plan.meals).toHaveLength(3);
    expect(plan.meals[1]).toMatchObject({ date: '2026-09-15', recipeId: candidates[0].id, reason: 'Choix du chef' });
    expect(new Set(plan.meals.map((m) => m.recipeId)).size).toBe(3);
    // tableau directement accepté, raison absente → raison calculée, doublons ignorés
    const plan2 = planFromSelection(
      inp,
      [
        { date: '2026-09-14', type: 'diner', recipeId: 'dahl' },
        { date: '2026-09-14', type: 'diner', recipeId: 'omelette' },
        { date: '2026-09-16', type: 'diner', recipeId: 'pad_thai' }, // dangereux → ignoré
      ],
      'ai',
    );
    expect(plan2.meals[0].recipeId).toBe('dahl');
    expect(plan2.meals[0].reason).toBeTruthy();
    expect(plan2.meals.some((m) => m.recipeId === 'pad_thai')).toBe(false);
    expect(plan2.meals).toHaveLength(3);
  });

  it('openSlots exclut les verrouillés', () => {
    const existing: MealPlan = {
      id: 'p',
      weekStart: WEEK,
      generatedAt: NOW,
      source: 'rules',
      meals: [{ id: 'l', date: '2026-09-14', type: 'diner', recipeId: 'dahl', servings: 3, locked: true }],
    };
    expect(openSlots({ ...inp, existing })).toEqual([
      { date: '2026-09-15', type: 'diner' },
      { date: '2026-09-16', type: 'diner' },
    ]);
  });
});

// ─── Test de propriété : 200 profils aléatoires ──────────────────────────────

/** Vérification INDÉPENDANTE de constraints.ts (réimplémentation volontaire). */
function violatesProfile(r: Recipe, p: UserProfile, ings: Record<string, Ingredient>): string | null {
  const list = r.ingredients.map((x) => ings[x.ingredientId]);
  if (list.some((x) => !x)) return 'ingrédient inconnu';
  for (const ing of list) {
    for (const a of ing.allergens) if (p.allergens.includes(a)) return `allergène ${a}`;
    for (const d of p.diets) {
      const animalFlesh = ing.isMeat || ing.isPork || ing.isFish || ing.isSeafood;
      const bad =
        (d === 'vegetarien' && animalFlesh) ||
        (d === 'vegan' && (animalFlesh || ing.isAnimalProduct)) ||
        (d === 'pescetarien' && (ing.isMeat || ing.isPork)) ||
        (d === 'halal' && (ing.isPork || !!ing.isAlcohol)) ||
        (d === 'casher' && (ing.isPork || ing.isSeafood)) ||
        (d === 'sans_porc' && ing.isPork) ||
        (d === 'sans_gluten' && ing.allergens.includes('gluten')) ||
        (d === 'sans_lactose' && ing.allergens.includes('lait'));
      if (bad) return `régime ${d} (${ing.id})`;
    }
  }
  if (p.diets.includes('casher') && list.some((i) => i.isMeat) && list.some((i) => i.allergens.includes('lait'))) {
    return 'casher viande + lait';
  }
  return null;
}

describe('propriété : aucun planning ne viole allergies ou régimes', () => {
  it('200 profils aléatoires (graine fixe)', () => {
    const rand = mulberry32(20260914);
    const pick = <T,>(xs: readonly T[], p: number) => xs.filter(() => rand() < p);
    // Catalogue piégé : une recette à ingrédient inconnu ne doit jamais sortir.
    const trap = recipe('piege', { title: 'Piège', ingredients: [{ ingredientId: 'ingredient_inconnu', quantity: 1, unit: 'g' }] });
    const catalog = [...RECIPES, trap];
    let totalMeals = 0;
    let llmAccepted = 0;
    for (let i = 0; i < 200; i++) {
      const profile = makeProfile({
        id: `user_${i}`,
        household: { adults: 1 + Math.floor(rand() * 3), children: Math.floor(rand() * 3) },
        allergens: pick(ALLERGENS, 0.2) as Allergen[],
        diets: pick(DIETS, 0.15) as Diet[],
        equipment: pick(EQUIPMENT, 0.5) as Equipment[],
        dislikedIngredientIds: pick(Object.keys(I), 0.05),
        favoriteCuisines: pick(['francaise', 'italienne', 'asiatique', 'indienne'] as const, 0.3),
        weeklyBudgetCents: Math.floor(rand() * 15000),
        maxCookTimeWeekdayMin: 10 + Math.floor(rand() * 50),
        maxCookTimeWeekendMin: 20 + Math.floor(rand() * 120),
        mealSlots: rand() < 0.5 ? [] : pick(DEFAULT_MEAL_SLOTS.concat([{ weekday: 1, type: 'dejeuner' }]), 0.6),
      });
      const inp: MealEngineInput = {
        profile,
        recipes: catalog,
        ingredientsById: I,
        weekStart: WEEK,
        seed: i,
        now: NOW,
        maxMeals: rand() < 0.3 ? 3 : undefined,
        pantryIngredientIds: pick(Object.keys(I), 0.1),
      };
      const plan = generateMealPlan(inp);
      totalMeals += plan.meals.length;
      for (const m of plan.meals) {
        const r = catalog.find((x) => x.id === m.recipeId) as Recipe;
        expect(violatesProfile(r, profile, I)).toBeNull();
      }
      expect(assertPlanSafe(plan, Object.fromEntries(catalog.map((r) => [r.id, r])), profile, I).ok).toBe(true);

      // Réponse IA adversariale : le LLM propose n'importe quelle recette.
      const slots = openSlots(inp);
      const adversarial = JSON.stringify({
        meals: slots.map((s) => ({ ...s, recipeId: catalog[Math.floor(rand() * catalog.length)].id })),
      });
      const sel = parseLlmResponse(adversarial, inp, catalog);
      expect(sel).not.toBeNull();
      llmAccepted += sel?.meals.length ?? 0;
      const aiPlan = planFromSelection(inp, sel ?? { meals: [] }, 'ai');
      for (const m of aiPlan.meals) {
        const r = catalog.find((x) => x.id === m.recipeId) as Recipe;
        expect(violatesProfile(r, profile, I)).toBeNull();
      }
    }
    // Le test doit réellement exercer le moteur.
    expect(totalMeals).toBeGreaterThan(500);
    expect(llmAccepted).toBeGreaterThan(50);
  });
});

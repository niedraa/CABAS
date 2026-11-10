/**
 * Test d'intégration de generate-meal-plan sur le VRAI catalogue de
 * démonstration (src/data : 70 recettes, 146 ingrédients), avec un LLM
 * ADVERSAIRE qui tente d'imposer des recettes dangereuses.
 *
 * Critères du dossier vérifiés à l'échelle réelle :
 *  - aucun plat contenant un allergène déclaré / incompatible avec un régime,
 *    pour CHAQUE allergène et CHAQUE régime ;
 *  - planning généré bien en dessous de 10 s.
 *
 * Les fichiers de src/data n'importent que des types (`import type … from
 * '../core/types'`, sans extension) : on retire ces lignes et on les charge
 * comme modules `data:` TypeScript (Deno), sans dépendre des sloppy imports.
 */
import { assert, assertEquals } from '@std/assert';
import type { Allergen, Diet, Ingredient, Recipe, UserProfile } from '../_shared/core/index.ts';
import { ALLERGENS, checkRecipe, DIETS } from '../_shared/core/index.ts';
import { silentLogger } from '../_shared/logger.ts';
import { fakeLlm, parsePrompt, profileFixture } from '../_shared/testing/fixtures.ts';
import { createGenerateMealPlanHandler, type MealPlanRepository } from './handler.ts';

const DATA_DIR = new URL('../../../src/data/', import.meta.url);

async function loadDataModule<T>(file: string): Promise<T> {
  const source = await Deno.readTextFile(new URL(file, DATA_DIR));
  const stripped = source.replace(/^import type [^;]+;\s*$/gm, '');
  const url = `data:application/typescript;base64,${btoa(String.fromCharCode(...new TextEncoder().encode(stripped)))}`;
  return await import(url) as T;
}

const { ingredients } = await loadDataModule<{ ingredients: Ingredient[] }>('ingredients.ts');
const { recipes } = await loadDataModule<{ recipes: Recipe[] }>('recipes.ts');
const ingredientsById: Record<string, Ingredient> = Object.fromEntries(ingredients.map((i) => [i.id, i]));
const recipesById: Record<string, Recipe> = Object.fromEntries(recipes.map((r) => [r.id, r]));

const WEEK = '2026-11-16';

function repoFor(profile: UserProfile): MealPlanRepository {
  return {
    loadProfile: () => Promise.resolve(profile),
    loadEntitlement: () => Promise.resolve('premium'),
    loadCatalog: () => Promise.resolve({ recipes, ingredients }),
    loadPlan: () => Promise.resolve(null),
    savePlan: (plan) => Promise.resolve(plan.id),
  };
}

/** LLM adversaire : remplit chaque créneau avec une recette du CATALOGUE COMPLET (dangereuses comprises). */
function adversarialLlm(seed: number) {
  return fakeLlm((prompt) => {
    const { slots } = parsePrompt(prompt);
    const meals = slots.map((s, i) => ({
      ...s,
      recipeId: recipes[(seed * 7 + i * 13) % recipes.length].id,
      reason: 'Hé hé',
    }));
    return JSON.stringify({ meals });
  });
}

async function generate(profile: UserProfile, seed: number) {
  const handler = createGenerateMealPlanHandler({
    logger: silentLogger,
    llm: adversarialLlm(seed),
    now: () => new Date('2026-11-10T09:00:00.000Z'),
    authenticate: () => Promise.resolve({ userId: profile.id, repo: repoFor(profile) }),
  });
  const res = await handler(new Request('http://x', { method: 'POST', body: JSON.stringify({ weekStart: WEEK }) }));
  assertEquals(res.status, 200);
  return await res.json();
}

function assertSafe(plan: { meals: { recipeId: string }[] }, profile: UserProfile, label: string) {
  for (const m of plan.meals) {
    const recipe = recipesById[m.recipeId];
    assert(recipe, `${label} : recette inconnue ${m.recipeId}`);
    const check = checkRecipe(recipe, profile, ingredientsById);
    assert(check.safe, `${label} : ${recipe.id} non sûr → ${check.violations.map((v) => v.detail).join(', ')}`);
  }
}

Deno.test('catalogue réel chargé', () => {
  assert(recipes.length >= 60, `${recipes.length} recettes`);
  assert(ingredients.length >= 100);
});

Deno.test('catalogue réel : chaque allergène déclaré est exclu, même face à un LLM adversaire', async () => {
  for (const [i, allergen] of ALLERGENS.entries()) {
    const profile = profileFixture({ allergens: [allergen as Allergen], diets: [] });
    const { plan, meta } = await generate(profile, i);
    assertSafe(plan, profile, `allergie ${allergen}`);
    assert(plan.meals.length > 0, `allergie ${allergen} : planning vide`);
    assertEquals(meta.safety.unsafeMealsReplaced, 0, 'le moteur ne doit jamais produire de plat dangereux');
  }
});

Deno.test('catalogue réel : chaque régime respecté, même face à un LLM adversaire', async () => {
  for (const [i, diet] of DIETS.entries()) {
    const profile = profileFixture({ allergens: [], diets: [diet as Diet] });
    const { plan } = await generate(profile, 100 + i);
    assertSafe(plan, profile, `régime ${diet}`);
    assert(plan.meals.length > 0, `régime ${diet} : planning vide`);
  }
});

Deno.test('catalogue réel : profils combinés (allergies multiples + régimes) — 200 tirages', async () => {
  let rejectedTotal = 0;
  for (let n = 0; n < 200; n++) {
    const allergens = ALLERGENS.filter((_, i) => (n * 31 + i * 17) % 5 === 0) as Allergen[];
    const diets = DIETS.filter((_, i) => (n * 11 + i * 7) % 6 === 0) as Diet[];
    const profile = profileFixture({ allergens, diets, household: { adults: 1 + (n % 3), children: n % 2 } });
    const { plan, meta } = await generate(profile, n);
    assertSafe(plan, profile, `tirage ${n} (${allergens.join('+')} / ${diets.join('+')})`);
    rejectedTotal += meta.llm.rejectedMeals ?? 0;
  }
  assert(rejectedTotal > 0, 'le LLM adversaire a bien proposé des plats rejetés');
});

Deno.test('catalogue réel : génération bien sous 10 s (repli règles compris)', async () => {
  const profile = profileFixture({ allergens: ['gluten', 'lait'], diets: ['halal'] });
  const started = performance.now();
  const { meta } = await generate(profile, 1);
  const elapsed = performance.now() - started;
  assert(elapsed < 1000, `${elapsed.toFixed(0)} ms`);
  assert(meta.timings.totalMs < 10_000);
});

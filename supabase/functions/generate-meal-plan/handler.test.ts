import { assert, assertEquals, assertExists, assertFalse } from '@std/assert';
import type { Entitlement, MealPlan, UserProfile } from '../_shared/core/index.ts';
import { generateMealPlan } from '../_shared/core/index.ts';
import { LlmError } from '../_shared/anthropic.ts';
import { HttpError } from '../_shared/http.ts';
import { silentLogger } from '../_shared/logger.ts';
import {
  type FakeLlm,
  fakeLlm,
  INGREDIENTS,
  INGREDIENTS_BY_ID,
  never,
  PEANUT_RECIPE_ID,
  profileFixture,
  RECIPES,
  wellBehavedLlm,
} from '../_shared/testing/fixtures.ts';
import { createGenerateMealPlanHandler, type GenerateMealPlanDeps, type MealPlanRepository } from './handler.ts';

const WEEK = '2026-11-16';
const NOW = new Date('2026-11-10T09:00:00.000Z');

interface FakeRepo extends MealPlanRepository {
  saved: MealPlan[];
}

function fakeRepo(opts: {
  profile?: UserProfile | null;
  entitlement?: Entitlement;
  stored?: MealPlan | null;
  saveFails?: boolean;
} = {}): FakeRepo {
  const saved: MealPlan[] = [];
  return {
    saved,
    loadProfile: () => Promise.resolve(opts.profile === undefined ? profileFixture() : opts.profile),
    loadEntitlement: () => Promise.resolve(opts.entitlement ?? 'premium'),
    loadCatalog: () => Promise.resolve({ recipes: RECIPES, ingredients: INGREDIENTS }),
    loadPlan: () => Promise.resolve(opts.stored ?? null),
    savePlan(plan) {
      if (opts.saveFails) return Promise.reject(new Error('db down'));
      saved.push(plan);
      return Promise.resolve(opts.stored?.id ?? plan.id);
    },
  };
}

function handlerWith(repo: MealPlanRepository, llm: FakeLlm | null, extra: Partial<GenerateMealPlanDeps> = {}) {
  return createGenerateMealPlanHandler({
    logger: silentLogger,
    llm,
    now: () => NOW,
    authenticate: () => Promise.resolve({ userId: 'user-a', repo }),
    ...extra,
  });
}

function post(body: unknown): Request {
  return new Request('http://localhost/generate-meal-plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

// deno-lint-ignore no-explicit-any
async function call(handler: (r: Request) => Promise<Response>, body: unknown): Promise<{ status: number; data: any }> {
  const res = await handler(post(body));
  return { status: res.status, data: await res.json() };
}

function assertNoPeanuts(plan: MealPlan) {
  assertFalse(plan.meals.some((m) => m.recipeId === PEANUT_RECIPE_ID), 'un plat aux arachides a été proposé');
  for (const m of plan.meals) {
    const r = RECIPES.find((x) => x.id === m.recipeId);
    assertExists(r, `recette inconnue ${m.recipeId}`);
    for (const ri of r.ingredients) {
      assertFalse(INGREDIENTS_BY_ID[ri.ingredientId].allergens.includes('arachides'));
    }
  }
}

// ─── Protocole HTTP ──────────────────────────────────────────────────────────

Deno.test('OPTIONS : pré-vol CORS', async () => {
  const res = await handlerWith(fakeRepo(), null)(new Request('http://x', { method: 'OPTIONS' }));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('access-control-allow-origin'), '*');
  await res.body?.cancel();
});

Deno.test('GET refusé (405)', async () => {
  const res = await handlerWith(fakeRepo(), null)(new Request('http://x', { method: 'GET' }));
  assertEquals(res.status, 405);
  assertEquals((await res.json()).error.code, 'method_not_allowed');
});

Deno.test('non authentifié → 401', async () => {
  const handler = handlerWith(fakeRepo(), null, {
    authenticate: () => Promise.reject(new HttpError(401, 'unauthorized', 'Connexion requise.')),
  });
  const { status, data } = await call(handler, { weekStart: WEEK });
  assertEquals(status, 401);
  assertEquals(data.error.code, 'unauthorized');
});

Deno.test('requêtes invalides → 400', async () => {
  const h = handlerWith(fakeRepo(), null);
  for (
    const body of [
      '{pas du json',
      { weekStart: '2026-11-17' }, // mardi
      { weekStart: 'demain' },
      { weekStart: '2030-01-07' }, // trop loin
      { weekStart: WEEK, maxMeals: 0 },
      { weekStart: WEEK, maxMeals: 2.5 },
      { weekStart: WEEK, lockedMeals: [{ date: '2026-11-30', type: 'diner', recipeId: 'rec_curry' }] },
      { weekStart: WEEK, lockedMeals: [{ date: WEEK, type: 'gouter', recipeId: 'rec_curry' }] },
    ]
  ) {
    const { status, data } = await call(h, body);
    assertEquals(status, 400, JSON.stringify(body));
    assert(['invalid_request', 'invalid_json'].includes(data.error.code));
  }
});

Deno.test('profil absent → 404', async () => {
  const { status, data } = await call(handlerWith(fakeRepo({ profile: null }), null), { weekStart: WEEK });
  assertEquals(status, 404);
  assertEquals(data.error.code, 'profile_not_found');
});

// ─── Chemin IA ───────────────────────────────────────────────────────────────

Deno.test('IA : planning complet, validé, enregistré, sans allergène', async () => {
  const repo = fakeRepo();
  const llm = wellBehavedLlm();
  const { status, data } = await call(handlerWith(repo, llm), { weekStart: WEEK });
  assertEquals(status, 200);
  assertEquals(data.meta.source, 'ai');
  assertEquals(data.plan.source, 'ai');
  assert(data.meta.llm.ok);
  assertEquals(data.meta.llm.model, 'fake-model');
  assertEquals(data.meta.llm.rejectedMeals, 0);
  assertEquals(data.plan.meals.length, 9, 'créneaux par défaut : 7 dîners + 2 déjeuners');
  assertEquals(data.plan.weekStart, WEEK);
  assertNoPeanuts(data.plan);
  assert(data.meta.persisted);
  assertEquals(repo.saved.length, 1);
  assertEquals(data.meta.safety.unsafeMealsReplaced, 0);
  assert(data.meta.timings.totalMs >= 0 && data.meta.timings.totalMs < 10_000);
  assertEquals(data.meta.safeRecipeCount, RECIPES.length - 1);
});

Deno.test('IA : le prompt ne contient AUCUNE donnée de santé et pas la recette interdite', async () => {
  const llm = wellBehavedLlm();
  await call(handlerWith(fakeRepo(), llm), { weekStart: WEEK });
  assertEquals(llm.calls.length, 1);
  const text = `${llm.calls[0].system}\n${llm.calls[0].user}`.toLowerCase();
  for (const word of ['arachide', 'cacahu', 'peanut']) assertFalse(text.includes(word), `prompt contient « ${word} »`);
  assertFalse(text.includes(PEANUT_RECIPE_ID), 'la recette dangereuse ne doit même pas être candidate');
});

Deno.test('IA : un plat contenant un allergène déclaré est REJETÉ par le serveur', async () => {
  const llm = wellBehavedLlm([{ date: WEEK, type: 'diner', recipeId: PEANUT_RECIPE_ID }]);
  const { data } = await call(handlerWith(fakeRepo(), llm), { weekStart: WEEK });
  assertEquals(data.meta.source, 'ai');
  assert(data.meta.llm.rejectedMeals >= 1, 'le plat dangereux doit être compté comme rejeté');
  assertNoPeanuts(data.plan);
  assertEquals(data.plan.meals.length, 9);
});

Deno.test('IA : uniquement des plats dangereux → sélection vide → règles', async () => {
  const llm = fakeLlm(() => JSON.stringify({ meals: [{ date: WEEK, type: 'diner', recipeId: PEANUT_RECIPE_ID }] }));
  const { data } = await call(handlerWith(fakeRepo(), llm), { weekStart: WEEK });
  assertEquals(data.meta.source, 'rules');
  assertEquals(data.meta.llm.fallbackReason, 'empty_selection');
  assertNoPeanuts(data.plan);
});

Deno.test('IA : délai dépassé → repli règles, réponse rapide', async () => {
  const llm = fakeLlm(() => never<string>());
  const started = Date.now();
  const { status, data } = await call(handlerWith(fakeRepo(), llm, { llmTimeoutMs: 1000, totalBudgetMs: 9000 }), {
    weekStart: WEEK,
  });
  const elapsed = Date.now() - started;
  assertEquals(status, 200);
  assertEquals(data.meta.source, 'rules');
  assertEquals(data.meta.llm.fallbackReason, 'timeout');
  assert(data.meta.llm.attempted);
  assert(elapsed < 3000, `trop lent : ${elapsed} ms`);
  assertEquals(data.plan.meals.length, 9);
  assertNoPeanuts(data.plan);
});

Deno.test("IA : le signal d'annulation est déclenché au délai", async () => {
  let aborted = false;
  const llm = fakeLlm((_p, signal) =>
    new Promise<string>((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        aborted = true;
        reject(new DOMException('aborted', 'AbortError'));
      });
    })
  );
  const { data } = await call(handlerWith(fakeRepo(), llm, { llmTimeoutMs: 1000 }), { weekStart: WEEK });
  assert(aborted);
  assertEquals(data.meta.llm.fallbackReason, 'timeout');
});

Deno.test('IA : erreur HTTP / refus / réponse illisible → règles', async () => {
  const cases: [FakeLlm, string][] = [
    [fakeLlm(() => Promise.reject(new LlmError('http', 'Claude API HTTP 529', 529))), 'llm_error'],
    [fakeLlm(() => Promise.reject(new TypeError('network down'))), 'llm_error'],
    [fakeLlm(() => Promise.reject(new LlmError('refusal', 'refus'))), 'llm_refusal'],
    [fakeLlm(() => 'Désolé, je ne peux pas {selon tes goûts}'), 'unparseable'],
  ];
  for (const [llm, reason] of cases) {
    const { status, data } = await call(handlerWith(fakeRepo(), llm), { weekStart: WEEK });
    assertEquals(status, 200);
    assertEquals(data.meta.source, 'rules');
    assertEquals(data.meta.llm.fallbackReason, reason);
    assertEquals(data.plan.meals.length, 9);
    assertNoPeanuts(data.plan);
  }
});

Deno.test('sans clé API → règles, sans appel', async () => {
  const { data } = await call(handlerWith(fakeRepo(), null), { weekStart: WEEK });
  assertEquals(data.meta.source, 'rules');
  assertEquals(data.meta.llm, { attempted: false, ok: false, fallbackReason: 'llm_not_configured' });
  assertNoPeanuts(data.plan);
});

Deno.test("budget épuisé → pas d'appel LLM", async () => {
  const llm = wellBehavedLlm();
  const { data } = await call(handlerWith(fakeRepo(), llm, { totalBudgetMs: 1500 }), { weekStart: WEEK });
  assertEquals(llm.calls.length, 0);
  assertEquals(data.meta.llm.fallbackReason, 'budget_exhausted');
  assertEquals(data.meta.source, 'rules');
});

// ─── Offre gratuite ──────────────────────────────────────────────────────────

Deno.test('gratuit : limité à 3 repas même si 14 demandés (clamp signalé)', async () => {
  const { data } = await call(handlerWith(fakeRepo({ entitlement: 'free' }), wellBehavedLlm()), {
    weekStart: WEEK,
    maxMeals: 14,
  });
  assertEquals(data.plan.meals.length, 3);
  assertEquals(data.meta.maxMeals, 3);
  assertEquals(data.meta.entitlement, 'free');
  assert(data.meta.clampedToFreeTier);
});

Deno.test('gratuit : sans maxMeals → 3 repas, pas de clamp signalé', async () => {
  const { data } = await call(handlerWith(fakeRepo({ entitlement: 'free' }), null), { weekStart: WEEK });
  assertEquals(data.plan.meals.length, 3);
  assertFalse(data.meta.clampedToFreeTier);
});

Deno.test('premium : maxMeals respecté (5)', async () => {
  const { data } = await call(handlerWith(fakeRepo({ entitlement: 'premium' }), wellBehavedLlm()), {
    weekStart: WEEK,
    maxMeals: 5,
  });
  assertEquals(data.plan.meals.length, 5);
  assertFalse(data.meta.clampedToFreeTier);
});

// ─── Régimes, repas verrouillés, filet de sécurité ───────────────────────────

Deno.test('végétarien : aucune viande ni poisson (IA et règles)', async () => {
  const profile = profileFixture({ diets: ['vegetarien'], allergens: [] });
  for (const llm of [wellBehavedLlm(), null]) {
    const { data } = await call(handlerWith(fakeRepo({ profile }), llm), { weekStart: WEEK });
    for (const m of data.plan.meals) {
      const r = RECIPES.find((x) => x.id === m.recipeId)!;
      for (const ri of r.ingredients) {
        const i = INGREDIENTS_BY_ID[ri.ingredientId];
        assertFalse(i.isMeat || i.isFish, `${r.id} contient ${i.id}`);
      }
    }
  }
});

Deno.test('repas verrouillé conservé ; verrouillé DANGEREUX retiré', async () => {
  const { data } = await call(handlerWith(fakeRepo(), wellBehavedLlm()), {
    weekStart: WEEK,
    lockedMeals: [
      { id: 'meal_keep', date: '2026-11-17', type: 'diner', recipeId: 'rec_dahl', servings: 2 },
      { id: 'meal_bad', date: '2026-11-18', type: 'diner', recipeId: PEANUT_RECIPE_ID, servings: 2 },
    ],
  });
  const kept = data.plan.meals.find((m: { id: string }) => m.id === 'meal_keep');
  assertExists(kept);
  assertEquals(kept.recipeId, 'rec_dahl');
  assert(kept.locked);
  assertNoPeanuts(data.plan);
});

Deno.test('planning existant de la semaine : son id est réutilisé', async () => {
  const stored: MealPlan = {
    id: 'plan_existing',
    weekStart: WEEK,
    meals: [],
    generatedAt: NOW.toISOString(),
    source: 'rules',
  };
  const { data } = await call(handlerWith(fakeRepo({ stored }), null), { weekStart: WEEK });
  assertEquals(data.plan.id, 'plan_existing');
});

Deno.test('filet de sécurité : un moteur défaillant ne peut PAS renvoyer de plat dangereux', async () => {
  // Moteur volontairement « buggé » : force la recette aux arachides au 1er créneau.
  const buggyEngine = {
    generateMealPlan: (input: Parameters<typeof generateMealPlan>[0]) => {
      const plan = generateMealPlan(input);
      return { ...plan, meals: plan.meals.map((m, i) => (i === 0 ? { ...m, recipeId: PEANUT_RECIPE_ID } : m)) };
    },
  };
  const { status, data } = await call(handlerWith(fakeRepo(), null, { engine: buggyEngine }), { weekStart: WEEK });
  assertEquals(status, 200);
  assertEquals(data.meta.safety.unsafeMealsReplaced, 1);
  assertNoPeanuts(data.plan);
  assertEquals(data.plan.meals.length, 9, 'le créneau est re-rempli par les règles');
});

Deno.test("échec d'enregistrement → 200 avec persisted=false", async () => {
  const { status, data } = await call(handlerWith(fakeRepo({ saveFails: true }), null), { weekStart: WEEK });
  assertEquals(status, 200);
  assertFalse(data.meta.persisted);
  assertEquals(data.plan.meals.length, 9);
});

Deno.test('catalogue non sûr dans son ensemble (allergie à tout) → planning vide, jamais dangereux', async () => {
  const profile = profileFixture({
    allergens: ['gluten', 'arachides', 'lait', 'oeufs', 'poissons'],
    diets: ['vegan'],
  });
  const { status, data } = await call(handlerWith(fakeRepo({ profile }), wellBehavedLlm()), { weekStart: WEEK });
  assertEquals(status, 200);
  for (const m of data.plan.meals) {
    const r = RECIPES.find((x) => x.id === m.recipeId)!;
    for (const ri of r.ingredients) {
      const i = INGREDIENTS_BY_ID[ri.ingredientId];
      assertFalse(i.allergens.some((a) => profile.allergens.includes(a)));
      assertFalse(i.isMeat || i.isFish || i.isAnimalProduct);
    }
  }
});

/**
 * Planification des repas.
 *
 * - Production : Edge Function `generate-meal-plan` (Claude + validation
 *   serveur), délai max 9 s ; au moindre problème → moteur de règles local
 *   (`core.generateMealPlan`, quelques ms, hors-ligne).
 * - Démo : moteur local directement.
 *
 * DÉFENSE EN PROFONDEUR : quelle que soit la source, le planning est revérifié
 * côté client avec `core.assertPlanSafe` sur le profil LOCAL ; tout repas non
 * sûr (allergène, régime, recette inconnue) est remplacé par une alternative
 * sûre, ou retiré. La limite de l'offre (`maxMealsPerWeek`) est réappliquée.
 *
 * API : `requestMealPlan(req)`, `alternativesFor(plan, mealId, ctx)`,
 * `swapMeal(plan, mealId, recipeId, profile)`, `addMealToPlan(...)`,
 * `enforcePlanSafety(plan, profile)`. Usine `createMealPlanner(deps)` pour les tests.
 */
import type { Entitlement, MealEngineInput, MealPlan, MealType, PlannedMeal, Recipe, UserProfile } from '@/core';
import {
  assertPlanSafe,
  createId,
  generateMealPlan,
  householdServings,
  isInWeek,
  isRecipeSafe,
  maxMealsPerWeek,
  replaceMeal,
  slotKey,
  suggestAlternatives,
} from '@/core';

import { getCatalogSnapshot, type CatalogSnapshot } from './catalog';
import { errorMessage, getSupabase } from './supabase';

export const MEAL_PLAN_TIMEOUT_MS = 9000;

export interface MealPlanRequest {
  profile: UserProfile;
  /** Lundi de la semaine (ISO). */
  weekStart: string;
  entitlement: Entitlement;
  /** Planning actuel : ses repas verrouillés sont conservés. */
  existing?: MealPlan | null;
  recentRecipeIds?: string[];
  pantryIngredientIds?: string[];
  /** Graine (même graine ⇒ même planning local). */
  seed?: string | number;
}

export interface MealPlanResult {
  plan: MealPlan;
  /** 'remote' = Edge Function ; 'local' = mode démo ; 'fallback' = repli local après échec distant. */
  source: 'remote' | 'local' | 'fallback';
  durationMs: number;
  /** Repas jugés non sûrs côté client puis remplacés / retirés. */
  replacedUnsafeMeals: number;
  fallbackReason?: string;
}

/** Corps envoyé à `generate-meal-plan`. */
export interface RemoteMealPlanBody {
  weekStart: string;
  maxMeals: number;
  lockedMeals: PlannedMeal[];
  recentRecipeIds: string[];
  pantryIngredientIds: string[];
  seed?: string | number;
}

/** Appel distant : renvoie le JSON de la fonction (`{ plan, meta }`) ou lève une erreur. */
export type MealPlanRemote = (body: RemoteMealPlanBody, timeoutMs: number) => Promise<unknown>;

export interface MealPlannerDeps {
  remote: MealPlanRemote | null;
  getCatalog?: () => CatalogSnapshot;
  now?: () => number;
}

export type SwapResult =
  | { ok: true; plan: MealPlan }
  | { ok: false; reason: 'unknown_meal' | 'unknown_recipe' | 'unsafe' | 'wrong_type'; message: string };

export interface AlternativesContext {
  profile: UserProfile;
  recentRecipeIds?: string[];
  pantryIngredientIds?: string[];
  count?: number;
}

// ─── Validation d'un planning reçu ───────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Lit un planning reçu du réseau ; null s'il est inexploitable. */
export function parseRemotePlan(raw: unknown, weekStart: string): MealPlan | null {
  const body = isRecord(raw) && isRecord(raw.plan) ? raw.plan : raw;
  if (!isRecord(body) || !Array.isArray(body.meals)) return null;
  const meals: PlannedMeal[] = [];
  const seen = new Set<string>();
  for (const m of body.meals) {
    if (!isRecord(m)) continue;
    const { date, type, recipeId } = m;
    if (typeof date !== 'string' || !isInWeek(date, weekStart)) continue;
    if (type !== 'dejeuner' && type !== 'diner') continue;
    if (typeof recipeId !== 'string' || !recipeId) continue;
    const key = slotKey(date, type);
    if (seen.has(key)) continue;
    seen.add(key);
    const servings = typeof m.servings === 'number' && Number.isFinite(m.servings) ? Math.min(50, Math.max(1, Math.round(m.servings))) : 2;
    const meal: PlannedMeal = {
      id: typeof m.id === 'string' && m.id ? m.id : createId('meal'),
      date,
      type,
      recipeId,
      servings,
    };
    if (m.locked === true) meal.locked = true;
    if (typeof m.reason === 'string' && m.reason.trim()) meal.reason = m.reason.trim().slice(0, 160);
    meals.push(meal);
  }
  return {
    id: typeof body.id === 'string' && body.id ? body.id : createId('plan'),
    weekStart,
    meals: sortMeals(meals),
    generatedAt: typeof body.generatedAt === 'string' ? body.generatedAt : new Date().toISOString(),
    source: body.source === 'ai' ? 'ai' : 'rules',
  };
}

function sortMeals(meals: PlannedMeal[]): PlannedMeal[] {
  return meals.sort((a, b) =>
    a.date === b.date ? (a.type === b.type ? 0 : a.type === 'dejeuner' ? -1 : 1) : a.date < b.date ? -1 : 1,
  );
}

/** Ramène un planning à `max` repas (repas verrouillés d'abord, puis ordre chronologique). */
export function clampMeals(plan: MealPlan, max: number): MealPlan {
  if (plan.meals.length <= max) return plan;
  const locked = plan.meals.filter((m) => m.locked);
  const others = plan.meals.filter((m) => !m.locked);
  const kept = [...locked, ...others].slice(0, Math.max(0, max));
  return { ...plan, meals: sortMeals(kept) };
}

// ─── Usine ───────────────────────────────────────────────────────────────────

export interface MealPlanner {
  requestMealPlan(req: MealPlanRequest): Promise<MealPlanResult>;
  enforcePlanSafety(plan: MealPlan, profile: UserProfile, ctx?: Omit<AlternativesContext, 'profile'>): { plan: MealPlan; replaced: number };
  alternativesFor(plan: MealPlan, mealId: string, ctx: AlternativesContext): Recipe[];
  swapMeal(plan: MealPlan, mealId: string, recipeId: string, profile: UserProfile): SwapResult;
  addMealToPlan(
    plan: MealPlan,
    slot: { date: string; type: MealType },
    profile: UserProfile,
    recipeId?: string,
  ): SwapResult;
}

export function createMealPlanner(deps: MealPlannerDeps): MealPlanner {
  const getCatalog = deps.getCatalog ?? getCatalogSnapshot;
  const now = deps.now ?? (() => Date.now());

  function engineInput(profile: UserProfile, weekStart: string, extra: Partial<MealEngineInput> = {}): MealEngineInput {
    const cat = getCatalog();
    return { profile, recipes: cat.recipes, ingredientsById: cat.ingredientsById, weekStart, ...extra };
  }

  function enforcePlanSafety(
    plan: MealPlan,
    profile: UserProfile,
    ctx: Omit<AlternativesContext, 'profile'> = {},
  ): { plan: MealPlan; replaced: number } {
    const cat = getCatalog();
    const check = assertPlanSafe(plan, cat.recipesById, profile, cat.ingredientsById);
    if (check.ok) return { plan, replaced: 0 };
    let current = plan;
    const input = engineInput(profile, plan.weekStart, {
      recentRecipeIds: ctx.recentRecipeIds,
      pantryIngredientIds: ctx.pantryIngredientIds,
    });
    for (const mealId of check.unsafeMealIds) {
      const [alt] = suggestAlternatives(input, current, mealId, 1);
      if (alt) {
        current = {
          ...current,
          meals: current.meals.map((m) =>
            m.id === mealId ? { ...m, recipeId: alt.id, locked: false, reason: 'Remplacé pour respecter ton profil' } : m,
          ),
        };
      } else {
        current = { ...current, meals: current.meals.filter((m) => m.id !== mealId) };
      }
    }
    // Dernier filet : tout ce qui resterait non sûr est retiré.
    const final = assertPlanSafe(current, cat.recipesById, profile, cat.ingredientsById);
    if (!final.ok) {
      const bad = new Set(final.unsafeMealIds);
      current = { ...current, meals: current.meals.filter((m) => !bad.has(m.id)) };
    }
    return { plan: current, replaced: check.unsafeMealIds.length };
  }

  function localPlan(req: MealPlanRequest, max: number): MealPlan {
    return generateMealPlan(
      engineInput(req.profile, req.weekStart, {
        maxMeals: max,
        existing: req.existing ?? null,
        recentRecipeIds: req.recentRecipeIds,
        pantryIngredientIds: req.pantryIngredientIds,
        seed: req.seed,
        now: new Date(now()).toISOString(),
      }),
    );
  }

  async function requestMealPlan(req: MealPlanRequest): Promise<MealPlanResult> {
    const started = now();
    const max = maxMealsPerWeek(req.entitlement);
    let plan: MealPlan | null = null;
    let source: MealPlanResult['source'] = 'local';
    let fallbackReason: string | undefined;

    if (deps.remote) {
      try {
        const lockedMeals = (req.existing?.meals ?? []).filter((m) => m.locked && isInWeek(m.date, req.weekStart));
        const raw = await withTimeout(
          deps.remote(
            {
              weekStart: req.weekStart,
              maxMeals: max,
              lockedMeals,
              recentRecipeIds: (req.recentRecipeIds ?? []).slice(0, 60),
              pantryIngredientIds: (req.pantryIngredientIds ?? []).slice(0, 200),
              ...(req.seed !== undefined ? { seed: String(req.seed).slice(0, 64) } : {}),
            },
            MEAL_PLAN_TIMEOUT_MS,
          ),
          MEAL_PLAN_TIMEOUT_MS + 500,
        );
        plan = parseRemotePlan(raw, req.weekStart);
        if (!plan) throw new Error('réponse illisible');
        if (plan.meals.length === 0) throw new Error('planning vide');
        source = 'remote';
      } catch (err) {
        plan = null;
        source = 'fallback';
        fallbackReason = errorMessage(err);
      }
    }
    if (!plan) plan = localPlan(req, max);

    plan = clampMeals({ ...plan, weekStart: req.weekStart }, max);
    const safe = enforcePlanSafety(plan, req.profile, {
      recentRecipeIds: req.recentRecipeIds,
      pantryIngredientIds: req.pantryIngredientIds,
    });
    const result: MealPlanResult = {
      plan: safe.plan,
      source,
      durationMs: Math.max(0, now() - started),
      replacedUnsafeMeals: safe.replaced,
    };
    if (fallbackReason) result.fallbackReason = fallbackReason;
    return result;
  }

  function alternativesFor(plan: MealPlan, mealId: string, ctx: AlternativesContext): Recipe[] {
    const cat = getCatalog();
    const input = engineInput(ctx.profile, plan.weekStart, {
      recentRecipeIds: ctx.recentRecipeIds,
      pantryIngredientIds: ctx.pantryIngredientIds,
    });
    // suggestAlternatives ne propose que des recettes sûres ; on revérifie quand même.
    return suggestAlternatives(input, plan, mealId, ctx.count ?? 6).filter((r) =>
      isRecipeSafe(r, ctx.profile, cat.ingredientsById),
    );
  }

  function checkRecipeFor(recipeId: string, type: MealType, profile: UserProfile): SwapResult | Recipe {
    const cat = getCatalog();
    const recipe = cat.recipesById[recipeId];
    if (!recipe) return { ok: false, reason: 'unknown_recipe', message: 'Cette recette n’existe plus.' };
    if (!isRecipeSafe(recipe, profile, cat.ingredientsById)) {
      return {
        ok: false,
        reason: 'unsafe',
        message: 'Ce plat ne respecte pas tes allergies ou ton régime : il ne te sera jamais proposé.',
      };
    }
    if (!recipe.mealTypes.includes(type)) {
      return { ok: false, reason: 'wrong_type', message: 'Ce plat n’est pas prévu pour ce repas.' };
    }
    return recipe;
  }

  function swapMeal(plan: MealPlan, mealId: string, recipeId: string, profile: UserProfile): SwapResult {
    const meal = plan.meals.find((m) => m.id === mealId);
    if (!meal) return { ok: false, reason: 'unknown_meal', message: 'Ce repas n’est plus dans ton planning.' };
    const checked = checkRecipeFor(recipeId, meal.type, profile);
    if ('ok' in checked) return checked;
    return { ok: true, plan: replaceMeal(plan, mealId, recipeId) };
  }

  function addMealToPlan(
    plan: MealPlan,
    slot: { date: string; type: MealType },
    profile: UserProfile,
    recipeId?: string,
  ): SwapResult {
    if (!isInWeek(slot.date, plan.weekStart)) {
      return { ok: false, reason: 'unknown_meal', message: 'Ce jour n’est pas dans la semaine.' };
    }
    if (plan.meals.some((m) => m.date === slot.date && m.type === slot.type)) {
      return { ok: false, reason: 'unknown_meal', message: 'Ce repas est déjà planifié.' };
    }
    const meal: PlannedMeal = {
      id: createId('meal'),
      date: slot.date,
      type: slot.type,
      recipeId: recipeId ?? '__pending__',
      servings: householdServings(profile.household),
    };
    let chosen = recipeId;
    if (!chosen) {
      const draft = { ...plan, meals: [...plan.meals, meal] };
      const [alt] = suggestAlternatives(engineInput(profile, plan.weekStart), draft, meal.id, 1);
      if (!alt) return { ok: false, reason: 'unknown_recipe', message: 'Aucun plat compatible avec ton profil pour ce repas.' };
      chosen = alt.id;
    }
    const checked = checkRecipeFor(chosen, slot.type, profile);
    if ('ok' in checked) return checked;
    const added: PlannedMeal = { ...meal, recipeId: chosen, reason: recipeId ? 'Choisi par toi' : 'Ajouté pour compléter ta semaine' };
    return { ok: true, plan: { ...plan, meals: sortMeals([...plan.meals, added]) } };
  }

  return { requestMealPlan, enforcePlanSafety, alternativesFor, swapMeal, addMealToPlan };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('délai dépassé')), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Appel réel de l'Edge Function `generate-meal-plan` (null en mode démo). */
export function supabaseMealPlanRemote(): MealPlanRemote | null {
  const client = getSupabase();
  if (!client) return null;
  return async (body, timeoutMs) => {
    const { data, error } = await client.functions.invoke('generate-meal-plan', { body, timeout: timeoutMs });
    if (error) throw error;
    return data;
  };
}

let defaultPlanner: MealPlanner | null = null;

/** Planificateur par défaut (distant si Supabase est configuré). */
export function getMealPlanner(): MealPlanner {
  if (!defaultPlanner) defaultPlanner = createMealPlanner({ remote: supabaseMealPlanRemote() });
  return defaultPlanner;
}

/** Remplace le planificateur par défaut (tests). */
export function __setMealPlannerForTests(p: MealPlanner | null): void {
  defaultPlanner = p;
}

export const requestMealPlan = (req: MealPlanRequest): Promise<MealPlanResult> => getMealPlanner().requestMealPlan(req);

/**
 * generate-meal-plan — planning de la semaine (IA + validation serveur).
 *
 * POST { weekStart, maxMeals?, lockedMeals?, recentRecipeIds?, pantryIngredientIds?, seed? }
 * (JWT utilisateur obligatoire)
 *
 * Étapes :
 *  1. profil + abonnement + catalogue (recettes, ingrédients) ;
 *  2. FILTRAGE DE SÉCURITÉ CÔTÉ SERVEUR, indépendant de l'IA : seules les
 *     recettes sûres (allergènes, régimes, ingrédients connus — core ›
 *     filterSafeRecipes) entrent dans le moteur ;
 *  3. limite de l'offre gratuite (3 repas) appliquée d'après `subscriptions` ;
 *  4. Claude choisit parmi des candidats déjà filtrés (prompt sans donnée de
 *     santé), délai max 7 s ; sa réponse est revalidée (core ›
 *     parseLlmResponse) puis complétée par les règles (planFromSelection) ;
 *  5. au moindre problème (pas de clé, délai, erreur, JSON illisible) : moteur
 *     de règles déterministe (generateMealPlan) ;
 *  6. dernier filet : assertPlanSafe — un repas non sûr est remplacé par les
 *     règles, ou retiré. Un plat dangereux n'est JAMAIS renvoyé ;
 *  7. enregistrement (RPC save_meal_plan, RLS) et réponse avec métadonnées.
 *
 * Budget total visé : < 10 s (critère du dossier).
 */
import type {
  Entitlement,
  Ingredient,
  LlmSelection,
  MealEngineInput,
  MealPlan,
  MealType,
  PlannedMeal,
  Recipe,
  UserProfile,
} from '../_shared/core/index.ts';
import {
  assertPlanSafe,
  buildLlmPrompt,
  createId,
  extractJson,
  filterSafeRecipes,
  generateMealPlan,
  isInWeek,
  maxMealsPerWeek,
  openSlots,
  parseLlmResponse,
  planFromSelection,
  selectLlmCandidates,
  weekdayIndex,
} from '../_shared/core/index.ts';
import { HttpError, json, readJson, requireMethod, withHandler } from '../_shared/http.ts';
import type { Logger } from '../_shared/logger.ts';
import { type LlmClient, LlmError, TimeoutError, withTimeout } from '../_shared/anthropic.ts';
import {
  badRequest,
  isRecord,
  optionalInt,
  optionalStringArray,
  requireIsoDate,
  requireRecord,
} from '../_shared/validation.ts';

// ─── Ports (implémentés par repo.ts, simulés dans les tests) ─────────────────

export interface MealPlanRepository {
  loadProfile(): Promise<UserProfile | null>;
  loadEntitlement(): Promise<Entitlement>;
  loadCatalog(): Promise<{ recipes: Recipe[]; ingredients: Ingredient[] }>;
  loadPlan(weekStart: string): Promise<MealPlan | null>;
  /** Enregistre le planning ; renvoie l'id stocké (un seul planning par semaine). */
  savePlan(plan: MealPlan): Promise<string>;
}

/** Fonctions du moteur (injectables pour tester le dernier filet de sécurité). */
export interface MealEngine {
  generateMealPlan: typeof generateMealPlan;
  planFromSelection: typeof planFromSelection;
}

export interface GenerateMealPlanDeps {
  authenticate(req: Request): Promise<{ userId: string; repo: MealPlanRepository }>;
  /** null : pas de clé API → moteur de règles uniquement. */
  llm: LlmClient | null;
  logger: Logger;
  now?: () => Date;
  /** Délai max de l'appel LLM (défaut 7000 ms). */
  llmTimeoutMs?: number;
  /** Budget total de la requête (défaut 9000 ms, < 10 s exigées). */
  totalBudgetMs?: number;
  engine?: Partial<MealEngine>;
}

// ─── Requête ─────────────────────────────────────────────────────────────────

export interface GenerateRequest {
  weekStart: string;
  maxMeals?: number;
  lockedMeals: PlannedMeal[];
  recentRecipeIds?: string[];
  pantryIngredientIds?: string[];
  seed?: string | number;
}

const MEAL_TYPES: readonly MealType[] = ['dejeuner', 'diner'];

export function parseGenerateRequest(body: unknown, today: string): GenerateRequest {
  const b = requireRecord(body);
  const weekStart = requireIsoDate(b.weekStart, 'weekStart');
  if (weekdayIndex(weekStart) !== 0) throw badRequest('weekStart doit être un lundi.');
  const deltaDays = (Date.parse(weekStart) - Date.parse(today)) / 86_400_000;
  if (!(deltaDays > -366 && deltaDays < 366)) throw badRequest('weekStart doit être à moins d\'un an d\'aujourd\'hui.');

  const lockedMeals: PlannedMeal[] = [];
  if (b.lockedMeals !== undefined && b.lockedMeals !== null) {
    if (!Array.isArray(b.lockedMeals) || b.lockedMeals.length > 14) {
      throw badRequest('lockedMeals doit être une liste d\'au plus 14 repas.');
    }
    b.lockedMeals.forEach((m, i) => {
      if (!isRecord(m)) throw badRequest(`lockedMeals[${i}] doit être un objet.`);
      const date = requireIsoDate(m.date, `lockedMeals[${i}].date`);
      if (!isInWeek(date, weekStart)) throw badRequest(`lockedMeals[${i}].date n'est pas dans la semaine.`);
      if (!MEAL_TYPES.includes(m.type as MealType)) throw badRequest(`lockedMeals[${i}].type est invalide.`);
      if (typeof m.recipeId !== 'string' || !m.recipeId || m.recipeId.length > 128) {
        throw badRequest(`lockedMeals[${i}].recipeId est invalide.`);
      }
      const servings = optionalInt(m.servings, `lockedMeals[${i}].servings`, 1, 50) ?? 2;
      const id = typeof m.id === 'string' && m.id && m.id.length <= 160 ? m.id : createId('meal');
      const meal: PlannedMeal = { id, date, type: m.type as MealType, recipeId: m.recipeId, servings, locked: true };
      if (typeof m.reason === 'string' && m.reason.trim()) meal.reason = m.reason.trim().slice(0, 120);
      lockedMeals.push(meal);
    });
  }
  let seed: string | number | undefined;
  if (typeof b.seed === 'string' && b.seed.length <= 64) seed = b.seed;
  else if (typeof b.seed === 'number' && Number.isFinite(b.seed)) seed = b.seed;

  return {
    weekStart,
    maxMeals: optionalInt(b.maxMeals, 'maxMeals', 1, 14),
    lockedMeals,
    recentRecipeIds: optionalStringArray(b.recentRecipeIds, 'recentRecipeIds', 60),
    pantryIngredientIds: optionalStringArray(b.pantryIngredientIds, 'pantryIngredientIds', 200),
    seed,
  };
}

// ─── Réponse ─────────────────────────────────────────────────────────────────

export type LlmFallbackReason =
  | 'llm_not_configured'
  | 'no_open_slots'
  | 'no_candidates'
  | 'budget_exhausted'
  | 'timeout'
  | 'llm_error'
  | 'llm_refusal'
  | 'unparseable'
  | 'empty_selection';

export interface GenerateMeta {
  source: MealPlan['source'];
  entitlement: Entitlement;
  /** Nombre de repas maximum appliqué (3 en gratuit). */
  maxMeals: number;
  /** La demande dépassait la limite gratuite et a été ramenée à 3 repas. */
  clampedToFreeTier: boolean;
  /** Recettes compatibles avec le profil (après filtrage de sécurité serveur). */
  safeRecipeCount: number;
  llm: {
    attempted: boolean;
    ok: boolean;
    model?: string;
    fallbackReason?: LlmFallbackReason;
    /** Repas proposés par l'IA puis rejetés par la validation serveur. */
    rejectedMeals?: number;
  };
  safety: { unsafeMealsReplaced: number };
  persisted: boolean;
  timings: { loadMs: number; llmMs: number; totalMs: number };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export function createGenerateMealPlanHandler(deps: GenerateMealPlanDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date());
  const llmTimeoutMs = deps.llmTimeoutMs ?? 7000;
  const totalBudgetMs = deps.totalBudgetMs ?? 9000;
  const engine: MealEngine = {
    generateMealPlan: deps.engine?.generateMealPlan ?? generateMealPlan,
    planFromSelection: deps.engine?.planFromSelection ?? planFromSelection,
  };

  return withHandler(deps.logger, async (req, log) => {
    const started = Date.now();
    requireMethod(req, 'POST');
    const { userId, repo } = await deps.authenticate(req);
    const nowDate = now();
    const request = parseGenerateRequest(await readJson(req), nowDate.toISOString().slice(0, 10));

    // 1. Chargement en parallèle.
    const [profile, entitlement, catalog, storedPlan] = await Promise.all([
      repo.loadProfile(),
      repo.loadEntitlement(),
      repo.loadCatalog(),
      repo.loadPlan(request.weekStart),
    ]);
    if (!profile) throw new HttpError(404, 'profile_not_found', 'Profil introuvable : termine ton inscription.');
    const loadMs = Date.now() - started;

    const ingredientsById: Record<string, Ingredient> = {};
    for (const ing of catalog.ingredients) ingredientsById[ing.id] = ing;
    const recipesById: Record<string, Recipe> = {};
    for (const r of catalog.recipes) recipesById[r.id] = r;

    // 2. Filtrage de sécurité serveur (indépendant de l'IA).
    const safeRecipes = filterSafeRecipes(catalog.recipes, profile, ingredientsById);

    // 3. Limite de l'offre.
    const limit = maxMealsPerWeek(entitlement);
    const requested = request.maxMeals ?? limit;
    const maxMeals = Math.min(requested, limit);
    const clampedToFreeTier = entitlement === 'free' && requested > limit;

    // Repas verrouillés : ceux de la requête, sinon ceux déjà enregistrés.
    const lockedMeals = request.lockedMeals.length > 0
      ? request.lockedMeals
      : (storedPlan?.meals ?? []).filter((m) => m.locked);
    const existing: MealPlan | null = storedPlan || lockedMeals.length > 0
      ? {
        id: storedPlan?.id ?? createId('plan'),
        weekStart: request.weekStart,
        meals: lockedMeals,
        generatedAt: storedPlan?.generatedAt ?? nowDate.toISOString(),
        source: storedPlan?.source ?? 'rules',
      }
      : null;

    const input: MealEngineInput = {
      profile,
      recipes: safeRecipes,
      ingredientsById,
      weekStart: request.weekStart,
      maxMeals,
      existing,
      recentRecipeIds: request.recentRecipeIds,
      pantryIngredientIds: request.pantryIngredientIds,
      seed: request.seed,
      now: nowDate.toISOString(),
    };

    // 4. Tentative IA.
    const llmMeta: GenerateMeta['llm'] = { attempted: false, ok: false };
    let plan: MealPlan | null = null;
    const llmStarted = Date.now();
    if (!deps.llm) {
      llmMeta.fallbackReason = 'llm_not_configured';
    } else if (openSlots(input).length === 0) {
      llmMeta.fallbackReason = 'no_open_slots';
    } else {
      const candidates = selectLlmCandidates(input, 60);
      // Temps restant : on garde ~1,5 s pour la suite (validation, écriture).
      const remaining = totalBudgetMs - (Date.now() - started) - 1500;
      const timeout = Math.min(llmTimeoutMs, remaining);
      if (candidates.length === 0) {
        llmMeta.fallbackReason = 'no_candidates';
      } else if (timeout < 1000) {
        llmMeta.fallbackReason = 'budget_exhausted';
      } else {
        llmMeta.attempted = true;
        llmMeta.model = deps.llm.model;
        const llm = deps.llm;
        try {
          const text = await withTimeout(timeout, (signal) => llm.complete(buildLlmPrompt(input, candidates), { signal }));
          const selection = parseLlmResponse(text, input, candidates);
          if (!selection) {
            llmMeta.fallbackReason = 'unparseable';
          } else {
            llmMeta.rejectedMeals = Math.max(0, countRawMeals(text) - selection.meals.length);
            if (selection.meals.length === 0) {
              llmMeta.fallbackReason = 'empty_selection';
            } else {
              plan = engine.planFromSelection(input, selection, 'ai');
              llmMeta.ok = true;
            }
          }
        } catch (err) {
          llmMeta.fallbackReason = err instanceof TimeoutError
            ? 'timeout'
            : err instanceof LlmError && err.kind === 'refusal'
            ? 'llm_refusal'
            : 'llm_error';
          log.warn('llm fallback', { reason: llmMeta.fallbackReason, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }
    const llmMs = Date.now() - llmStarted;

    // 5. Repli : moteur de règles.
    if (!plan) plan = engine.generateMealPlan(input);

    // 6. Dernier filet de sécurité (recettes du catalogue COMPLET, pas des seules sûres).
    let unsafeMealsReplaced = 0;
    let check = assertPlanSafe(plan, recipesById, profile, ingredientsById);
    if (!check.ok) {
      unsafeMealsReplaced = check.unsafeMealIds.length;
      log.error('unsafe meals detected after engine — replacing', { count: unsafeMealsReplaced, source: plan.source });
      const unsafe = new Set(check.unsafeMealIds);
      const keep: LlmSelection['meals'] = plan.meals
        .filter((m) => !unsafe.has(m.id))
        .map((m) => (m.reason ? { date: m.date, type: m.type, recipeId: m.recipeId, reason: m.reason } : {
          date: m.date,
          type: m.type,
          recipeId: m.recipeId,
        }));
      plan = planFromSelection(input, keep, plan.source);
      check = assertPlanSafe(plan, recipesById, profile, ingredientsById);
      if (!check.ok) {
        const stillUnsafe = new Set(check.unsafeMealIds);
        plan = { ...plan, meals: plan.meals.filter((m) => !stillUnsafe.has(m.id)) };
      }
    }
    // Invariant final (ceinture et bretelles).
    if (!assertPlanSafe(plan, recipesById, profile, ingredientsById).ok) {
      throw new Error('invariant de sécurité violé : planning non sûr');
    }

    // 7. Enregistrement (non bloquant pour l'utilisateur : l'app garde une copie locale).
    let persisted = false;
    try {
      const storedId = await repo.savePlan(plan);
      plan = { ...plan, id: storedId };
      persisted = true;
    } catch (err) {
      log.error('plan persistence failed', { error: err instanceof Error ? err.message : String(err) });
    }

    const meta: GenerateMeta = {
      source: plan.source,
      entitlement,
      maxMeals,
      clampedToFreeTier,
      safeRecipeCount: safeRecipes.length,
      llm: llmMeta,
      safety: { unsafeMealsReplaced },
      persisted,
      timings: { loadMs, llmMs, totalMs: Date.now() - started },
    };
    log.info('plan generated', {
      userId,
      source: meta.source,
      meals: plan.meals.length,
      llm: llmMeta.fallbackReason ?? 'ok',
      totalMs: meta.timings.totalMs,
    });
    return json({ plan, meta });
  });
}

/** Nombre de repas bruts proposés par le LLM (avant validation). */
function countRawMeals(text: string): number {
  const data = extractJson(text);
  if (Array.isArray(data)) return data.length;
  if (isRecord(data) && Array.isArray(data.meals)) return data.meals.length;
  return 0;
}

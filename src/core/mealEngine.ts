/**
 * Moteur de planning des repas.
 *
 * Deux usages :
 * 1. Moteur « règles » déterministe (hors-ligne, repli serveur) :
 *    `generateMealPlan` → planning complet en quelques millisecondes.
 * 2. Mode IA : `buildLlmPrompt` prépare la requête au LLM, `parseLlmResponse`
 *    valide strictement sa réponse (ids connus, créneaux, SÉCURITÉ) et
 *    `planFromSelection` complète les créneaux manquants avec les règles.
 *
 * Sécurité : les allergènes / régimes ne sont JAMAIS relâchés. Seules les
 * contraintes de confort (temps, répétition, ustensiles, « je n'aime pas »)
 * le sont, progressivement, quand le catalogue compatible est trop petit.
 */
import type {
  Ingredient,
  MealPlan,
  MealSlotPreference,
  MealType,
  PlannedMeal,
  Recipe,
  UserProfile,
} from './types';
import { checkRecipe, recipeTotalTime } from './constraints';
import { addDays, daysBetween, formatDayLabel, formatWeekRange, isInWeek, isWeekend, monthOf } from './dates';
import { CUISINE_LABELS, DIET_LABELS, MEAL_TYPE_LABELS } from './labels';
import { formatPrice } from './money';
import { householdPortions } from './portions';
import { hashString } from './random';
import { capitalize, lowerFirst } from './text';

// ─── Types publics ───────────────────────────────────────────────────────────

export interface MealEngineInput {
  profile: UserProfile;
  recipes: Recipe[];
  ingredientsById: Record<string, Ingredient>;
  /** Lundi de la semaine à planifier (ISO). */
  weekStart: string;
  /** Nombre max de repas (3 en gratuit). Absent = tous les créneaux. */
  maxMeals?: number;
  /** Graine : même graine ⇒ même planning. */
  seed?: string | number;
  /** Planning existant : ses repas verrouillés sont conservés s'ils restent sûrs. */
  existing?: MealPlan | null;
  /**
   * Premier jour planifiable (ISO, en général « aujourd'hui ») : les créneaux
   * antérieurs ne sont pas remplis et les repas existants de ces jours passés
   * sont conservés comme s'ils étaient verrouillés. Absent = toute la semaine.
   */
  fromDate?: string;
  /** Recettes servies récemment (pénalisées). */
  recentRecipeIds?: string[];
  /** Ingrédients du placard à écouler (bonus anti-gaspi). */
  pantryIngredientIds?: string[];
  /** Horodatage ISO de génération (tests / serveur). */
  now?: string;
}

export interface MealSlot {
  date: string;
  type: MealType;
}

export interface LlmSelection {
  meals: { date: string; type: MealType; recipeId: string; reason?: string }[];
}

/** Créneaux par défaut : dîner du lundi au dimanche + déjeuner le week-end. */
export const DEFAULT_MEAL_SLOTS: MealSlotPreference[] = [
  { weekday: 0, type: 'diner' },
  { weekday: 1, type: 'diner' },
  { weekday: 2, type: 'diner' },
  { weekday: 3, type: 'diner' },
  { weekday: 4, type: 'diner' },
  { weekday: 5, type: 'dejeuner' },
  { weekday: 5, type: 'diner' },
  { weekday: 6, type: 'dejeuner' },
  { weekday: 6, type: 'diner' },
];

/** Plafond « illimité » (Premium) : 7 jours × 2 repas. */
export const MAX_MEALS_PER_WEEK = 14;

const TYPE_ORDER: Record<MealType, number> = { dejeuner: 0, diner: 1 };

export function slotKey(date: string, type: MealType): string {
  return `${date}|${type}`;
}

function compareSlots(a: MealSlot, b: MealSlot): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
}

function sortMeals<T extends MealSlot>(meals: T[]): T[] {
  return meals.slice().sort(compareSlots);
}

// ─── Contexte de calcul ──────────────────────────────────────────────────────

type BudgetTarget = 1 | 2 | 3;

interface EngineContext {
  input: MealEngineInput;
  seedStr: string;
  portions: number;
  servings: number;
  /** Recettes sûres (allergènes, régimes, ingrédients connus). */
  safeRecipes: Recipe[];
  safeById: Map<string, Recipe>;
  /** Violations de confort hors temps, par recette. */
  equipmentKo: Set<string>;
  dislikedKo: Set<string>;
  budgetTarget: BudgetTarget;
  month: number;
  recent: Set<string>;
  pantry: Set<string>;
  proteinOf: Map<string, string | undefined>;
}

function seedString(input: MealEngineInput): string {
  return input.seed !== undefined ? String(input.seed) : `${input.profile.id}|${input.weekStart}`;
}

/** Protéine principale (1ʳᵉ viande / poisson / fruit de mer) — sert à varier. */
function mainProtein(recipe: Recipe, ingredientsById: Record<string, Ingredient>): string | undefined {
  for (const ri of recipe.ingredients) {
    if (ri.optional) continue;
    const ing = ingredientsById[ri.ingredientId];
    if (ing && (ing.isMeat || ing.isPork || ing.isFish || ing.isSeafood)) return ing.id;
  }
  return undefined;
}

/**
 * Niveau de coût visé à partir du budget hebdo par portion et par repas.
 * Le budget couvre aussi petit-déjeuner, goûters… : on le répartit sur au
 * moins 10 repas pour ne pas encourager des plats chers en offre gratuite.
 */
function budgetTargetFor(weeklyBudgetCents: number, slotCount: number, portions: number): BudgetTarget {
  if (!(weeklyBudgetCents > 0)) return 2;
  const perPortion = weeklyBudgetCents / Math.max(10, slotCount) / Math.max(1, portions);
  if (perPortion < 300) return 1;
  if (perPortion < 500) return 2;
  return 3;
}

function buildContext(input: MealEngineInput, slotCount: number): EngineContext {
  const { profile, ingredientsById } = input;
  const safeRecipes: Recipe[] = [];
  const equipmentKo = new Set<string>();
  const dislikedKo = new Set<string>();
  const proteinOf = new Map<string, string | undefined>();
  const checks = input.recipes.map((r) => checkRecipe(r, profile, ingredientsById));
  // Doublons d'id divergents (cache local périmé + version serveur…) : l'app
  // peut afficher n'importe laquelle des versions, donc un id dont AU MOINS
  // une version est dangereuse est écarté en bloc (fail closed).
  const unsafeIds = new Set<string>();
  input.recipes.forEach((r, i) => {
    if (!checks[i].safe) unsafeIds.add(r.id);
  });
  const seen = new Set<string>();
  for (let i = 0; i < input.recipes.length; i++) {
    const r = input.recipes[i];
    const check = checks[i];
    if (!check.safe || unsafeIds.has(r.id) || seen.has(r.id)) continue;
    seen.add(r.id);
    safeRecipes.push(r);
    if (check.violations.some((v) => v.kind === 'equipment')) equipmentKo.add(r.id);
    if (check.violations.some((v) => v.kind === 'disliked')) dislikedKo.add(r.id);
    proteinOf.set(r.id, mainProtein(r, ingredientsById));
  }
  const portions = householdPortions(profile.household);
  return {
    input,
    seedStr: seedString(input),
    portions,
    servings: Math.ceil(portions),
    safeRecipes,
    safeById: new Map(safeRecipes.map((r) => [r.id, r])),
    equipmentKo,
    dislikedKo,
    budgetTarget: budgetTargetFor(profile.weeklyBudgetCents, slotCount, portions),
    // Saison : mois du jeudi de la semaine (semaine « majoritaire »).
    month: monthOf(addDays(input.weekStart, 3)),
    recent: new Set(input.recentRecipeIds ?? []),
    pantry: new Set(input.pantryIngredientIds ?? []),
    proteinOf,
  };
}

// ─── Créneaux ────────────────────────────────────────────────────────────────

/** Tous les créneaux de la semaine selon le profil (triés, sans doublon). */
export function weekSlots(profile: Pick<UserProfile, 'mealSlots'>, weekStart: string): MealSlot[] {
  const prefs = profile.mealSlots && profile.mealSlots.length > 0 ? profile.mealSlots : DEFAULT_MEAL_SLOTS;
  const seen = new Set<string>();
  const out: MealSlot[] = [];
  for (const p of prefs) {
    // Données persistées corrompues (jour en texte, type inconnu) : ignorées.
    if (!p || !Number.isInteger(p.weekday) || p.weekday < 0 || p.weekday > 6) continue;
    if (p.type !== 'dejeuner' && p.type !== 'diner') continue;
    const date = addDays(weekStart, p.weekday);
    const key = slotKey(date, p.type);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ date, type: p.type });
  }
  return out.sort(compareSlots);
}

/** Jour déjà passé par rapport à `fromDate` (toujours faux sans `fromDate`). */
function isBeforeFrom(date: string, input: MealEngineInput): boolean {
  return typeof input.fromDate === 'string' && date < input.fromDate;
}

/**
 * Repas conservés (verrouillés, ou déjà passés) + créneaux à remplir (à partir
 * de `fromDate`), dans la limite de maxMeals.
 */
function resolveSlots(input: MealEngineInput, ctx: EngineContext): { kept: PlannedMeal[]; open: MealSlot[] } {
  const all = weekSlots(input.profile, input.weekStart);
  const max = Math.max(0, Math.min(input.maxMeals ?? Infinity, MAX_MEALS_PER_WEEK));
  const kept: PlannedMeal[] = [];
  const keptKeys = new Set<string>();
  // Un repas d'un jour passé est déjà mangé (ou prévu) : on ne le remplace pas.
  const existingMeals = (input.existing?.meals ?? []).filter(
    (m) =>
      m &&
      (m.locked || isBeforeFrom(m.date, input)) &&
      (m.type === 'dejeuner' || m.type === 'diner') &&
      isInWeek(m.date, input.weekStart),
  );
  for (const m of sortMeals(existingMeals)) {
    const key = slotKey(m.date, m.type);
    if (keptKeys.has(key)) continue;
    // Un repas verrouillé devenu dangereux (nouvelle allergie) est retiré.
    if (!ctx.safeById.has(m.recipeId)) continue;
    kept.push({ ...m });
    keptKeys.add(key);
  }
  const keptLimited = kept.slice(0, max);
  const open = all
    .filter((s) => !keptKeys.has(slotKey(s.date, s.type)) && !isBeforeFrom(s.date, input))
    .slice(0, Math.max(0, max - keptLimited.length));
  return { kept: keptLimited, open };
}

/** Créneaux restant à remplir (hors repas verrouillés), dans la limite de maxMeals. */
export function openSlots(input: MealEngineInput): MealSlot[] {
  return resolveSlots(input, buildContext(input, weekSlots(input.profile, input.weekStart).length)).open;
}

// ─── Score ───────────────────────────────────────────────────────────────────

interface Scored {
  recipe: Recipe;
  score: number;
}

/** Bruit déterministe [0, 1) propre au couple (créneau, recette). */
function jitter(ctx: EngineContext, slot: MealSlot, recipeId: string): number {
  return hashString(`${ctx.seedStr}|${slot.date}|${slot.type}|${recipeId}`) / 4294967296;
}

function seasonCounts(recipe: Recipe, ctx: EngineContext): { inSeason: number; outOfSeason: number } {
  let inSeason = 0;
  let outOfSeason = 0;
  for (const ri of recipe.ingredients) {
    const months = ctx.input.ingredientsById[ri.ingredientId]?.seasonMonths;
    if (!months || months.length === 0) continue;
    if (months.includes(ctx.month)) inSeason++;
    else outOfSeason++;
  }
  return { inSeason, outOfSeason };
}

function pantryMatches(recipe: Recipe, ctx: EngineContext): number {
  if (ctx.pantry.size === 0) return 0;
  let n = 0;
  for (const ri of recipe.ingredients) if (!ri.optional && ctx.pantry.has(ri.ingredientId)) n++;
  return n;
}

function maxTimeFor(slot: MealSlot, profile: UserProfile): number {
  const t = isWeekend(slot.date) ? profile.maxCookTimeWeekendMin : profile.maxCookTimeWeekdayMin;
  return t > 0 ? t : Infinity;
}

/** Score d'une recette pour un créneau, compte tenu des repas déjà placés. */
function scoreRecipe(recipe: Recipe, slot: MealSlot, assigned: readonly PlannedMeal[], ctx: EngineContext): number {
  const { profile } = ctx.input;
  let score = 0;

  // Goûts : cuisine préférée.
  if (profile.favoriteCuisines?.includes(recipe.cuisine)) score += 3;

  // Budget : coût ≤ cible → bonus, au-dessus → malus proportionnel.
  const diff = recipe.costLevel - ctx.budgetTarget;
  score += diff <= 0 ? 1.5 : -2 * diff;

  // Variété : même cuisine / même protéine les jours voisins.
  const protein = ctx.proteinOf.get(recipe.id);
  for (const m of assigned) {
    const other = ctx.safeById.get(m.recipeId) ?? ctx.input.recipes.find((r) => r.id === m.recipeId);
    if (!other) continue;
    const gap = Math.abs(daysBetween(slot.date, m.date));
    if (other.cuisine === recipe.cuisine) score -= gap <= 1 ? 1.5 : 0.4;
    const otherProtein = ctx.proteinOf.get(other.id);
    if (protein && otherProtein === protein) score -= gap <= 1 ? 2.5 : 0.8;
  }

  // Récence : éviter de resservir la même chose que les semaines passées.
  if (ctx.recent.has(recipe.id)) score -= 3;

  // Anti-gaspi : ingrédients déjà au placard.
  score += Math.min(3, pantryMatches(recipe, ctx));

  // Saison.
  const season = seasonCounts(recipe, ctx);
  score += 0.6 * Math.min(3, season.inSeason) - season.outOfSeason;

  // Rapide en semaine.
  if (!isWeekend(slot.date) && recipeTotalTime(recipe) <= 30) score += 0.5;

  // Jitter déterministe pour varier d'une graine à l'autre.
  score += 1.5 * jitter(ctx, slot, recipe.id);
  return score;
}

/** Niveaux de relâchement des contraintes de CONFORT (jamais de sécurité). */
const RELAX_LEVELS = [
  { time: true, repeat: true, equipment: true, disliked: true },
  { time: false, repeat: true, equipment: true, disliked: true },
  { time: false, repeat: false, equipment: true, disliked: true },
  { time: false, repeat: false, equipment: false, disliked: true },
  { time: false, repeat: false, equipment: false, disliked: false },
] as const;

type RelaxLevel = (typeof RELAX_LEVELS)[number];

function passesSoft(
  recipe: Recipe,
  slot: MealSlot,
  used: ReadonlySet<string>,
  level: RelaxLevel,
  ctx: EngineContext,
): boolean {
  if (!recipe.mealTypes.includes(slot.type)) return false; // jamais relâché
  if (level.time && recipeTotalTime(recipe) > maxTimeFor(slot, ctx.input.profile)) return false;
  if (level.repeat && used.has(recipe.id)) return false;
  if (level.equipment && ctx.equipmentKo.has(recipe.id)) return false;
  if (level.disliked && ctx.dislikedKo.has(recipe.id)) return false;
  return true;
}

function pickForSlot(
  slot: MealSlot,
  assigned: readonly PlannedMeal[],
  used: ReadonlySet<string>,
  ctx: EngineContext,
): { recipe: Recipe; levelIndex: number } | undefined {
  for (let i = 0; i < RELAX_LEVELS.length; i++) {
    const level = RELAX_LEVELS[i];
    let best: Scored | undefined;
    for (const r of ctx.safeRecipes) {
      if (!passesSoft(r, slot, used, level, ctx)) continue;
      const score = scoreRecipe(r, slot, assigned, ctx);
      if (!best || score > best.score || (score === best.score && r.id < best.recipe.id)) {
        best = { recipe: r, score };
      }
    }
    if (best) return { recipe: best.recipe, levelIndex: i };
  }
  return undefined;
}

// ─── Raisons « Pourquoi ce plat ? » ──────────────────────────────────────────

function explain(recipe: Recipe, slot: MealSlot, ctx: EngineContext, relaxedTime: boolean): string {
  const { profile } = ctx.input;
  const total = recipeTotalTime(recipe);
  const parts: string[] = [];
  const season = seasonCounts(recipe, ctx);
  const seasonal = season.inSeason > 0 && season.outOfSeason === 0;
  const veg = profile.diets?.find((d) => d === 'vegan' || d === 'vegetarien');

  if (relaxedTime && total > maxTimeFor(slot, profile)) parts.push(`Un peu plus long : ${total} min`);
  if (pantryMatches(recipe, ctx) > 0) parts.push('Anti-gaspi : utilise ton placard');
  if (profile.favoriteCuisines?.includes(recipe.cuisine)) {
    parts.push(`Cuisine ${lowerFirst(CUISINE_LABELS[recipe.cuisine])}, ta préférée`);
  }
  if (!isWeekend(slot.date) && total <= 30) parts.push(`Rapide : ${total} min`);
  if (seasonal) parts.push(veg ? `${DIET_LABELS[veg]} et de saison` : 'De saison');
  if (recipe.costLevel === 1) parts.push('Petit budget');
  if (parts.length === 0) {
    if (isWeekend(slot.date) && total > 30) parts.push('Un plat à mijoter le week-end');
    else if (recipe.difficulty === 1) parts.push('Facile à réaliser');
    else parts.push('Pour varier ta semaine');
  }
  return parts.slice(0, 2).map(capitalize).join(' · ');
}

// ─── Assemblage ──────────────────────────────────────────────────────────────

function mealId(ctx: EngineContext, slot: MealSlot): string {
  return `meal_${hashString(`${ctx.seedStr}|${slot.date}|${slot.type}`).toString(36)}`;
}

function planId(input: MealEngineInput, ctx: EngineContext): string {
  const existing = input.existing;
  if (existing && existing.weekStart === input.weekStart) return existing.id;
  return `plan_${input.weekStart}_${hashString(ctx.seedStr).toString(36)}`;
}

function assemble(
  input: MealEngineInput,
  preselected: ReadonlyMap<string, { recipeId: string; reason?: string }>,
  source: MealPlan['source'],
): MealPlan {
  const allSlots = weekSlots(input.profile, input.weekStart);
  const ctx = buildContext(input, Math.min(allSlots.length, input.maxMeals ?? Infinity));
  const { kept, open } = resolveSlots(input, ctx);
  const meals: PlannedMeal[] = [...kept];
  const used = new Set(kept.map((m) => m.recipeId));
  const remaining: MealSlot[] = [];

  // 1) Choix imposés (IA) d'abord, pour que le glouton ne les « vole » pas.
  for (const slot of open) {
    const pre = preselected.get(slotKey(slot.date, slot.type));
    const recipe = pre ? ctx.safeById.get(pre.recipeId) : undefined;
    if (pre && recipe && recipe.mealTypes.includes(slot.type) && !used.has(recipe.id)) {
      meals.push({
        id: mealId(ctx, slot),
        date: slot.date,
        type: slot.type,
        recipeId: recipe.id,
        servings: ctx.servings,
        reason: pre.reason?.trim() || explain(recipe, slot, ctx, false),
      });
      used.add(recipe.id);
    } else {
      remaining.push(slot);
    }
  }

  // 2) Glouton chronologique sur les créneaux restants.
  for (const slot of remaining) {
    const pick = pickForSlot(slot, meals, used, ctx);
    if (!pick) continue; // aucun plat sûr pour ce type de repas : créneau laissé vide
    meals.push({
      id: mealId(ctx, slot),
      date: slot.date,
      type: slot.type,
      recipeId: pick.recipe.id,
      servings: ctx.servings,
      reason: explain(pick.recipe, slot, ctx, pick.levelIndex >= 1),
    });
    used.add(pick.recipe.id);
  }

  return {
    id: planId(input, ctx),
    weekStart: input.weekStart,
    meals: sortMeals(meals),
    generatedAt: input.now ?? new Date().toISOString(),
    source,
  };
}

/** Planning de la semaine par le moteur de règles (déterministe pour une graine). */
export function generateMealPlan(input: MealEngineInput): MealPlan {
  return assemble(input, new Map(), 'rules');
}

/**
 * Alternatives pour « Remplacer ce plat » : recettes sûres, du bon type,
 * absentes du planning, triées (contraintes de confort respectées d'abord,
 * puis score).
 */
export function suggestAlternatives(input: MealEngineInput, plan: MealPlan, mealId: string, count = 6): Recipe[] {
  const meal = plan.meals.find((m) => m.id === mealId);
  if (!meal) return [];
  const ctx = buildContext(input, plan.meals.length);
  const inPlan = new Set(plan.meals.map((m) => m.recipeId));
  const others = plan.meals.filter((m) => m.id !== mealId);
  const strict = RELAX_LEVELS[0];
  const ranked = ctx.safeRecipes
    .filter((r) => r.mealTypes.includes(meal.type) && !inPlan.has(r.id))
    .map((r) => ({
      recipe: r,
      ok: passesSoft(r, meal, inPlan, strict, ctx),
      score: scoreRecipe(r, meal, others, ctx),
    }))
    .sort((a, b) => Number(b.ok) - Number(a.ok) || b.score - a.score || (a.recipe.id < b.recipe.id ? -1 : 1));
  return ranked.slice(0, Math.max(0, count)).map((x) => x.recipe);
}

/** Remplace la recette d'un repas (immuable). Plan inchangé si le repas n'existe pas. */
export function replaceMeal(plan: MealPlan, mealId: string, recipeId: string): MealPlan {
  if (!plan.meals.some((m) => m.id === mealId)) return plan;
  return {
    ...plan,
    meals: plan.meals.map((m) => (m.id === mealId ? { ...m, recipeId, reason: 'Choisi par toi' } : m)),
  };
}

/** Verrouille / déverrouille un repas (immuable). */
export function setMealLocked(plan: MealPlan, mealId: string, locked: boolean): MealPlan {
  return { ...plan, meals: plan.meals.map((m) => (m.id === mealId ? { ...m, locked } : m)) };
}

/** Change le nombre de portions d'un repas (immuable, minimum 1). */
export function setMealServings(plan: MealPlan, mealId: string, servings: number): MealPlan {
  // Saisie illisible (NaN, ±Infini) : on garde les portions actuelles plutôt
  // que d'écrire NaN dans le planning (et dans la liste de courses).
  if (!Number.isFinite(servings)) return plan;
  const s = Math.max(1, Math.round(servings));
  return { ...plan, meals: plan.meals.map((m) => (m.id === mealId ? { ...m, servings: s } : m)) };
}

/** Retire un repas du planning (immuable). */
export function removeMeal(plan: MealPlan, mealId: string): MealPlan {
  return { ...plan, meals: plan.meals.filter((m) => m.id !== mealId) };
}

// ─── Mode IA ─────────────────────────────────────────────────────────────────

/**
 * Pré-sélection des candidats envoyés au LLM : recettes SÛRES dont le type
 * correspond à au moins un créneau, classées par score « neutre ».
 */
export function selectLlmCandidates(input: MealEngineInput, limit = 60): Recipe[] {
  const open = openSlots(input);
  const types = new Set(open.map((s) => s.type));
  const ctx = buildContext(input, open.length);
  const ref: MealSlot = open[0] ?? { date: input.weekStart, type: 'diner' };
  return ctx.safeRecipes
    .filter((r) => r.mealTypes.some((t) => types.has(t)) && !ctx.dislikedKo.has(r.id) && !ctx.equipmentKo.has(r.id))
    .map((r) => ({ r, s: scoreRecipe(r, ref, [], ctx) }))
    .sort((a, b) => b.s - a.s || (a.r.id < b.r.id ? -1 : 1))
    .slice(0, Math.max(0, limit))
    .map((x) => x.r);
}

/**
 * Prompt français pour le LLM. Minimisation RGPD : AUCUNE donnée de santé
 * (allergies, régimes) n'est transmise — les candidats sont déjà filtrés et
 * la réponse est revalidée côté serveur.
 */
export function buildLlmPrompt(input: MealEngineInput, candidates: readonly Recipe[]): { system: string; user: string } {
  const { profile } = input;
  const open = openSlots(input);
  const portions = householdPortions(profile.household);

  const system = [
    "Tu es le chef planificateur de l'application Cabas. Tu composes les menus de la semaine d'un foyer français : variés, équilibrés, économiques et faciles.",
    'Règles impératives :',
    "1. Choisis UNIQUEMENT des recettes dont l'id figure dans la liste des candidats. N'invente jamais de recette ni d'id (les candidats ont déjà été filtrés pour les allergies et les régimes).",
    '2. Remplis chaque créneau demandé exactement une fois, avec une recette dont les types de repas incluent ce créneau.',
    "3. N'utilise jamais deux fois la même recette dans la semaine.",
    "4. Varie les cuisines et les protéines d'un jour à l'autre, privilégie les plats rapides en semaine, de saison, et respecte le budget.",
    '5. Pour chaque plat, donne une raison courte (8 mots max), en français, en tutoyant.',
    'Réponds UNIQUEMENT avec un JSON strict, sans texte autour, au format :',
    '{"meals":[{"date":"YYYY-MM-DD","type":"dejeuner|diner","recipeId":"…","reason":"…"}]}',
  ].join('\n');

  const pantryNames = (input.pantryIngredientIds ?? [])
    .map((id) => input.ingredientsById[id]?.name)
    .filter((n): n is string => !!n);

  const lines: string[] = [];
  lines.push(`Semaine du ${formatWeekRange(input.weekStart)}.`);
  lines.push(`Foyer : ${String(portions).replace('.', ',')} portions par repas.`);
  if (profile.favoriteCuisines?.length) {
    lines.push(`Cuisines préférées : ${profile.favoriteCuisines.map((c) => CUISINE_LABELS[c]).join(', ')}.`);
  }
  if (profile.weeklyBudgetCents > 0) lines.push(`Budget courses : ${formatPrice(profile.weeklyBudgetCents)} par semaine.`);
  lines.push(
    `Temps max : ${profile.maxCookTimeWeekdayMin} min en semaine, ${profile.maxCookTimeWeekendMin} min le week-end.`,
  );
  if (pantryNames.length) lines.push(`À écouler en priorité (placard) : ${pantryNames.join(', ')}.`);
  if (input.recentRecipeIds?.length) lines.push(`Servies récemment (à éviter) : ${input.recentRecipeIds.join(', ')}.`);
  lines.push('');
  lines.push('Créneaux à remplir :');
  for (const s of open) {
    lines.push(`- ${s.date} ${s.type} (${formatDayLabel(s.date, 'weekday')} ${MEAL_TYPE_LABELS[s.type].toLowerCase()})`);
  }
  lines.push('');
  lines.push('Recettes candidates (id | titre | cuisine | temps | coût 1-3 | repas | tags) :');
  for (const r of candidates) {
    lines.push(
      `${r.id} | ${r.title} | ${r.cuisine} | ${recipeTotalTime(r)} min | ${r.costLevel} | ${r.mealTypes.join(',')} | ${r.tags.join(', ')}`,
    );
  }
  return { system, user: lines.join('\n') };
}

/**
 * Fin (index inclus) du bloc JSON équilibré qui commence à `start`, ou -1.
 * Respecte les chaînes JSON (guillemets doubles, échappements) : une accolade
 * dans une chaîne ne compte pas.
 */
function matchingClose(text: string, start: number): number {
  const stack: string[] = [];
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') {
      if (stack.pop() !== ch) return -1; // mal imbriqué : pas un JSON
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

/**
 * Extrait le premier objet / tableau JSON valide d'un texte (blocs ```json, prose…).
 * Un seul `JSON.parse` par point de départ (appariement des accolades) : le
 * coût reste linéaire par candidat même avec beaucoup d'accolades parasites
 * (l'ancienne stratégie « toutes les fermetures » était quadratique en appels
 * à JSON.parse et pouvait dépasser le budget CPU de l'Edge Function).
 */
export function extractJson(text: string): unknown {
  if (typeof text !== 'string') return undefined;
  const cleaned = text.replace(/```(?:json)?/gi, '');
  for (let start = 0; start < cleaned.length; start++) {
    const ch = cleaned[start];
    if (ch !== '{' && ch !== '[') continue;
    const end = matchingClose(cleaned, start);
    if (end < 0) continue;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      // bloc équilibré mais pas du JSON (« {selon tes goûts} ») : suivant
    }
  }
  return undefined;
}

/**
 * Valide la réponse du LLM. Écarte les ids inconnus, les créneaux invalides,
 * les doublons et — SÉCURITÉ — toute recette non sûre pour le profil.
 * Renvoie null si aucun JSON exploitable n'est trouvé.
 */
export function parseLlmResponse(text: string, input: MealEngineInput, candidates: readonly Recipe[]): LlmSelection | null {
  const data = extractJson(text);
  let rawMeals: unknown;
  if (Array.isArray(data)) rawMeals = data;
  else if (data && typeof data === 'object') rawMeals = (data as { meals?: unknown }).meals;
  if (!Array.isArray(rawMeals)) return null;

  const ctx = buildContext(input, weekSlots(input.profile, input.weekStart).length);
  const { kept, open: openList } = resolveSlots(input, ctx);
  const open = new Set(openList.map((s) => slotKey(s.date, s.type)));
  const byId = new Map(candidates.map((r) => [r.id, r]));
  const usedSlots = new Set<string>();
  const usedRecipes = new Set(kept.map((m) => m.recipeId));
  const meals: LlmSelection['meals'] = [];

  for (const entry of rawMeals) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const date = typeof e.date === 'string' ? e.date.trim() : '';
    const type = e.type;
    const recipeId = typeof e.recipeId === 'string' ? e.recipeId.trim() : '';
    if (type !== 'dejeuner' && type !== 'diner') continue;
    const key = slotKey(date, type);
    if (!open.has(key) || usedSlots.has(key)) continue;
    const recipe = byId.get(recipeId);
    if (!recipe || usedRecipes.has(recipeId) || !recipe.mealTypes.includes(type)) continue;
    // Filet de sécurité : le candidat ET la recette du catalogue portant cet
    // id doivent être sûrs (un candidat falsifié ou périmé ne passe pas).
    if (!checkRecipe(recipe, input.profile, input.ingredientsById).safe) continue;
    const catalogRecipe = ctx.safeById.get(recipeId);
    if (!catalogRecipe || !catalogRecipe.mealTypes.includes(type)) continue;
    const reason = typeof e.reason === 'string' ? e.reason.trim().slice(0, 120) : undefined;
    meals.push(reason ? { date, type, recipeId, reason } : { date, type, recipeId });
    usedSlots.add(key);
    usedRecipes.add(recipeId);
  }
  return { meals };
}

/**
 * Construit le planning à partir d'une sélection (IA validée) et complète
 * les créneaux manquants avec le moteur de règles. Les recettes absentes de
 * `input.recipes` ou non sûres sont ignorées (revalidation systématique).
 */
export function planFromSelection(
  input: MealEngineInput,
  selection: LlmSelection | LlmSelection['meals'],
  source: MealPlan['source'],
): MealPlan {
  const meals = Array.isArray(selection) ? selection : selection.meals;
  const pre = new Map<string, { recipeId: string; reason?: string }>();
  for (const m of meals) {
    const key = slotKey(m.date, m.type);
    if (!pre.has(key)) pre.set(key, { recipeId: m.recipeId, reason: m.reason });
  }
  return assemble(input, pre, source);
}

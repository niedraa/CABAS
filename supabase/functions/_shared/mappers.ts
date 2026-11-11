/**
 * Conversion lignes Postgres (snake_case, via PostgREST) ⇄ modèle de domaine
 * (core/types.ts, camelCase). Fonctions PURES, testées dans mappers.test.ts.
 *
 * Les colonnes numeric peuvent arriver en nombre ou en chaîne selon le
 * client : `num()` accepte les deux. Les champs optionnels du domaine ne sont
 * posés que s'ils ont une valeur (pas de `undefined` explicite).
 */
import type {
  Allergen,
  BaseUnit,
  CatalogMeta,
  Diet,
  Entitlement,
  EstimateMethod,
  Ingredient,
  MealPlan,
  MealSlotPreference,
  PickupMode,
  PlannedMeal,
  Price,
  Product,
  Recipe,
  RecipeIngredient,
  RecipeStep,
  Store,
  StoreChain,
  SubscriptionState,
  UserProfile,
} from './core/index.ts';
import { STORE_CHAINS } from './core/index.ts';

export type Row = Record<string, unknown>;

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : v == null ? fallback : String(v));
const optStr = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const bool = (v: unknown): boolean => v === true;
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/**
 * Tableau Postgres : JSON (PostgREST) ou littéral « {a,b} » (certains clients
 * renvoient ainsi les tableaux d'énumérations).
 */
export function pgArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string' && v.startsWith('{') && v.endsWith('}')) {
    const inner = v.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((x) => x.trim().replace(/^"(.*)"$/, '$1')).filter((x) => x !== '');
  }
  return [];
}

const CHAINS: ReadonlySet<string> = new Set(STORE_CHAINS);
const PICKUP_MODES: ReadonlySet<string> = new Set(['drive', 'click_collect', 'none']);
const ESTIMATE_METHODS: ReadonlySet<string> = new Set(['chain_index', 'mdd_ratio', 'category_median']);

/** Enseignes d'une MDD : `store_chains` (référence), sinon l'ancienne colonne `store_chain`. */
function rowStoreChains(r: Row): StoreChain[] {
  const list = pgArray(r.store_chains).filter((c) => CHAINS.has(c)) as StoreChain[];
  if (list.length > 0) return Array.from(new Set(list));
  const legacy = optStr(r.store_chain);
  return legacy && CHAINS.has(legacy) ? [legacy as StoreChain] : [];
}

export function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
const optNum = (
  v: unknown,
): number | undefined => (v == null || v === '' ? undefined : Number.isFinite(num(v, NaN)) ? num(v) : undefined);

/** Normalise un horodatage Postgres en ISO 8601 (UTC). */
export function isoTimestamp(v: unknown): string {
  if (typeof v !== 'string' || v === '') return new Date(0).toISOString();
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : v;
}

// ─── Catalogue ───────────────────────────────────────────────────────────────

export function rowToIngredient(r: Row): Ingredient {
  const ing: Ingredient = {
    id: str(r.id),
    name: str(r.name),
    aisle: str(r.aisle, 'autre') as Ingredient['aisle'],
    allergens: arr<Allergen>(r.allergens),
    isMeat: bool(r.is_meat),
    isPork: bool(r.is_pork),
    isFish: bool(r.is_fish),
    isSeafood: bool(r.is_seafood),
    isAnimalProduct: bool(r.is_animal_product),
    baseUnit: str(r.base_unit, 'g') as BaseUnit,
  };
  const plural = optStr(r.name_plural);
  if (plural) ing.namePlural = plural;
  if (bool(r.is_alcohol)) ing.isAlcohol = true;
  const gpp = optNum(r.grams_per_piece);
  if (gpp !== undefined) ing.gramsPerPiece = gpp;
  const density = optNum(r.density);
  if (density !== undefined) ing.density = density;
  if (bool(r.is_pantry_staple)) ing.isPantryStaple = true;
  const months = arr<unknown>(r.season_months).map((m) => num(m)).filter((m) => m >= 1 && m <= 12);
  if (months.length > 0) ing.seasonMonths = months;
  return ing;
}

export function rowToRecipeIngredient(r: Row): RecipeIngredient {
  const ri: RecipeIngredient = {
    ingredientId: str(r.ingredient_id),
    quantity: num(r.quantity),
    unit: str(r.unit, 'g') as RecipeIngredient['unit'],
  };
  if (bool(r.optional)) ri.optional = true;
  const note = optStr(r.note);
  if (note) ri.note = note;
  return ri;
}

function toSteps(v: unknown): RecipeStep[] {
  return arr<unknown>(v)
    .filter((s): s is Row => !!s && typeof s === 'object')
    .map((s) => {
      const step: RecipeStep = { text: str(s.text) };
      const timer = optNum(s.timerMin);
      if (timer !== undefined) step.timerMin = timer;
      return step;
    });
}

/** Recette, avec ses lignes `recipe_ingredients` imbriquées (triées par position). */
export function rowToRecipe(r: Row): Recipe {
  const lines = arr<Row>(r.recipe_ingredients)
    .slice()
    .sort((a, b) => num(a.position) - num(b.position))
    .map(rowToRecipeIngredient);
  const recipe: Recipe = {
    id: str(r.id),
    title: str(r.title),
    description: str(r.description),
    emoji: str(r.emoji, '🍽️'),
    color: str(r.color, '#F6F1E7'),
    cuisine: str(r.cuisine, 'monde') as Recipe['cuisine'],
    tags: arr<string>(r.tags),
    mealTypes: arr<Recipe['mealTypes'][number]>(r.meal_types),
    servings: num(r.servings, 1),
    prepTimeMin: num(r.prep_time_min),
    cookTimeMin: num(r.cook_time_min),
    difficulty: num(r.difficulty, 1) as Recipe['difficulty'],
    equipment: arr<Recipe['equipment'][number]>(r.equipment),
    ingredients: lines,
    steps: toSteps(r.steps),
    costLevel: num(r.cost_level, 2) as Recipe['costLevel'],
  };
  const img = optStr(r.image_url);
  if (img) recipe.imageUrl = img;
  const kcal = optNum(r.kcal_per_serving);
  if (kcal !== undefined) recipe.kcalPerServing = kcal;
  return recipe;
}

export function rowToStore(r: Row): Store {
  const pickup = str(r.pickup, 'drive');
  return {
    id: str(r.id),
    chain: str(r.chain) as Store['chain'],
    name: str(r.name),
    city: str(r.city),
    pickup: (PICKUP_MODES.has(pickup) ? pickup : 'drive') as PickupMode,
    driveFeeCents: num(r.drive_fee_cents),
    deliveryFeeCents: r.delivery_fee_cents == null ? null : num(r.delivery_fee_cents),
    minOrderCents: num(r.min_order_cents),
    searchUrlTemplate: str(r.search_url_template),
    driveUrl: str(r.drive_url),
  };
}

/** Produit (colonnes de `products`, ou `product_name` pour la RPC get_prices_for_ingredients). */
export function rowToProduct(r: Row): Product {
  const p: Product = {
    id: str(r.product_id ?? r.id),
    name: str(r.product_name ?? r.name),
    brand: str(r.brand),
    isStoreBrand: bool(r.is_store_brand),
    ingredientId: str(r.ingredient_id),
    packSize: num(r.pack_size, 1),
    packUnit: str(r.pack_unit, 'piece') as BaseUnit,
    allergens: arr<Allergen>(r.allergens),
  };
  const ean = optStr(r.ean);
  if (ean) p.ean = ean;
  const category = optStr(r.off_category_tag);
  if (category) p.offCategoryTag = category;
  const chains = rowStoreChains(r);
  if (chains.length > 0) p.storeChains = chains;
  const ns = optStr(r.nutri_score);
  if (ns) p.nutriScore = ns as Product['nutriScore'];
  if (bool(r.organic)) p.organic = true;
  return p;
}

/** Prix (colonnes de `prices`, ou `price_updated_at` pour la RPC), provenance comprise. */
export function rowToPrice(r: Row): Price {
  const price: Price = {
    productId: str(r.product_id),
    storeId: str(r.store_id),
    priceCents: num(r.price_cents),
    updatedAt: isoTimestamp(r.price_updated_at ?? r.updated_at),
    source: str(r.source, 'demo') as Price['source'],
  };
  const promo = optNum(r.promo_price_cents);
  if (promo !== undefined) price.promoPriceCents = promo;
  const label = optStr(r.promo_label);
  if (label) price.promoLabel = label;
  const until = optStr(r.promo_until);
  if (until) price.promoUntil = until.slice(0, 10);
  const count = optNum(r.observation_count);
  if (count !== undefined) price.observationCount = count;
  const from = optStr(r.observed_from);
  if (from) price.observedFrom = from.slice(0, 10);
  const method = optStr(r.estimate_method);
  if (method && ESTIMATE_METHODS.has(method)) price.estimateMethod = method as EstimateMethod;
  const basis = optNum(r.estimate_basis_count);
  if (basis !== undefined) price.estimateBasisCount = basis;
  return price;
}

/** Prix domaine → ligne `prices` (upsert) : les colonnes absentes sont remises à null. */
export function priceToRow(p: Price): Row {
  return {
    product_id: p.productId,
    store_id: p.storeId,
    price_cents: p.priceCents,
    promo_price_cents: p.promoPriceCents ?? null,
    promo_label: p.promoLabel ?? null,
    promo_until: p.promoUntil ?? null,
    source: p.source,
    updated_at: p.updatedAt,
    observation_count: p.observationCount ?? null,
    observed_from: p.observedFrom ?? null,
    estimate_method: p.estimateMethod ?? null,
    estimate_basis_count: p.estimateBasisCount ?? null,
  };
}

/** Ligne `catalog_meta` → description de l'instantané (null si absente ou illisible). */
export function rowToCatalogMeta(r: Row | null | undefined): CatalogMeta | null {
  const meta = r?.meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const m = meta as Record<string, unknown>;
  if (typeof m.snapshotAt !== 'string' || typeof m.pricesFrom !== 'string' || typeof m.pricesTo !== 'string') {
    return null;
  }
  if (!m.chainIndex || typeof m.chainIndex !== 'object' || !Array.isArray(m.sources)) return null;
  return {
    snapshotAt: m.snapshotAt,
    pricesFrom: m.pricesFrom,
    pricesTo: m.pricesTo,
    observedPrices: num(m.observedPrices),
    estimatedPrices: num(m.estimatedPrices),
    chainIndex: m.chainIndex as CatalogMeta['chainIndex'],
    coverage: (m.coverage && typeof m.coverage === 'object' ? m.coverage : {}) as CatalogMeta['coverage'],
    sources: (m.sources as unknown[]).filter((s): s is CatalogMeta['sources'][number] =>
      !!s && typeof s === 'object' && typeof (s as Row).name === 'string' && typeof (s as Row).url === 'string' &&
      typeof (s as Row).license === 'string'
    ),
  };
}

// ─── Profil ──────────────────────────────────────────────────────────────────

function toMealSlots(v: unknown): MealSlotPreference[] {
  return arr<unknown>(v)
    .filter((s): s is Row => !!s && typeof s === 'object')
    .map((s) => ({ weekday: num(s.weekday, -1), type: s.type }))
    .filter(
      (s): s is MealSlotPreference =>
        Number.isInteger(s.weekday) && s.weekday >= 0 && s.weekday <= 6 &&
        (s.type === 'dejeuner' || s.type === 'diner'),
    );
}

export function rowToProfile(r: Row): UserProfile {
  return {
    id: str(r.id),
    displayName: str(r.display_name),
    household: { adults: num(r.adults, 1), children: num(r.children, 0) },
    diets: arr<Diet>(r.diets),
    allergens: arr<Allergen>(r.allergens),
    dislikedIngredientIds: arr<string>(r.disliked_ingredient_ids),
    favoriteCuisines: arr<UserProfile['favoriteCuisines'][number]>(r.favorite_cuisines),
    weeklyBudgetCents: num(r.weekly_budget_cents),
    maxCookTimeWeekdayMin: num(r.max_cook_time_weekday_min, 30),
    maxCookTimeWeekendMin: num(r.max_cook_time_weekend_min, 60),
    equipment: arr<UserProfile['equipment'][number]>(r.equipment),
    preferredStoreIds: arr<string>(r.preferred_store_ids),
    mealSlots: toMealSlots(r.meal_slots),
    healthDataConsentAt: r.health_data_consent_at == null ? null : isoTimestamp(r.health_data_consent_at),
    createdAt: isoTimestamp(r.created_at),
    updatedAt: isoTimestamp(r.updated_at),
  };
}

// ─── Planning ────────────────────────────────────────────────────────────────

export function rowToPlannedMeal(r: Row): PlannedMeal {
  const meal: PlannedMeal = {
    id: str(r.id),
    date: str(r.date).slice(0, 10),
    type: str(r.meal_type) as PlannedMeal['type'],
    recipeId: str(r.recipe_id),
    servings: num(r.servings, 1),
  };
  if (bool(r.locked)) meal.locked = true;
  const reason = optStr(r.reason);
  if (reason) meal.reason = reason;
  return meal;
}

/** Planning avec ses `planned_meals` imbriqués. */
export function rowToMealPlan(r: Row): MealPlan {
  return {
    id: str(r.id),
    weekStart: str(r.week_start).slice(0, 10),
    meals: arr<Row>(r.planned_meals).map(rowToPlannedMeal).sort((a, b) =>
      a.date === b.date ? (a.type === b.type ? 0 : a.type === 'dejeuner' ? -1 : 1) : a.date < b.date ? -1 : 1
    ),
    generatedAt: isoTimestamp(r.generated_at),
    source: str(r.source, 'rules') as MealPlan['source'],
  };
}

// ─── Abonnement ──────────────────────────────────────────────────────────────

export function rowToSubscription(r: Row | null | undefined): SubscriptionState {
  if (!r) return { entitlement: 'free', isTrial: false, expiresAt: null, productId: null, willRenew: false };
  return {
    entitlement: str(r.entitlement, 'free') as Entitlement,
    isTrial: bool(r.is_trial),
    expiresAt: r.expires_at == null ? null : isoTimestamp(r.expires_at),
    productId: optStr(r.product_id) ?? null,
    willRenew: bool(r.will_renew),
  };
}

/** Droit EFFECTIF : premium seulement s'il n'est pas expiré. */
export function effectiveEntitlement(sub: SubscriptionState, now: Date): Entitlement {
  if (sub.entitlement !== 'premium') return 'free';
  if (sub.expiresAt === null) return 'premium';
  const t = Date.parse(sub.expiresAt);
  return Number.isFinite(t) && t > now.getTime() ? 'premium' : 'free';
}

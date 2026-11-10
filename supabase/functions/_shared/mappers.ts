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
  Diet,
  Entitlement,
  Ingredient,
  MealPlan,
  MealSlotPreference,
  PlannedMeal,
  Price,
  Product,
  Recipe,
  RecipeIngredient,
  RecipeStep,
  Store,
  SubscriptionState,
  UserProfile,
} from './core/index.ts';

export type Row = Record<string, unknown>;

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : v == null ? fallback : String(v));
const optStr = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const bool = (v: unknown): boolean => v === true;
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
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
  return {
    id: str(r.id),
    chain: str(r.chain) as Store['chain'],
    name: str(r.name),
    city: str(r.city),
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
    ean: str(r.ean),
    name: str(r.product_name ?? r.name),
    brand: str(r.brand),
    isStoreBrand: bool(r.is_store_brand),
    ingredientId: str(r.ingredient_id),
    packSize: num(r.pack_size, 1),
    packUnit: str(r.pack_unit, 'piece') as BaseUnit,
    allergens: arr<Allergen>(r.allergens),
  };
  const chain = optStr(r.store_chain);
  if (chain) p.storeChain = chain as Product['storeChain'];
  const ns = optStr(r.nutri_score);
  if (ns) p.nutriScore = ns as Product['nutriScore'];
  if (bool(r.organic)) p.organic = true;
  return p;
}

/** Prix (colonnes de `prices`, ou `price_updated_at` pour la RPC). */
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
  return price;
}

/** Prix domaine → ligne `prices` (upsert). */
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

/**
 * Conversion lignes Postgres (snake_case, via PostgREST) ⇄ modèle de domaine
 * (camelCase, `core/types.ts`). Fonctions PURES.
 *
 * Alignées sur `supabase/functions/_shared/mappers.ts` (côté serveur) : les
 * colonnes numeric peuvent arriver en nombre ou en chaîne, les champs
 * optionnels du domaine ne sont posés que s'ils ont une valeur.
 */
import type {
  Allergen,
  BaseUnit,
  CatalogMeta,
  Diet,
  EstimateMethod,
  Ingredient,
  MealPlan,
  MealSlotPreference,
  NotificationPreferences,
  OrderHandoff,
  PantryItem,
  PlannedMeal,
  Price,
  Product,
  Recipe,
  RecipeIngredient,
  RecipeStep,
  PickupMode,
  ShoppingListItem,
  SpendingEntry,
  Store,
  StoreChain,
  UserProfile,
} from '@/core';
import { STORE_CHAINS } from '@/core';

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
    return inner === ''
      ? []
      : inner
          .split(',')
          .map((x) => x.trim().replace(/^"(.*)"$/, '$1'))
          .filter((x) => x !== '');
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

const optNum = (v: unknown): number | undefined =>
  v == null || v === '' ? undefined : Number.isFinite(num(v, NaN)) ? num(v) : undefined;

/** Horodatage Postgres → ISO 8601 UTC. */
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
  const months = arr<unknown>(r.season_months)
    .map((m) => num(m))
    .filter((m) => m >= 1 && m <= 12);
  if (months.length > 0) ing.seasonMonths = months;
  return ing;
}

function rowToRecipeIngredient(r: Row): RecipeIngredient {
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
      const timer = optNum(s.timerMin ?? s.timer_min);
      if (timer !== undefined) step.timerMin = timer;
      return step;
    });
}

/** Recette avec ses lignes `recipe_ingredients` imbriquées (triées par position). */
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

export function rowToProduct(r: Row): Product {
  const p: Product = {
    id: str(r.id),
    name: str(r.name),
    brand: str(r.brand),
    isStoreBrand: bool(r.is_store_brand),
    ingredientId: str(r.ingredient_id),
    packSize: num(r.pack_size, 1),
    packUnit: str(r.pack_unit, 'piece') as BaseUnit,
    allergens: arr<Allergen>(r.allergens),
  };
  // Vrac : pas de code-barres, une catégorie Open Food Facts.
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

/** Prix, provenance comprise (relevé : nombre et dates des relevés ; estimation : méthode et base). */
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

/** Ligne `catalog_meta` → description de l'instantané (null si absente ou illisible). */
export function rowToCatalogMeta(r: Row | null | undefined): CatalogMeta | null {
  const meta = r?.meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const m = meta as Row;
  if (typeof m.snapshotAt !== 'string' || typeof m.pricesFrom !== 'string' || typeof m.pricesTo !== 'string') return null;
  if (!m.chainIndex || typeof m.chainIndex !== 'object' || !Array.isArray(m.sources)) return null;
  return {
    snapshotAt: m.snapshotAt,
    pricesFrom: m.pricesFrom,
    pricesTo: m.pricesTo,
    observedPrices: num(m.observedPrices),
    estimatedPrices: num(m.estimatedPrices),
    chainIndex: m.chainIndex as CatalogMeta['chainIndex'],
    coverage: (m.coverage && typeof m.coverage === 'object' ? m.coverage : {}) as CatalogMeta['coverage'],
    sources: (m.sources as unknown[]).filter(
      (s): s is CatalogMeta['sources'][number] =>
        !!s &&
        typeof s === 'object' &&
        typeof (s as Row).name === 'string' &&
        typeof (s as Row).url === 'string' &&
        typeof (s as Row).license === 'string',
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
        Number.isInteger(s.weekday) && s.weekday >= 0 && s.weekday <= 6 && (s.type === 'dejeuner' || s.type === 'diner'),
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

/**
 * Profil → colonnes modifiables de `profiles` (l'id est la clé, = auth.uid()).
 * La base REFUSE allergies / régimes sans `health_data_consent_at` dans la même
 * écriture : sans consentement, ils sont donc toujours envoyés vides (c'est aussi
 * la forme exigée pour un retrait de consentement).
 */
export function profileToRow(p: UserProfile, onboardingCompletedAt: string | null): Row {
  const consent = p.healthDataConsentAt;
  return {
    id: p.id,
    display_name: p.displayName.slice(0, 80),
    adults: p.household.adults,
    children: p.household.children,
    diets: consent ? p.diets : [],
    allergens: consent ? p.allergens : [],
    disliked_ingredient_ids: p.dislikedIngredientIds,
    favorite_cuisines: p.favoriteCuisines,
    weekly_budget_cents: p.weeklyBudgetCents,
    max_cook_time_weekday_min: p.maxCookTimeWeekdayMin,
    max_cook_time_weekend_min: p.maxCookTimeWeekendMin,
    equipment: p.equipment,
    preferred_store_ids: p.preferredStoreIds,
    meal_slots: p.mealSlots,
    health_data_consent_at: consent,
    onboarding_completed_at: onboardingCompletedAt,
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

export function rowToMealPlan(r: Row): MealPlan {
  return {
    id: str(r.id),
    weekStart: str(r.week_start).slice(0, 10),
    meals: arr<Row>(r.planned_meals)
      .map(rowToPlannedMeal)
      .sort((a, b) =>
        a.date === b.date ? (a.type === b.type ? 0 : a.type === 'dejeuner' ? -1 : 1) : a.date < b.date ? -1 : 1,
      ),
    generatedAt: isoTimestamp(r.generated_at),
    source: str(r.source, 'rules') as MealPlan['source'],
  };
}

// ─── Liste ───────────────────────────────────────────────────────────────────

export function listItemToRow(userId: string, listId: string, item: ShoppingListItem, position: number): Row {
  return {
    user_id: userId,
    list_id: listId,
    id: item.id,
    ingredient_id: item.ingredientId ?? null,
    label: item.label.slice(0, 200),
    quantity: item.quantity,
    unit: item.unit,
    aisle: item.aisle,
    checked: item.checked,
    source: item.source,
    recipe_ids: item.recipeIds,
    packaging: item.packaging ?? null,
    pantry_staple: item.pantryStaple === true,
    note: item.note ?? null,
    position,
  };
}

export function rowToListItem(r: Row): ShoppingListItem {
  const item: ShoppingListItem = {
    id: str(r.id),
    label: str(r.label),
    quantity: num(r.quantity),
    unit: str(r.unit, 'piece') as BaseUnit,
    aisle: str(r.aisle, 'autre') as ShoppingListItem['aisle'],
    checked: bool(r.checked),
    source: str(r.source, 'manual') as ShoppingListItem['source'],
    recipeIds: arr<string>(r.recipe_ids),
  };
  const ing = optStr(r.ingredient_id);
  if (ing) item.ingredientId = ing;
  if (r.packaging && typeof r.packaging === 'object') {
    const p = r.packaging as Row;
    item.packaging = { packSize: num(p.packSize), packUnit: str(p.packUnit, item.unit) as BaseUnit, packs: num(p.packs, 1) };
  }
  if (bool(r.pantry_staple)) item.pantryStaple = true;
  const note = optStr(r.note);
  if (note) item.note = note;
  return item;
}

// ─── Placard, budget, commandes, notifications ───────────────────────────────

export function pantryToRow(userId: string, p: PantryItem): Row {
  return {
    user_id: userId,
    id: p.id,
    ingredient_id: p.ingredientId ?? null,
    label: p.label.slice(0, 200) || 'Article',
    quantity: Math.max(0, p.quantity),
    unit: p.unit,
    added_at: p.addedAt,
    expires_at: p.expiresAt ? p.expiresAt.slice(0, 10) : null,
  };
}

export function rowToPantry(r: Row): PantryItem {
  const item: PantryItem = {
    id: str(r.id),
    label: str(r.label),
    quantity: num(r.quantity),
    unit: str(r.unit, 'piece') as BaseUnit,
    addedAt: isoTimestamp(r.added_at),
  };
  const ing = optStr(r.ingredient_id);
  if (ing) item.ingredientId = ing;
  const exp = optStr(r.expires_at);
  if (exp) item.expiresAt = exp.slice(0, 10);
  return item;
}

export function spendingToRow(userId: string, e: SpendingEntry): Row {
  return {
    user_id: userId,
    id: e.id,
    date: e.date.slice(0, 10),
    store_id: e.storeId,
    total_cents: Math.max(0, Math.round(e.totalCents)),
    savings_cents: Math.max(0, Math.round(e.savingsCents || 0)),
    source: e.source,
    label: e.label ?? null,
  };
}

export function rowToSpending(r: Row): SpendingEntry {
  const e: SpendingEntry = {
    id: str(r.id),
    date: str(r.date).slice(0, 10),
    storeId: str(r.store_id),
    totalCents: num(r.total_cents),
    savingsCents: num(r.savings_cents),
    source: str(r.source, 'manual') as SpendingEntry['source'],
  };
  const label = optStr(r.label);
  if (label) e.label = label;
  return e;
}

export function handoffToRow(userId: string, h: OrderHandoff, mealPlanId: string | null): Row {
  return {
    user_id: userId,
    id: h.id,
    store_id: h.storeId,
    channel: h.channel,
    url: h.url,
    lines: h.lines,
    total_cents: Math.max(0, h.totalCents),
    status: h.status,
    meal_plan_id: mealPlanId,
    created_at: h.createdAt,
  };
}

export function notificationPrefsToRow(userId: string, p: NotificationPreferences): Row {
  return {
    user_id: userId,
    planning_reminder: p.planningReminder,
    planning_reminder_weekday: p.planningReminderWeekday,
    planning_reminder_hour: p.planningReminderHour,
    order_reminder: p.orderReminder,
    price_drops: p.priceDrops,
  };
}

export function rowToNotificationPrefs(r: Row): NotificationPreferences {
  return {
    planningReminder: r.planning_reminder !== false,
    planningReminderWeekday: num(r.planning_reminder_weekday, 6),
    planningReminderHour: num(r.planning_reminder_hour, 18),
    orderReminder: r.order_reminder !== false,
    priceDrops: r.price_drops !== false,
  };
}

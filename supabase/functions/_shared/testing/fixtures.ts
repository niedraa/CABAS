/**
 * Données et doublures de test partagées par les handler.test.ts.
 * (Jamais importé par un index.ts : non déployé.)
 */
import type { Ingredient, Price, Product, Recipe, Store, UserProfile } from '../core/index.ts';
import type { LlmClient, LlmPrompt } from '../anthropic.ts';

// ─── Catalogue miniature ─────────────────────────────────────────────────────

function ing(id: string, name: string, extra: Partial<Ingredient> = {}): Ingredient {
  return {
    id,
    name,
    aisle: 'epicerie_salee',
    allergens: [],
    isMeat: false,
    isPork: false,
    isFish: false,
    isSeafood: false,
    isAnimalProduct: false,
    baseUnit: 'g',
    ...extra,
  };
}

export const INGREDIENTS: Ingredient[] = [
  ing('pates', 'Pâtes', { allergens: ['gluten'] }),
  ing('tomate', 'Tomate', { aisle: 'fruits_legumes', gramsPerPiece: 120 }),
  ing('oignon', 'Oignon', { aisle: 'fruits_legumes', gramsPerPiece: 110 }),
  ing('arachide', 'Cacahuètes', { allergens: ['arachides'] }),
  ing('lait_coco', 'Lait de coco', { baseUnit: 'ml' }),
  ing('pois_chiches', 'Pois chiches'),
  ing('lentilles', 'Lentilles corail'),
  ing('riz', 'Riz'),
  ing('poulet', 'Blanc de poulet', { aisle: 'boucherie', isMeat: true, isAnimalProduct: true }),
  ing('saumon', 'Saumon', { aisle: 'poissonnerie', isFish: true, allergens: ['poissons'], isAnimalProduct: true }),
  ing('creme', 'Crème fraîche', { aisle: 'cremerie', allergens: ['lait'], isAnimalProduct: true, baseUnit: 'ml' }),
  ing('oeuf', 'Œuf', { aisle: 'cremerie', allergens: ['oeufs'], isAnimalProduct: true, baseUnit: 'piece' }),
  ing('courgette', 'Courgette', { aisle: 'fruits_legumes', gramsPerPiece: 250 }),
];

export const INGREDIENTS_BY_ID: Record<string, Ingredient> = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i]));

function recipe(id: string, title: string, ingredientIds: string[], extra: Partial<Recipe> = {}): Recipe {
  return {
    id,
    title,
    description: '',
    emoji: '🍽️',
    color: '#F6F1E7',
    cuisine: 'francaise',
    tags: [],
    mealTypes: ['dejeuner', 'diner'],
    servings: 4,
    prepTimeMin: 10,
    cookTimeMin: 15,
    difficulty: 1,
    equipment: ['plaques'],
    ingredients: ingredientIds.map((ingredientId) => ({ ingredientId, quantity: 200, unit: 'g' as const })),
    steps: [{ text: 'Cuisine.' }],
    costLevel: 1,
    ...extra,
  };
}

/** Recette contenant des ARACHIDES (doit être exclue pour un profil allergique). */
export const PEANUT_RECIPE_ID = 'rec_poulet_satay';

export const RECIPES: Recipe[] = [
  recipe('rec_pates_tomate', 'Pâtes à la tomate', ['pates', 'tomate', 'oignon'], { cuisine: 'italienne' }),
  recipe('rec_curry', 'Curry de pois chiches', ['pois_chiches', 'lait_coco', 'oignon', 'riz'], { cuisine: 'indienne' }),
  recipe(PEANUT_RECIPE_ID, 'Poulet satay', ['poulet', 'arachide', 'riz'], { cuisine: 'asiatique' }),
  recipe('rec_poulet_riz', 'Poulet au riz', ['poulet', 'riz', 'oignon']),
  recipe('rec_saumon', 'Saumon à la crème', ['saumon', 'riz', 'creme']),
  recipe('rec_omelette', 'Omelette tomate', ['oeuf', 'oignon', 'tomate']),
  recipe('rec_salade_pc', 'Salade de pois chiches', ['pois_chiches', 'tomate', 'oignon'], {
    cuisine: 'mediterraneenne',
  }),
  recipe('rec_riz_cantonais', 'Riz cantonais', ['riz', 'oeuf', 'oignon'], { cuisine: 'asiatique' }),
  recipe('rec_tomates_farcies', 'Tomates farcies au riz', ['tomate', 'riz', 'oignon']),
  recipe('rec_dahl', 'Dahl de lentilles', ['lentilles', 'lait_coco', 'oignon'], { cuisine: 'indienne' }),
  recipe('rec_courgettes', 'Poêlée de courgettes', ['courgette', 'oignon', 'tomate']),
  recipe('rec_risotto', 'Risotto de courgettes', ['riz', 'courgette', 'oignon'], { cuisine: 'italienne' }),
  recipe('rec_poulet_courgette', 'Poulet aux courgettes', ['poulet', 'courgette', 'tomate']),
];

export function profileFixture(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    displayName: 'Alice',
    household: { adults: 2, children: 0 },
    diets: [],
    allergens: ['arachides'],
    dislikedIngredientIds: [],
    favoriteCuisines: [],
    weeklyBudgetCents: 8000,
    maxCookTimeWeekdayMin: 45,
    maxCookTimeWeekendMin: 90,
    equipment: ['plaques', 'four'],
    preferredStoreIds: [],
    mealSlots: [],
    healthDataConsentAt: '2026-11-01T10:00:00.000Z',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

// ─── Magasins / produits / prix (comparateur) ────────────────────────────────

function store(id: Store['chain'], driveFee = 0): Store {
  return {
    id,
    chain: id,
    name: `${id} Drive`,
    city: 'Lyon',
    driveFeeCents: driveFee,
    deliveryFeeCents: 599,
    minOrderCents: 0,
    searchUrlTemplate: `https://${id}.example/s?q={query}`,
    driveUrl: `https://${id}.example/drive`,
  };
}

export const STORES: Store[] = [store('leclerc'), store('carrefour'), store('auchan'), store('lidl', 0)];

function product(id: string, ingredientId: string, packSize: number, extra: Partial<Product> = {}): Product {
  return {
    id,
    ean: String(3000000000000 + PRODUCTS_SEQ.next++),
    name: id,
    brand: 'Marque',
    isStoreBrand: false,
    ingredientId,
    packSize,
    packUnit: 'g',
    allergens: [],
    ...extra,
  };
}
const PRODUCTS_SEQ = { next: 1 };

export const PRODUCTS: Product[] = [
  product('prd_riz', 'riz', 1000),
  product('prd_riz_mdd_lidl', 'riz', 1000, { isStoreBrand: true, storeChain: 'lidl' }),
  product('prd_tomate', 'tomate', 1000),
  product('prd_oignon', 'oignon', 1000),
];

const AT = '2026-11-09T06:00:00.000Z';
function price(productId: string, storeId: string, priceCents: number, extra: Partial<Price> = {}): Price {
  return { productId, storeId, priceCents, updatedAt: AT, source: 'demo', ...extra };
}

export const PRICES: Price[] = [
  price('prd_riz', 'leclerc', 189),
  price('prd_riz', 'carrefour', 219),
  price('prd_riz', 'auchan', 199),
  price('prd_riz', 'lidl', 209),
  price('prd_riz_mdd_lidl', 'lidl', 129),
  price('prd_tomate', 'leclerc', 349),
  price('prd_tomate', 'carrefour', 299),
  price('prd_tomate', 'auchan', 329),
  price('prd_tomate', 'lidl', 279),
  price('prd_oignon', 'leclerc', 209),
  price('prd_oignon', 'carrefour', 229),
  price('prd_oignon', 'auchan', 229),
  price('prd_oignon', 'lidl', 199),
];

// ─── Doublures LLM ───────────────────────────────────────────────────────────

/** Créneaux et candidats lus dans le prompt (format de core › buildLlmPrompt). */
export function parsePrompt(prompt: LlmPrompt): { slots: { date: string; type: string }[]; candidates: string[] } {
  const slots: { date: string; type: string }[] = [];
  const candidates: string[] = [];
  for (const line of prompt.user.split('\n')) {
    const s = /^- (\d{4}-\d{2}-\d{2}) (dejeuner|diner) /.exec(line);
    if (s) slots.push({ date: s[1], type: s[2] });
    const c = /^(rec_[a-z0-9_]+) \|/.exec(line);
    if (c) candidates.push(c[1]);
  }
  return { slots, candidates };
}

export interface FakeLlm extends LlmClient {
  calls: LlmPrompt[];
}

/** LLM factice : `respond` reçoit le prompt et renvoie le texte (ou lève). */
export function fakeLlm(respond: (prompt: LlmPrompt, signal: AbortSignal) => Promise<string> | string): FakeLlm {
  const calls: LlmPrompt[] = [];
  return {
    model: 'fake-model',
    calls,
    async complete(prompt, { signal }) {
      calls.push(prompt);
      return await respond(prompt, signal);
    },
  };
}

/** LLM « sage » : chaque créneau reçoit un candidat différent, en JSON entouré de prose. */
export function wellBehavedLlm(extraMeals: { date: string; type: string; recipeId: string }[] = []): FakeLlm {
  return fakeLlm((prompt) => {
    const { slots, candidates } = parsePrompt(prompt);
    const meals = [
      ...extraMeals.map((m) => ({ ...m, reason: "Proposé par l'IA" })),
      ...slots.map((s, i) => ({
        date: s.date,
        type: s.type,
        recipeId: candidates[i % candidates.length],
        reason: 'Rapide et de saison',
      })),
    ];
    return `Voici ta semaine :\n\`\`\`json\n${JSON.stringify({ meals })}\n\`\`\``;
  });
}

/** Promesse qui ne se résout jamais (LLM qui ignore le signal d'annulation). */
export function never<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

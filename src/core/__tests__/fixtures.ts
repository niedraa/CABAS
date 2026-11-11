/// <reference types="jest" />
/**
 * Catalogue de test LOCAL (indépendant de src/data) : ingrédients couvrant
 * tous les cas de régimes / allergènes, recettes variées, produits, prix et
 * magasins pour le comparateur.
 */
import type {
  Ingredient,
  MealPlan,
  Price,
  Product,
  Recipe,
  RecipeIngredient,
  Store,
  UserProfile,
} from '../types';

type IngOpts = Partial<Ingredient> & Pick<Ingredient, 'name'>;

function ing(id: string, o: IngOpts): Ingredient {
  return {
    id,
    aisle: 'autre',
    allergens: [],
    isMeat: false,
    isPork: false,
    isFish: false,
    isSeafood: false,
    isAnimalProduct: false,
    baseUnit: 'g',
    ...o,
  };
}

export const INGREDIENTS: Ingredient[] = [
  ing('oignon', { name: 'Oignon', aisle: 'fruits_legumes', baseUnit: 'piece', gramsPerPiece: 110 }),
  ing('ail', { name: 'ail', aisle: 'fruits_legumes', baseUnit: 'piece', gramsPerPiece: 5 }),
  ing('tomate', { name: 'tomate', aisle: 'fruits_legumes', gramsPerPiece: 120, seasonMonths: [6, 7, 8, 9] }),
  ing('courgette', { name: 'courgette', aisle: 'fruits_legumes', gramsPerPiece: 200, seasonMonths: [6, 7, 8, 9] }),
  ing('citron', { name: 'citron', aisle: 'fruits_legumes', baseUnit: 'piece', gramsPerPiece: 100 }),
  ing('farine', { name: 'farine', aisle: 'epicerie_sucree', allergens: ['gluten'], density: 0.55, isPantryStaple: true }),
  ing('pates', { name: 'pâtes', aisle: 'epicerie_salee', allergens: ['gluten'] }),
  ing('riz', { name: 'riz', aisle: 'epicerie_salee' }),
  ing('huile_olive', { name: "huile d'olive", aisle: 'condiments', baseUnit: 'ml', density: 0.92, isPantryStaple: true }),
  ing('sel', { name: 'sel', aisle: 'condiments', isPantryStaple: true }),
  ing('beurre', { name: 'beurre', aisle: 'cremerie', allergens: ['lait'], isAnimalProduct: true }),
  ing('lait', { name: 'lait', aisle: 'cremerie', allergens: ['lait'], isAnimalProduct: true, baseUnit: 'ml', density: 1.03 }),
  ing('creme', { name: 'crème fraîche', aisle: 'cremerie', allergens: ['lait'], isAnimalProduct: true, baseUnit: 'ml' }),
  ing('oeuf', { name: 'œuf', aisle: 'cremerie', allergens: ['oeufs'], isAnimalProduct: true, baseUnit: 'piece', gramsPerPiece: 60 }),
  ing('parmesan', { name: 'parmesan', aisle: 'cremerie', allergens: ['lait'], isAnimalProduct: true }),
  ing('miel', { name: 'miel', aisle: 'epicerie_sucree', isAnimalProduct: true }),
  ing('poulet', { name: 'blanc de poulet', aisle: 'boucherie', isMeat: true, isAnimalProduct: true }),
  ing('boeuf', { name: 'bœuf haché', aisle: 'boucherie', isMeat: true, isAnimalProduct: true }),
  ing('lardons', { name: 'lardons', aisle: 'boucherie', isMeat: true, isPork: true, isAnimalProduct: true }),
  ing('saumon', { name: 'saumon', aisle: 'poissonnerie', isFish: true, allergens: ['poissons'], isAnimalProduct: true }),
  ing('crevettes', { name: 'crevettes', aisle: 'poissonnerie', isSeafood: true, allergens: ['crustaces'], isAnimalProduct: true }),
  ing('moules', { name: 'moules', aisle: 'poissonnerie', isSeafood: true, allergens: ['mollusques'], isAnimalProduct: true }),
  ing('vin_blanc', { name: 'vin blanc', aisle: 'boissons', isAlcohol: true, allergens: ['sulfites'], baseUnit: 'ml' }),
  ing('cacahuetes', { name: 'cacahuètes', aisle: 'epicerie_salee', allergens: ['arachides'] }),
  ing('sauce_soja', { name: 'sauce soja', aisle: 'condiments', allergens: ['soja', 'gluten'], baseUnit: 'ml' }),
  ing('tofu', { name: 'tofu', aisle: 'cremerie', allergens: ['soja'] }),
  ing('pois_chiches', { name: 'pois chiches', aisle: 'epicerie_salee' }),
  ing('lentilles', { name: 'lentilles corail', aisle: 'epicerie_salee' }),
  ing('carotte', { name: 'carotte', aisle: 'fruits_legumes', gramsPerPiece: 100 }),
  ing('pomme_de_terre', { name: 'pomme de terre', aisle: 'fruits_legumes', gramsPerPiece: 150 }),
  ing('epinards', { name: 'épinards', aisle: 'fruits_legumes', seasonMonths: [3, 4, 5, 9, 10] }),
  ing('champignon', { name: 'champignons de Paris', aisle: 'fruits_legumes' }),
  ing('persil', { name: 'persil', aisle: 'fruits_legumes', baseUnit: 'piece' }),
  ing('lait_coco', { name: 'lait de coco', aisle: 'epicerie_salee', baseUnit: 'ml' }),
  ing('sesame', { name: 'graines de sésame', aisle: 'condiments', allergens: ['sesame'] }),
  ing('moutarde', { name: 'moutarde', aisle: 'condiments', allergens: ['moutarde'] }),
  ing('noix', { name: 'noix', aisle: 'epicerie_sucree', allergens: ['fruits_a_coque'] }),
];

export const INGREDIENTS_BY_ID: Record<string, Ingredient> = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i]));

function ri(ingredientId: string, quantity: number, unit: RecipeIngredient['unit'], optional?: boolean): RecipeIngredient {
  return optional ? { ingredientId, quantity, unit, optional } : { ingredientId, quantity, unit };
}

type RecipeOpts = Partial<Recipe> & Pick<Recipe, 'title' | 'ingredients'>;

export function recipe(id: string, o: RecipeOpts): Recipe {
  return {
    id,
    description: '',
    emoji: '🍽️',
    color: '#DCEBDF',
    cuisine: 'francaise',
    tags: [],
    mealTypes: ['dejeuner', 'diner'],
    servings: 4,
    prepTimeMin: 10,
    cookTimeMin: 15,
    difficulty: 1,
    equipment: ['plaques'],
    steps: [{ text: 'Cuisiner.' }],
    costLevel: 1,
    ...o,
  };
}

export const RECIPES: Recipe[] = [
  recipe('pates_tomate', {
    title: 'Pâtes à la tomate',
    cuisine: 'italienne',
    ingredients: [ri('pates', 400, 'g'), ri('tomate', 500, 'g'), ri('oignon', 1, 'piece'), ri('huile_olive', 2, 'cs'), ri('parmesan', 40, 'g', true)],
  }),
  recipe('carbonara', {
    title: 'Pâtes carbonara',
    cuisine: 'italienne',
    ingredients: [ri('pates', 400, 'g'), ri('lardons', 200, 'g'), ri('oeuf', 3, 'piece'), ri('parmesan', 60, 'g')],
  }),
  recipe('poulet_curry', {
    title: 'Poulet curry coco',
    cuisine: 'indienne',
    ingredients: [ri('poulet', 600, 'g'), ri('lait_coco', 40, 'cl'), ri('oignon', 2, 'piece'), ri('riz', 300, 'g')],
    cookTimeMin: 25,
    costLevel: 2,
  }),
  recipe('saumon_riz', {
    title: 'Saumon, riz et citron',
    cuisine: 'francaise',
    ingredients: [ri('saumon', 500, 'g'), ri('riz', 300, 'g'), ri('citron', 1, 'piece'), ri('beurre', 20, 'g', true)],
    costLevel: 3,
    equipment: ['four'],
  }),
  recipe('crevettes_sautees', {
    title: 'Crevettes sautées à l’ail',
    cuisine: 'asiatique',
    ingredients: [ri('crevettes', 400, 'g'), ri('ail', 3, 'gousse'), ri('riz', 300, 'g'), ri('sauce_soja', 3, 'cs')],
    costLevel: 3,
  }),
  recipe('moules_marinieres', {
    title: 'Moules marinières',
    cuisine: 'francaise',
    ingredients: [ri('moules', 2, 'kg'), ri('vin_blanc', 20, 'cl'), ri('oignon', 2, 'piece'), ri('creme', 10, 'cl', true)],
    mealTypes: ['diner'],
    costLevel: 2,
  }),
  recipe('dahl', {
    title: 'Dahl de lentilles corail',
    cuisine: 'indienne',
    ingredients: [ri('lentilles', 300, 'g'), ri('lait_coco', 400, 'ml'), ri('oignon', 1, 'piece'), ri('tomate', 2, 'piece')],
    cookTimeMin: 20,
  }),
  recipe('omelette', {
    title: 'Omelette aux champignons',
    cuisine: 'francaise',
    ingredients: [ri('oeuf', 8, 'piece'), ri('champignon', 250, 'g'), ri('beurre', 20, 'g'), ri('persil', 0.5, 'botte')],
    prepTimeMin: 5,
    cookTimeMin: 10,
  }),
  recipe('tofu_sesame', {
    title: 'Tofu sauté au sésame',
    cuisine: 'asiatique',
    ingredients: [ri('tofu', 400, 'g'), ri('sesame', 2, 'cs'), ri('riz', 300, 'g'), ri('carotte', 3, 'piece')],
  }),
  recipe('boeuf_bourguignon', {
    title: 'Bœuf bourguignon',
    cuisine: 'francaise',
    ingredients: [ri('boeuf', 1, 'kg'), ri('vin_blanc', 50, 'cl'), ri('carotte', 4, 'piece'), ri('lardons', 150, 'g')],
    prepTimeMin: 30,
    cookTimeMin: 150,
    costLevel: 3,
    equipment: ['plaques', 'four'],
    mealTypes: ['dejeuner', 'diner'],
  }),
  recipe('pois_chiches_curry', {
    title: 'Curry de pois chiches',
    cuisine: 'indienne',
    ingredients: [ri('pois_chiches', 2, 'boite'), ri('lait_coco', 200, 'ml'), ri('epinards', 200, 'g'), ri('oignon', 1, 'piece')],
  }),
  recipe('gratin_dauphinois', {
    title: 'Gratin dauphinois',
    cuisine: 'francaise',
    ingredients: [ri('pomme_de_terre', 1, 'kg'), ri('creme', 20, 'cl'), ri('lait', 50, 'cl'), ri('ail', 1, 'gousse')],
    prepTimeMin: 20,
    cookTimeMin: 60,
    equipment: ['four'],
  }),
  recipe('salade_courgette', {
    title: 'Salade de courgettes au citron',
    cuisine: 'mediterraneenne',
    ingredients: [ri('courgette', 3, 'piece'), ri('citron', 1, 'piece'), ri('huile_olive', 3, 'cs'), ri('noix', 30, 'g', true)],
    mealTypes: ['dejeuner'],
    cookTimeMin: 0,
    equipment: [],
  }),
  recipe('poulet_moutarde', {
    title: 'Poulet à la moutarde',
    cuisine: 'francaise',
    ingredients: [ri('poulet', 600, 'g'), ri('moutarde', 2, 'cs'), ri('creme', 20, 'cl'), ri('pates', 300, 'g')],
    costLevel: 2,
  }),
  recipe('pad_thai', {
    title: 'Pad thaï',
    cuisine: 'asiatique',
    ingredients: [ri('riz', 250, 'g'), ri('cacahuetes', 50, 'g'), ri('oeuf', 2, 'piece'), ri('sauce_soja', 4, 'cs')],
    costLevel: 2,
  }),
  recipe('chili_sin_carne', {
    title: 'Chili sin carne',
    cuisine: 'mexicaine',
    ingredients: [ri('pois_chiches', 1, 'boite'), ri('tomate', 400, 'g'), ri('riz', 250, 'g'), ri('oignon', 1, 'piece')],
    cookTimeMin: 30,
  }),
  recipe('burger_maison', {
    title: 'Burger maison',
    cuisine: 'americaine',
    ingredients: [ri('boeuf', 500, 'g'), ri('farine', 300, 'g'), ri('tomate', 2, 'piece'), ri('oignon', 1, 'piece')],
    costLevel: 2,
    mealTypes: ['diner'],
    equipment: ['plaques', 'four'],
  }),
  recipe('soupe_carottes', {
    title: 'Velouté de carottes',
    cuisine: 'francaise',
    ingredients: [ri('carotte', 800, 'g'), ri('pomme_de_terre', 2, 'piece'), ri('oignon', 1, 'piece'), ri('sel', 1, 'pincee')],
    equipment: ['plaques', 'mixeur'],
  }),
  recipe('crepes_miel', {
    title: 'Crêpes au miel',
    cuisine: 'francaise',
    ingredients: [ri('farine', 250, 'g'), ri('lait', 50, 'cl'), ri('oeuf', 3, 'piece'), ri('miel', 3, 'cs')],
    mealTypes: ['diner'],
  }),
  recipe('riz_legumes', {
    title: 'Riz sauté aux légumes',
    cuisine: 'asiatique',
    ingredients: [ri('riz', 300, 'g'), ri('carotte', 2, 'piece'), ri('courgette', 1, 'piece'), ri('oignon', 1, 'piece')],
  }),
];

export const RECIPES_BY_ID: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

export function makeProfile(o: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'user_1',
    displayName: 'Camille',
    household: { adults: 2, children: 1 },
    diets: [],
    allergens: [],
    dislikedIngredientIds: [],
    favoriteCuisines: [],
    weeklyBudgetCents: 8000,
    maxCookTimeWeekdayMin: 30,
    maxCookTimeWeekendMin: 90,
    equipment: ['plaques', 'four', 'mixeur'],
    preferredStoreIds: ['s_leclerc'],
    mealSlots: [],
    healthDataConsentAt: '2026-09-01T10:00:00.000Z',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...o,
  };
}

// ─── Comparateur ─────────────────────────────────────────────────────────────

function store(id: string, chain: Store['chain'], o: Partial<Store> = {}): Store {
  return {
    id,
    chain,
    name: `${chain[0].toUpperCase()}${chain.slice(1)} Test`,
    city: 'Lyon',
    pickup: 'drive',
    driveFeeCents: 0,
    deliveryFeeCents: 599,
    minOrderCents: 0,
    searchUrlTemplate: `https://${chain}.example/recherche?q={query}`,
    driveUrl: `https://${chain}.example/drive`,
    ...o,
  };
}

export const STORES: Store[] = [
  store('s_leclerc', 'leclerc'),
  store('s_carrefour', 'carrefour', { driveFeeCents: 0, deliveryFeeCents: 799 }),
  store('s_lidl', 'lidl', { deliveryFeeCents: null, driveUrl: 'https://lidl.example/drive?ref=1' }),
];

function product(id: string, ingredientId: string, packSize: number, packUnit: Product['packUnit'], o: Partial<Product> = {}): Product {
  return {
    id,
    ean: '3000000000000',
    name: id,
    brand: 'Marque',
    isStoreBrand: false,
    ingredientId,
    packSize,
    packUnit,
    allergens: [],
    ...o,
  };
}

export const PRODUCTS: Product[] = [
  product('p_pates_barilla', 'pates', 500, 'g', { name: 'Spaghetti n°5', brand: 'Barilla' }),
  product('p_pates_mdd_leclerc', 'pates', 1000, 'g', { name: 'Spaghetti', brand: 'Repère', isStoreBrand: true, storeChains: ['leclerc'] }),
  product('p_pates_mdd_carrefour', 'pates', 500, 'g', { name: 'Spaghetti', brand: 'Carrefour Classic', isStoreBrand: true, storeChains: ['carrefour'] }),
  product('p_tomate_vrac', 'tomate', 1000, 'g', { name: 'Tomates rondes', brand: '' }),
  product('p_oignon_filet', 'oignon', 1000, 'g', { name: 'Oignons jaunes filet 1 kg', brand: '' }),
  product('p_oignon_piece', 'oignon', 1, 'piece', { name: 'Oignon à l’unité', brand: '' }),
  product('p_huile', 'huile_olive', 1000, 'ml', { name: 'Huile d’olive vierge extra', brand: 'Puget' }),
  product('p_huile_75', 'huile_olive', 750, 'ml', { name: 'Huile d’olive', brand: 'Carapelli' }),
];

export const PRICES: Price[] = [
  // Pâtes
  { productId: 'p_pates_barilla', storeId: 's_leclerc', priceCents: 129, updatedAt: '2026-09-01', source: 'demo' },
  { productId: 'p_pates_barilla', storeId: 's_carrefour', priceCents: 139, promoPriceCents: 99, promoUntil: '2026-09-20', updatedAt: '2026-09-01', source: 'demo' },
  { productId: 'p_pates_barilla', storeId: 's_lidl', priceCents: 149, updatedAt: '2026-09-01', source: 'demo' },
  { productId: 'p_pates_mdd_leclerc', storeId: 's_leclerc', priceCents: 119, updatedAt: '2026-09-01', source: 'demo' },
  // Prix incohérent : MDD Leclerc « vue » chez Carrefour → doit être ignorée.
  { productId: 'p_pates_mdd_leclerc', storeId: 's_carrefour', priceCents: 1, updatedAt: '2026-09-01', source: 'demo' },
  { productId: 'p_pates_mdd_carrefour', storeId: 's_carrefour', priceCents: 75, updatedAt: '2026-09-01', source: 'demo' },
  // Tomates
  { productId: 'p_tomate_vrac', storeId: 's_leclerc', priceCents: 299, updatedAt: '2026-09-01', source: 'demo' },
  { productId: 'p_tomate_vrac', storeId: 's_carrefour', priceCents: 349, updatedAt: '2026-09-01', source: 'demo' },
  { productId: 'p_tomate_vrac', storeId: 's_lidl', priceCents: 249, updatedAt: '2026-09-01', source: 'demo' },
  // Oignons
  { productId: 'p_oignon_filet', storeId: 's_leclerc', priceCents: 189, updatedAt: '2026-09-01', source: 'demo' },
  { productId: 'p_oignon_piece', storeId: 's_carrefour', priceCents: 35, updatedAt: '2026-09-01', source: 'demo' },
  { productId: 'p_oignon_filet', storeId: 's_lidl', priceCents: 159, updatedAt: '2026-09-01', source: 'demo' },
  // Huile
  { productId: 'p_huile', storeId: 's_leclerc', priceCents: 899, updatedAt: '2026-09-01', source: 'demo' },
  { productId: 'p_huile_75', storeId: 's_carrefour', priceCents: 749, updatedAt: '2026-09-01', source: 'demo' },
];

export function emptyPlan(weekStart: string, meals: MealPlan['meals'] = []): MealPlan {
  return { id: 'plan_test', weekStart, meals, generatedAt: '2026-09-07T08:00:00.000Z', source: 'rules' };
}

// ─── Intégrité du catalogue de test ──────────────────────────────────────────
// Le preset jest-expo considère tout fichier de __tests__ comme une suite :
// ce fichier vérifie donc la cohérence des fixtures. Les tests ne sont
// enregistrés que lorsqu'il est exécuté comme suite (pas quand il est importé).
const runningAsSuite = /fixtures\.ts$/.test(String(expect.getState().testPath ?? ''));
if (runningAsSuite) {
  describe('fixtures', () => {
    it('chaque ingrédient de recette existe et chaque recette a un id unique', () => {
      expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
      for (const r of RECIPES) {
        for (const x of r.ingredients) expect(INGREDIENTS_BY_ID[x.ingredientId]).toBeDefined();
      }
    });
    it('chaque prix référence un produit et un magasin connus', () => {
      const productIds = new Set(PRODUCTS.map((p) => p.id));
      const storeIds = new Set(STORES.map((s) => s.id));
      for (const p of PRICES) {
        expect(productIds.has(p.productId)).toBe(true);
        expect(storeIds.has(p.storeId)).toBe(true);
      }
    });
  });
}

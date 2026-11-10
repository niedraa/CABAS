/**
 * Liste de courses automatique : agrégation des ingrédients du planning,
 * conversion d'unités, arrondi aux conditionnements réels, fusion avec la
 * liste existante (articles manuels, cases cochées), regroupement par rayon.
 */
import type {
  Aisle,
  BaseUnit,
  Ingredient,
  MealPlan,
  PantryItem,
  Product,
  Recipe,
  ShoppingListItem,
} from './types';
import { AISLES } from './types';
import { createId } from './ids';
import { subtractPantry } from './pantry';
import { scaleRecipeIngredients } from './portions';
import { capitalize, compareFr, foldText } from './text';
import { convertBase, roundTo, toBase } from './units';

export interface BuildListOptions {
  /** Produits du catalogue : leurs contenances servent à l'arrondi. */
  products?: Product[];
  /** (V2) Placard : les quantités disponibles sont déduites. */
  pantry?: PantryItem[];
}

/** Id stable d'un article issu du planning. */
export function planItemId(ingredientId: string, unit?: BaseUnit, ingredientBase?: BaseUnit): string {
  return unit && ingredientBase && unit !== ingredientBase ? `item_${ingredientId}_${unit}` : `item_${ingredientId}`;
}

/** Quantité d'achat : pièces à l'unité supérieure, g/ml à l'unité supérieure. */
function purchaseQuantity(q: number): number {
  return Math.ceil(roundTo(q, 4) - 1e-9);
}

/**
 * Arrondi au conditionnement réel : choisit la contenance qui minimise le
 * surplus (packs × contenance − besoin) ; à surplus égal, le moins de
 * paquets. Une seule contenance par suggestion (pas de panachage).
 */
export function roundToPackaging(
  quantity: number,
  packSizes: readonly number[],
): { packSize: number; packs: number } | undefined {
  if (!(quantity > 0)) return undefined;
  let best: { packSize: number; packs: number; overshoot: number } | undefined;
  const sizes = Array.from(new Set(packSizes.filter((s) => s > 0))).sort((a, b) => a - b);
  for (const size of sizes) {
    const packs = Math.max(1, Math.ceil(roundTo(quantity / size, 6) - 1e-9));
    const overshoot = roundTo(packs * size - quantity, 6);
    if (
      !best ||
      overshoot < best.overshoot ||
      (overshoot === best.overshoot && packs < best.packs)
    ) {
      best = { packSize: size, packs, overshoot };
    }
  }
  return best ? { packSize: best.packSize, packs: best.packs } : undefined;
}

/** Contenances (dans l'unité de l'article) des produits d'un ingrédient. */
function packSizesFor(ingredient: Ingredient, unit: BaseUnit, products: readonly Product[]): number[] {
  const sizes: number[] = [];
  for (const p of products) {
    if (p.ingredientId !== ingredient.id) continue;
    const size = p.packUnit === unit ? p.packSize : convertBase(p.packSize, p.packUnit, unit, ingredient);
    if (size !== null && size > 0) sizes.push(roundTo(size, 3));
  }
  return sizes;
}

function sortItems(items: ShoppingListItem[]): ShoppingListItem[] {
  const order = (a: Aisle) => AISLES.indexOf(a);
  return items.sort((a, b) => order(a.aisle) - order(b.aisle) || compareFr(a.label, b.label));
}

/**
 * Construit la liste à partir du planning : chaque recette est mise à
 * l'échelle des portions du repas, convertie en unité de base, puis agrégée
 * par ingrédient. Les ingrédients optionnels sont ignorés ; les ingrédients
 * de placard (sel, huile…) restent listés avec `pantryStaple: true`.
 */
export function buildShoppingList(
  plan: MealPlan,
  recipesById: Record<string, Recipe>,
  ingredientsById: Record<string, Ingredient>,
  opts: BuildListOptions = {},
): ShoppingListItem[] {
  const acc = new Map<string, { ingredient: Ingredient; unit: BaseUnit; quantity: number; recipeIds: string[] }>();

  for (const meal of plan.meals) {
    const recipe = recipesById[meal.recipeId];
    if (!recipe) continue;
    for (const ri of scaleRecipeIngredients(recipe, meal.servings)) {
      if (ri.optional) continue;
      const ingredient = ingredientsById[ri.ingredientId];
      if (!ingredient) continue;
      const base = toBase(ri.quantity, ri.unit, ingredient);
      const id = planItemId(ingredient.id, base.unit, ingredient.baseUnit);
      const entry = acc.get(id);
      if (entry) {
        entry.quantity += base.quantity;
        if (!entry.recipeIds.includes(recipe.id)) entry.recipeIds.push(recipe.id);
      } else {
        acc.set(id, { ingredient, unit: base.unit, quantity: base.quantity, recipeIds: [recipe.id] });
      }
    }
  }

  let items: ShoppingListItem[] = [];
  for (const [id, e] of acc) {
    const item: ShoppingListItem = {
      id,
      ingredientId: e.ingredient.id,
      label: capitalize(e.ingredient.name),
      quantity: purchaseQuantity(e.quantity),
      unit: e.unit,
      aisle: e.ingredient.aisle,
      checked: false,
      source: 'plan',
      recipeIds: e.recipeIds,
    };
    if (e.ingredient.isPantryStaple) item.pantryStaple = true;
    items.push(item);
  }

  if (opts.pantry && opts.pantry.length > 0) {
    items = subtractPantry(items, opts.pantry, ingredientsById);
  }

  const products = opts.products ?? [];
  if (products.length > 0) {
    items = items.map((item) => {
      const ingredient = item.ingredientId ? ingredientsById[item.ingredientId] : undefined;
      if (!ingredient) return item;
      const rounded = roundToPackaging(item.quantity, packSizesFor(ingredient, item.unit, products));
      return rounded ? { ...item, packaging: { ...rounded, packUnit: item.unit } } : item;
    });
  }

  return sortItems(items);
}

/**
 * Fusionne une liste régénérée avec la précédente :
 * - les articles manuels sont conservés ;
 * - un article déjà coché reste coché si la quantité n'a pas augmenté ;
 * - les anciens articles du planning absents de la nouvelle liste disparaissent.
 */
export function mergeWithExisting(previous: readonly ShoppingListItem[], next: readonly ShoppingListItem[]): ShoppingListItem[] {
  const prevById = new Map(previous.filter((i) => i.source === 'plan').map((i) => [i.id, i]));
  const prevByIngredient = new Map(
    previous.filter((i) => i.source === 'plan' && i.ingredientId).map((i) => [i.ingredientId as string, i]),
  );
  const merged: ShoppingListItem[] = next.map((item) => {
    const prev = prevById.get(item.id) ?? (item.ingredientId ? prevByIngredient.get(item.ingredientId) : undefined);
    if (prev && prev.unit === item.unit && prev.checked && item.quantity <= prev.quantity) {
      return { ...item, checked: true };
    }
    return item;
  });
  const nextIds = new Set(next.map((i) => i.id));
  for (const item of previous) {
    if (item.source === 'manual' && !nextIds.has(item.id)) merged.push(item);
  }
  return merged;
}

/** Regroupe par rayon (ordre de parcours), non cochés d'abord dans chaque rayon. */
export function groupByAisle(items: readonly ShoppingListItem[]): { aisle: Aisle; items: ShoppingListItem[] }[] {
  const groups: { aisle: Aisle; items: ShoppingListItem[] }[] = [];
  for (const aisle of AISLES) {
    const inAisle = items.filter((i) => (AISLES.includes(i.aisle) ? i.aisle : 'autre') === aisle);
    if (inAisle.length === 0) continue;
    inAisle.sort((a, b) => Number(a.checked) - Number(b.checked) || compareFr(a.label, b.label));
    groups.push({ aisle, items: inAisle });
  }
  return groups;
}

/**
 * Mots-clés par rayon, testés dans cet ordre (le premier rayon qui
 * correspond gagne : « yaourt aux fraises » → crèmerie, « jus d'orange » →
 * boissons). Formes sans accents, minuscules ; le pluriel en s/x est toléré.
 */
const AISLE_KEYWORDS: [Aisle, string[]][] = [
  // Expressions prioritaires qui contiennent un mot-clé d'un autre rayon
  // (« sucre glace » ≠ glace, « vinaigre de vin » ≠ vin, « bouillon de poulet »…).
  ['epicerie_sucree', ['sucre glace', 'pate a tartiner', 'beurre de cacahuete']],
  ['condiments', ['vinaigre', 'bouillon']],
  ['epicerie_salee', ['lait de coco']],
  [
    'hygiene_maison',
    ['savon', 'eponge', 'sac poubelle', 'sacs poubelle', 'lessive', 'liquide vaisselle', 'papier toilette', 'essuie tout',
      'dentifrice', 'shampoing', 'shampooing', 'gel douche', 'mouchoir', 'couche', 'javel', 'nettoyant', 'deodorant',
      'coton', 'brosse a dent', 'film alimentaire', 'papier alu', 'aluminium', 'pastille lave vaisselle', 'sopalin'],
  ],
  ['surgeles', ['surgele', 'glace', 'glacon', 'congele', 'frites surgelees', 'sorbet']],
  ['boissons', ['eau', 'jus', 'soda', 'biere', 'vin', 'cafe', 'the', 'sirop', 'limonade', 'cola', 'infusion', 'boisson']],
  ['boulangerie', ['pain', 'baguette', 'brioche', 'croissant', 'pain de mie', 'viennoiserie', 'tortilla', 'wrap', 'pita']],
  [
    'cremerie',
    ['lait', 'yaourt', 'yogourt', 'fromage', 'beurre', 'creme', 'oeuf', 'emmental', 'comte', 'mozzarella', 'parmesan',
      'feta', 'chevre', 'camembert', 'skyr', 'fromage blanc', 'ricotta', 'mascarpone', 'raclette', 'gruyere'],
  ],
  [
    'boucherie',
    ['poulet', 'boeuf', 'porc', 'veau', 'agneau', 'dinde', 'jambon', 'lardon', 'saucisse', 'steak', 'viande', 'merguez',
      'chorizo', 'canard', 'escalope', 'bacon', 'hache', 'roti'],
  ],
  [
    'poissonnerie',
    ['saumon', 'thon', 'cabillaud', 'crevette', 'poisson', 'moule', 'colin', 'merlu', 'sardine', 'maquereau', 'truite',
      'lieu', 'calamar', 'surimi', 'dorade', 'bar'],
  ],
  [
    'condiments',
    ['sel', 'poivre', 'moutarde', 'ketchup', 'mayonnaise', 'vinaigre', 'huile', 'epice', 'cumin', 'curry', 'paprika',
      'sauce soja', 'bouillon', 'herbes de provence', 'cannelle', 'curcuma', 'harissa', 'pesto'],
  ],
  [
    'epicerie_sucree',
    ['sucre', 'chocolat', 'biscuit', 'confiture', 'miel', 'cereale', 'gateau', 'farine', 'levure', 'compote', 'pate a tartiner',
      'cacao', 'madeleine', 'bonbon'],
  ],
  [
    'epicerie_salee',
    ['pate', 'pates', 'riz', 'semoule', 'lentille', 'pois chiche', 'conserve', 'sauce tomate', 'coulis', 'chips', 'quinoa',
      'boulgour', 'haricot rouge', 'olive', 'cornichon', 'soupe', 'nouille', 'spaghetti', 'penne', 'puree', 'crackers'],
  ],
  [
    'fruits_legumes',
    ['pomme', 'poire', 'banane', 'orange', 'citron', 'fraise', 'framboise', 'raisin', 'kiwi', 'mangue', 'ananas', 'peche',
      'abricot', 'cerise', 'melon', 'pasteque', 'clementine', 'tomate', 'carotte', 'courgette', 'aubergine', 'poivron',
      'oignon', 'ail', 'echalote', 'salade', 'laitue', 'epinard', 'brocoli', 'chou', 'chou-fleur', 'poireau',
      'pomme de terre', 'patate', 'champignon', 'concombre', 'radis', 'avocat', 'haricot vert', 'courge', 'potiron',
      'butternut', 'navet', 'betterave', 'celeri', 'fenouil', 'persil', 'coriandre', 'basilic', 'menthe', 'ciboulette',
      'gingembre', 'legume', 'fruit', 'petits pois', 'mache', 'roquette', 'patate douce', 'citron vert'],
  ],
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Une expression régulière par rayon, compilée une seule fois : mot entier,
 * pluriel en s/x toléré (« lait » ne matche pas « laitue »).
 */
const AISLE_MATCHERS: [Aisle, RegExp][] = AISLE_KEYWORDS.map(([aisle, keywords]) => [
  aisle,
  new RegExp(`(^|[^a-z])(${keywords.map(escapeRe).join('|')})(s|x)?([^a-z]|$)`),
]);

/** Rayon probable d'un libellé libre (« sacs poubelle » → hygiène & maison). */
export function guessAisle(label: string): Aisle {
  const text = foldText(label).replace(/[^a-z0-9\s-]/g, ' ');
  for (const [aisle, re] of AISLE_MATCHERS) if (re.test(text)) return aisle;
  return 'autre';
}

/** Article ajouté à la main. */
export function createManualItem(
  label: string,
  opts: { quantity?: number; unit?: BaseUnit; aisle?: Aisle; id?: string; note?: string } = {},
): ShoppingListItem {
  const clean = label.trim().replace(/\s+/g, ' ');
  const item: ShoppingListItem = {
    id: opts.id ?? createId('manual'),
    label: capitalize(clean),
    quantity: opts.quantity !== undefined && opts.quantity > 0 ? opts.quantity : 1,
    unit: opts.unit ?? 'piece',
    aisle: opts.aisle ?? guessAisle(clean),
    checked: false,
    source: 'manual',
    recipeIds: [],
  };
  if (opts.note) item.note = opts.note;
  return item;
}

/** Coche / décoche un article (immuable). */
export function toggleItem(items: readonly ShoppingListItem[], itemId: string, checked?: boolean): ShoppingListItem[] {
  return items.map((i) => (i.id === itemId ? { ...i, checked: checked ?? !i.checked } : i));
}

/** Avancement des courses. */
export function listProgress(items: readonly ShoppingListItem[]): { done: number; total: number; ratio: number } {
  const total = items.length;
  const done = items.filter((i) => i.checked).length;
  return { done, total, ratio: total > 0 ? done / total : 0 };
}

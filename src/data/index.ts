/**
 * Catalogue Cabas embarqué — point d'entrée.
 *
 * Recettes et ingrédients maison ; produits et prix RÉELS issus des données
 * ouvertes (Open Food Facts, Open Prices, OpenStreetMap — licence ODbL, voir
 * DATA_LICENSE.md et docs/OPEN_DATA.md). Utilisé en mode démo / hors-ligne et
 * pour générer le seed de la base. Les tableaux sont exposés tels quels, avec
 * des index par identifiant pour des accès O(1).
 *
 * Chaque fichier de données (`ingredients.ts`, `recipes.ts`, `stores.ts`,
 * `products.ts`, `prices.ts`, `meta.ts`) est autonome : il n'importe que des
 * TYPES et peut donc être chargé seul par Node (type stripping) ou Deno.
 */
import type { CatalogMeta, Ingredient, Price, Product, Recipe, Store } from '../core/types';
import { ingredients } from './ingredients';
import { catalogMeta } from './meta';
import { prices } from './prices';
import { products } from './products';
import { recipes } from './recipes';
import { stores } from './stores';

export { ingredients, NON_PURCHASABLE_INGREDIENT_IDS } from './ingredients';
export { recipes } from './recipes';
export { stores } from './stores';
export { products } from './products';
export { prices } from './prices';
export { catalogMeta } from './meta';

/** Index d'un tableau par `id`. */
function indexById<T extends { id: string }>(items: readonly T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const item of items) out[item.id] = item;
  return out;
}

export const ingredientsById: Record<string, Ingredient> = indexById(ingredients);
export const recipesById: Record<string, Recipe> = indexById(recipes);
export const storesById: Record<string, Store> = indexById(stores);
export const productsById: Record<string, Product> = indexById(products);

/** Le catalogue complet, au format attendu par les services et le moteur. */
export interface Catalog {
  ingredients: Ingredient[];
  recipes: Recipe[];
  stores: Store[];
  products: Product[];
  prices: Price[];
}

export const catalog: Catalog = { ingredients, recipes, stores, products, prices };

// ─── Mentions affichées (transparence et licence) ────────────────────────────

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** « 2026-11-11 » → « novembre 2026 ». */
function monthYear(day: string): string {
  const [year, month] = day.split('-');
  return `${MONTHS[Number(month) - 1] ?? ''} ${year}`.trim();
}

/** Mention sur l'origine des prix, construite depuis la description de l'instantané. */
export function buildPriceDataNotice(meta: CatalogMeta): string {
  const parts = [
    `Prix relevés en magasin par la communauté Open Prices entre ${monthYear(meta.pricesFrom)} et ${monthYear(meta.pricesTo)}.`,
  ];
  const total = meta.observedPrices + meta.estimatedPrices;
  if (meta.estimatedPrices > 0 && total > 0) {
    const share = Math.round((100 * meta.estimatedPrices) / total);
    const label = share < 1 ? 'Moins de 1 %' : `${share} %`;
    parts.push(`${label} d’entre eux, faute de relevé, sont estimés et signalés « Estimé ».`);
  }
  parts.push('Ils sont indicatifs et peuvent varier selon ton magasin.');
  return parts.join(' ');
}

/** Mention affichée près des prix (transparence envers l'utilisateur). */
export const PRICE_DATA_NOTICE: string = buildPriceDataNotice(catalogMeta);

/** Attribution courte des données ouvertes (licence ODbL), à afficher dans l'app. */
export const DATA_ATTRIBUTION =
  'Produits : Open Food Facts · Prix : Open Prices · Enseignes : © contributeurs OpenStreetMap · Licence ODbL';

/**
 * @deprecated Ancien catalogue fictif : utiliser `PRICE_DATA_NOTICE`.
 * Alias conservé pendant la transition des écrans.
 */
export const DEMO_DATA_NOTICE = PRICE_DATA_NOTICE;

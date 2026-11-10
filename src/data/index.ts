/**
 * Catalogue de démonstration Cabas — point d'entrée.
 *
 * Utilisé en mode démo / hors-ligne (aucune variable Supabase) et pour
 * générer le seed de la base. Les tableaux sont exposés tels quels, avec des
 * index par identifiant pour des accès O(1).
 *
 * Chaque fichier de données (`ingredients.ts`, `recipes.ts`, `stores.ts`,
 * `products.ts`, `prices.ts`) est autonome : il n'importe que des TYPES et
 * peut donc être chargé seul par Node (type stripping) ou Deno.
 */
import type { Ingredient, Price, Product, Recipe, Store } from '../core/types';
import { ingredients } from './ingredients';
import { prices } from './prices';
import { products } from './products';
import { recipes } from './recipes';
import { stores } from './stores';

export { ingredients, NON_PURCHASABLE_INGREDIENT_IDS } from './ingredients';
export { recipes } from './recipes';
export { stores } from './stores';
export { products } from './products';
export { prices, DEMO_PRICES_UPDATED_AT } from './prices';

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

/** Mention affichée près des prix en mode démo (transparence envers l'utilisateur). */
export const DEMO_DATA_NOTICE =
  'Prix de démonstration : ils sont indicatifs, relevés fictivement le 9 novembre 2026 et peuvent différer des prix réels en magasin. Connecte ton compte pour voir les prix à jour de tes magasins.';

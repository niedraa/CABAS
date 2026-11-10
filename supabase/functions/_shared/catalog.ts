/**
 * Chargement du catalogue depuis Supabase, avec cache mémoire par instance
 * (le catalogue change au plus quotidiennement ; une instance d'Edge Function
 * réchauffée répond alors sans aller-retour base → budget < 10 s tenu).
 *
 * Le catalogue est public (RLS : lecture anon) : on peut le lire avec le
 * client utilisateur comme avec le client service.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Ingredient, Price, Product, Recipe, Store } from './core/index.ts';
import { fetchAll, unwrap } from './supabaseClient.ts';
import { type Row, rowToIngredient, rowToPrice, rowToProduct, rowToRecipe, rowToStore } from './mappers.ts';

/** Petit cache TTL (exporté pour les tests). */
export class TtlCache<T> {
  private value: T | undefined;
  private expiresAt = 0;
  private pending: Promise<T> | null = null;
  constructor(private readonly ttlMs: number, private readonly clock: () => number = Date.now) {}

  /** Valeur en cache, ou chargement unique partagé entre requêtes concurrentes. */
  get(load: () => Promise<T>): Promise<T> {
    if (this.value !== undefined && this.clock() < this.expiresAt) return Promise.resolve(this.value);
    if (!this.pending) {
      this.pending = load()
        .then((v) => {
          this.value = v;
          this.expiresAt = this.clock() + this.ttlMs;
          return v;
        })
        .finally(() => {
          this.pending = null;
        });
    }
    return this.pending;
  }

  clear(): void {
    this.value = undefined;
    this.expiresAt = 0;
  }
}

const CATALOG_TTL_MS = 5 * 60 * 1000;
const recipesCache = new TtlCache<{ recipes: Recipe[]; ingredients: Ingredient[] }>(CATALOG_TTL_MS);
const storesCache = new TtlCache<Store[]>(CATALOG_TTL_MS);

/** Recettes publiées (avec ingrédients) + référentiel des ingrédients. */
export function loadRecipeCatalog(client: SupabaseClient): Promise<{ recipes: Recipe[]; ingredients: Ingredient[] }> {
  return recipesCache.get(async () => {
    const [recipeRows, ingredientRows] = await Promise.all([
      fetchAll<Row>('recipes', (from, to) =>
        client
          .from('recipes')
          .select('*, recipe_ingredients(position, ingredient_id, quantity, unit, optional, note)')
          .eq('is_published', true)
          .order('id')
          .range(from, to)),
      fetchAll<Row>('ingredients', (from, to) => client.from('ingredients').select('*').order('id').range(from, to)),
    ]);
    return { recipes: recipeRows.map(rowToRecipe), ingredients: ingredientRows.map(rowToIngredient) };
  });
}

/** Magasins actifs. */
export function loadStores(client: SupabaseClient): Promise<Store[]> {
  return storesCache.get(async () => {
    const rows = unwrap<Row[]>('stores', await client.from('stores').select('*').eq('is_active', true).order('id'));
    return (rows ?? []).map(rowToStore);
  });
}

/** Ingrédients par ids (conversions d'unités du comparateur). */
export async function loadIngredientsByIds(client: SupabaseClient, ids: string[]): Promise<Ingredient[]> {
  if (ids.length === 0) return [];
  const rows = unwrap<Row[]>('ingredients', await client.from('ingredients').select('*').in('id', ids));
  return (rows ?? []).map(rowToIngredient);
}

/** Produits + prix courants pour des ingrédients (RPC get_prices_for_ingredients, paginée). */
export async function loadOffers(
  client: SupabaseClient,
  ingredientIds: string[],
): Promise<{ products: Product[]; prices: Price[] }> {
  if (ingredientIds.length === 0) return { products: [], prices: [] };
  const rows = await fetchAll<Row>(
    'get_prices_for_ingredients',
    (from, to) => client.rpc('get_prices_for_ingredients', { ingredient_ids: ingredientIds }).range(from, to),
  );
  const products = new Map<string, Product>();
  const prices: Price[] = [];
  for (const r of rows) {
    const id = String(r.product_id);
    if (!products.has(id)) products.set(id, rowToProduct(r));
    prices.push(rowToPrice(r));
  }
  return { products: Array.from(products.values()), prices };
}

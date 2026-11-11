/**
 * Catalogue (recettes, ingrédients, magasins, produits, prix).
 *
 * Deux dépôts derrière la même interface `CatalogRepository` :
 * - local : `src/data` embarqué (mode démo, et repli permanent hors-ligne) ;
 * - distant : tables Supabase (lignes snake_case → domaine via `mappers`),
 *   avec cache mémoire + AsyncStorage (`cabas/catalog-cache`) et repli sur les
 *   données locales en cas d'erreur.
 *
 * Les écrans lisent un INSTANTANÉ synchrone, toujours disponible :
 * - `getCatalogSnapshot()` (hors React) / `useCatalog()` (hook, se met à jour
 *   quand le catalogue distant arrive) ;
 * - champs : `recipes`, `ingredients`, `stores`, `products`, `prices`,
 *   `recipesById`, `ingredientsById`, `storesById`, `productsById`,
 *   `index` (core › buildCatalogIndex, pour le comparateur), `meta`
 *   (description de l'instantané de données ouvertes : base distante, sinon
 *   catalogue embarqué), `source`, `version` ;
 * - `getCatalogMeta()` : `meta` de l'instantané courant (dates, indices,
 *   couverture, sources ODbL à créditer) ;
 * - `catalogIndexWithoutAllergens(snapshot, allergens)` : index du comparateur
 *   SANS les produits contenant un allergène déclaré (jamais proposés).
 * - `refreshCatalog()` : charge le catalogue distant (production) — appelé au
 *   démarrage par `useAppBootstrap`. Sans effet en mode démo.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';

import type { Allergen, CatalogIndex, CatalogMeta, Ingredient, Price, Product, Recipe, Store } from '@/core';
import { buildCatalogIndex } from '@/core';
import { catalog as localData, catalogMeta as localMeta } from '@/data';
import { readJSON, storageKey, writeJSON } from '@/lib/storage';

import {
  rowToCatalogMeta,
  rowToIngredient,
  rowToPrice,
  rowToProduct,
  rowToRecipe,
  rowToStore,
  type Row,
} from './mappers';
import { getSupabase } from './supabase';

// ─── Dépôts ──────────────────────────────────────────────────────────────────

export interface CatalogRepository {
  readonly kind: 'local' | 'remote';
  getRecipes(): Promise<Recipe[]>;
  getIngredients(): Promise<Ingredient[]>;
  getStores(): Promise<Store[]>;
  getProducts(): Promise<Product[]>;
  /** Prix, éventuellement filtrés par produits et / ou magasins. */
  getPrices(productIds?: readonly string[], storeIds?: readonly string[]): Promise<Price[]>;
  /** Description de l'instantané de données ouvertes (null : aucune). */
  getCatalogMeta(): Promise<CatalogMeta | null>;
}

export interface CatalogData {
  recipes: Recipe[];
  ingredients: Ingredient[];
  stores: Store[];
  products: Product[];
  prices: Price[];
  /** Absente des anciens caches disque : on retombe alors sur l'instantané embarqué. */
  meta?: CatalogMeta | null;
}

/** Instantané embarqué (src/data/meta.ts). */
const LOCAL_META: CatalogMeta | null = localMeta ?? null;

function filterPrices(prices: readonly Price[], productIds?: readonly string[], storeIds?: readonly string[]): Price[] {
  const p = productIds && productIds.length > 0 ? new Set(productIds) : null;
  const s = storeIds && storeIds.length > 0 ? new Set(storeIds) : null;
  if (!p && !s) return prices.slice();
  return prices.filter((x) => (!p || p.has(x.productId)) && (!s || s.has(x.storeId)));
}

/** Catalogue embarqué (synchrone en pratique). */
export const localCatalogRepository: CatalogRepository = {
  kind: 'local',
  getRecipes: async () => localData.recipes,
  getIngredients: async () => localData.ingredients,
  getStores: async () => localData.stores,
  getProducts: async () => localData.products,
  getPrices: async (productIds, storeIds) => filterPrices(localData.prices, productIds, storeIds),
  getCatalogMeta: async () => LOCAL_META,
};

const PAGE_SIZE = 1000;
const IN_CHUNK = 150;

/** Lit toutes les pages d'une requête PostgREST (limite serveur de 1000 lignes). */
async function fetchAll(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = Array.isArray(data) ? (data as Row[]) : [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

function chunks<T>(xs: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/** Dépôt distant brut (sans cache ni repli) : utile aux tests et à `createRemoteCatalogRepository`. */
export function createSupabaseCatalogSource(client: SupabaseClient): CatalogRepository {
  return {
    kind: 'remote',
    async getRecipes() {
      const rows = await fetchAll((from, to) =>
        client
          .from('recipes')
          .select('*, recipe_ingredients(*)')
          .eq('is_published', true)
          .order('id')
          .range(from, to),
      );
      return rows.map(rowToRecipe);
    },
    async getIngredients() {
      const rows = await fetchAll((from, to) => client.from('ingredients').select('*').order('id').range(from, to));
      return rows.map(rowToIngredient);
    },
    async getStores() {
      const rows = await fetchAll((from, to) =>
        client.from('stores').select('*').eq('is_active', true).order('id').range(from, to),
      );
      return rows.map(rowToStore);
    },
    async getProducts() {
      const rows = await fetchAll((from, to) => client.from('products').select('*').order('id').range(from, to));
      return rows.map(rowToProduct);
    },
    async getPrices(productIds, storeIds) {
      const groups = productIds && productIds.length > 0 ? chunks(productIds, IN_CHUNK) : [null];
      const out: Price[] = [];
      for (const group of groups) {
        const rows = await fetchAll((from, to) => {
          let q = client.from('prices').select('*');
          if (group) q = q.in('product_id', group);
          if (storeIds && storeIds.length > 0) q = q.in('store_id', storeIds as string[]);
          return q.order('product_id').order('store_id').range(from, to);
        });
        out.push(...rows.map(rowToPrice));
      }
      return out;
    },
    async getCatalogMeta() {
      const { data, error } = await client.from('catalog_meta').select('meta').eq('id', true).maybeSingle();
      if (error) throw error;
      return rowToCatalogMeta(data as Row | null);
    },
  };
}

const CACHE_KEY = storageKey('catalog-cache');
/** Au-delà, le cache disque est rechargé depuis le réseau au démarrage. */
export const CATALOG_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface CatalogCacheFile {
  fetchedAt: number;
  data: CatalogData;
}

/**
 * Dépôt distant avec cache (mémoire puis disque) et repli local : une erreur
 * réseau ne remonte jamais jusqu'à l'écran.
 */
export function createRemoteCatalogRepository(
  source: CatalogRepository,
  opts: { fallback?: CatalogRepository } = {},
): CatalogRepository {
  const fallback = opts.fallback ?? localCatalogRepository;
  const memory = new Map<string, unknown>();
  async function cached<T>(key: keyof CatalogData, fetcher: () => Promise<T[]>, fb: () => Promise<T[]>): Promise<T[]> {
    if (memory.has(key)) return memory.get(key) as T[];
    try {
      const value = await fetcher();
      if (value.length === 0 && (key === 'recipes' || key === 'stores' || key === 'ingredients')) {
        throw new Error(`catalogue distant vide (${key})`);
      }
      memory.set(key, value);
      return value;
    } catch {
      const disk = await readJSON<CatalogCacheFile | null>(CACHE_KEY, null);
      const fromDisk = disk?.data?.[key] as T[] | undefined;
      if (fromDisk && fromDisk.length > 0) return fromDisk;
      return fb();
    }
  }
  return {
    kind: 'remote',
    getRecipes: () => cached('recipes', () => source.getRecipes(), () => fallback.getRecipes()),
    getIngredients: () => cached('ingredients', () => source.getIngredients(), () => fallback.getIngredients()),
    getStores: () => cached('stores', () => source.getStores(), () => fallback.getStores()),
    getProducts: () => cached('products', () => source.getProducts(), () => fallback.getProducts()),
    getPrices: async (productIds, storeIds) => {
      const all = await cached('prices', () => source.getPrices(), () => fallback.getPrices());
      return filterPrices(all, productIds, storeIds);
    },
    // Base distante, sinon cache disque, sinon instantané embarqué.
    getCatalogMeta: async () => {
      if (memory.has('meta')) return memory.get('meta') as CatalogMeta | null;
      let meta: CatalogMeta | null = null;
      try {
        meta = await source.getCatalogMeta();
      } catch {
        const disk = await readJSON<CatalogCacheFile | null>(CACHE_KEY, null);
        meta = disk?.data?.meta ?? null;
      }
      const value = meta ?? (await fallback.getCatalogMeta());
      memory.set('meta', value);
      return value;
    },
  };
}

/** Dépôt selon l'environnement : distant (avec cache et repli) si Supabase est configuré. */
export function getCatalogRepository(): CatalogRepository {
  const client = getSupabase();
  if (!client) return localCatalogRepository;
  if (!remoteRepo) remoteRepo = createRemoteCatalogRepository(createSupabaseCatalogSource(client));
  return remoteRepo;
}
let remoteRepo: CatalogRepository | null = null;

// ─── Instantané synchrone ────────────────────────────────────────────────────

export interface CatalogSnapshot extends CatalogData {
  recipesById: Record<string, Recipe>;
  ingredientsById: Record<string, Ingredient>;
  storesById: Record<string, Store>;
  productsById: Record<string, Product>;
  /** Index du comparateur (core › buildCatalogIndex), ingrédients compris. */
  index: CatalogIndex;
  /** Description de l'instantané de données ouvertes (base distante, sinon embarqué ; null : aucune). */
  meta: CatalogMeta | null;
  /** Provenance : embarqué, cache disque ou réseau. */
  source: 'local' | 'cache' | 'remote';
  /** Incrémenté à chaque remplacement (dépendance de mémo). */
  version: number;
}

function byId<T extends { id: string }>(xs: readonly T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const x of xs) out[x.id] = x;
  return out;
}

let version = 0;

/** Construit un instantané indexé à partir de données brutes. */
export function buildCatalogSnapshot(data: CatalogData, source: CatalogSnapshot['source']): CatalogSnapshot {
  version += 1;
  return {
    ...data,
    recipesById: byId(data.recipes),
    ingredientsById: byId(data.ingredients),
    storesById: byId(data.stores),
    productsById: byId(data.products),
    index: buildCatalogIndex(data.products, data.prices, data.stores, data.ingredients),
    meta: data.meta ?? LOCAL_META,
    source,
    version,
  };
}

/** Description de l'instantané courant (dates des relevés, indices, couverture, sources à créditer). */
export function getCatalogMeta(): CatalogMeta | null {
  return getCatalogSnapshot().meta;
}

/** Vrai si le produit contient au moins un des allergènes. */
export function productHasAllergen(product: Pick<Product, 'allergens'>, allergens: readonly Allergen[]): boolean {
  if (allergens.length === 0) return false;
  const set = new Set(allergens);
  return product.allergens.some((a) => set.has(a));
}

const safeIndexCache = new WeakMap<CatalogSnapshot, Map<string, CatalogIndex>>();

/**
 * Index du comparateur SANS les produits contenant un allergène déclaré du
 * profil : un tel produit n'est jamais proposé (offre, alternative MDD, choix).
 * Sans allergène, l'index habituel. Mémoïsé par instantané.
 */
export function catalogIndexWithoutAllergens(snapshot: CatalogSnapshot, allergens: readonly Allergen[] | undefined): CatalogIndex {
  if (!allergens || allergens.length === 0) return snapshot.index;
  const key = Array.from(new Set(allergens)).sort().join(',');
  let byKey = safeIndexCache.get(snapshot);
  if (!byKey) {
    byKey = new Map();
    safeIndexCache.set(snapshot, byKey);
  }
  const hit = byKey.get(key);
  if (hit) return hit;
  const products = snapshot.products.filter((p) => !productHasAllergen(p, allergens));
  const index = buildCatalogIndex(products, snapshot.prices, snapshot.stores, snapshot.ingredients);
  byKey.set(key, index);
  return index;
}

let snapshot: CatalogSnapshot | null = null;
const listeners = new Set<() => void>();

/** Instantané courant (catalogue embarqué tant que le distant n'est pas chargé). */
export function getCatalogSnapshot(): CatalogSnapshot {
  if (!snapshot) snapshot = buildCatalogSnapshot(localData, 'local');
  return snapshot;
}

/** Remplace l'instantané (catalogue distant chargé, tests). */
export function setCatalogSnapshot(next: CatalogSnapshot): void {
  snapshot = next;
  for (const l of Array.from(listeners)) l();
}

export function subscribeCatalog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Hook : instantané du catalogue (re-rendu quand il change). */
export function useCatalog(): CatalogSnapshot {
  return useSyncExternalStore(subscribeCatalog, getCatalogSnapshot, getCatalogSnapshot);
}

/** Recette par id (undefined si inconnue). */
export function getRecipe(id: string): Recipe | undefined {
  return getCatalogSnapshot().recipesById[id];
}

let refreshing: Promise<CatalogSnapshot> | null = null;

/**
 * Production : charge le cache disque (immédiat) puis le catalogue distant,
 * et publie le nouvel instantané. Mode démo : renvoie l'instantané embarqué.
 */
export function refreshCatalog(opts: { force?: boolean } = {}): Promise<CatalogSnapshot> {
  const client = getSupabase();
  if (!client) return Promise.resolve(getCatalogSnapshot());
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const disk = await readJSON<CatalogCacheFile | null>(CACHE_KEY, null);
    if (disk?.data && disk.data.recipes?.length > 0 && getCatalogSnapshot().source === 'local') {
      setCatalogSnapshot(buildCatalogSnapshot(disk.data, 'cache'));
    }
    const fresh = !!disk && Date.now() - disk.fetchedAt < CATALOG_CACHE_TTL_MS;
    if (fresh && !opts.force) return getCatalogSnapshot();
    const source = createSupabaseCatalogSource(client);
    try {
      const [recipes, ingredients, stores, products, prices, meta] = await Promise.all([
        source.getRecipes(),
        source.getIngredients(),
        source.getStores(),
        source.getProducts(),
        source.getPrices(),
        // Facultatif : une erreur ici ne bloque pas le catalogue (repli embarqué).
        source.getCatalogMeta().catch(() => null),
      ]);
      if (recipes.length === 0 || ingredients.length === 0 || stores.length === 0) {
        return getCatalogSnapshot();
      }
      const data: CatalogData = { recipes, ingredients, stores, products, prices, meta };
      await writeJSON(CACHE_KEY, { fetchedAt: Date.now(), data } satisfies CatalogCacheFile);
      const next = buildCatalogSnapshot(data, 'remote');
      setCatalogSnapshot(next);
      return next;
    } catch {
      return getCatalogSnapshot();
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

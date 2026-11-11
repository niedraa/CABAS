/**
 * Comparateur de prix et panier optimisé.
 *
 * - `computeComparison(items, storeIds?)` : comparaison article par article
 *   (core › compareList) sur le catalogue local — instantanée, hors-ligne.
 * - `computeBasket(req)` : comparaison sur TOUS les magasins (≥ 3 enseignes)
 *   + panier (core › optimizeBasket) restreint aux magasins choisis.
 *   Production : Edge Function `optimize-basket` (prix frais) avec repli local.
 *   Le mode « le moins cher » multi-magasins est Premium : un compte gratuit
 *   reçoit le panier « un seul magasin » (`downgraded: true`).
 * - `applyProductChoices` : remplace l'offre d'un article par le produit
 *   choisi (ex. alternative MDD) dans les magasins qui le vendent.
 *
 * Allergènes : avec `allergens` (allergènes déclarés du profil), un produit
 * qui en contient un (allergènes de l'ingrédient ∪ déclarés par Open Food
 * Facts) n'est JAMAIS proposé — ni offre, ni alternative, ni choix. Côté
 * serveur, `optimize-basket` applique la même règle avec le profil en base.
 */
import type {
  Allergen,
  BasketLine,
  BasketMode,
  BasketPlan,
  Entitlement,
  ItemComparison,
  OrderChannel,
  ShoppingListItem,
  StoreOffer,
} from '@/core';
import { allOffersForItem, canUse, compareList, optimizeBasket } from '@/core';

import { catalogIndexWithoutAllergens, getCatalogSnapshot, productHasAllergen, type CatalogSnapshot } from './catalog';
import { errorMessage, getSupabase } from './supabase';

export const BASKET_TIMEOUT_MS = 9000;

export interface BasketRequest {
  items: ShoppingListItem[];
  mode: BasketMode;
  /** Magasins du panier ; vide = tous. */
  storeIds: string[];
  channel: OrderChannel;
  entitlement: Entitlement;
  /** itemId → productId choisi (alternative MDD, marque préférée). */
  productChoices?: Record<string, string>;
  /** Allergènes déclarés du profil : aucun produit qui en contient n'est proposé. */
  allergens?: readonly Allergen[];
}

export interface BasketResult {
  comparisons: ItemComparison[];
  plan: BasketPlan;
  /** Mode réellement appliqué (rétrogradé en 'single_store' pour un compte gratuit). */
  mode: BasketMode;
  downgraded: boolean;
  source: 'remote' | 'local' | 'fallback';
  durationMs: number;
  fallbackReason?: string;
  /**
   * Articles sans aucune offre PARCE QUE tous les produits connus contiennent
   * un allergène déclaré (à dire comme tel, pas « introuvable »).
   */
  allergenExcludedItemIds: string[];
}

export type BasketRemote = (body: {
  items: ShoppingListItem[];
  mode: BasketMode;
  storeIds?: string[];
  channel: OrderChannel;
}, timeoutMs: number) => Promise<unknown>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function compareOffers(a: StoreOffer, b: StoreOffer): number {
  return (
    a.totalCents - b.totalCents ||
    a.pricePerBaseUnitCents - b.pricePerBaseUnitCents ||
    (a.storeId < b.storeId ? -1 : a.storeId > b.storeId ? 1 : 0)
  );
}

/**
 * Applique les choix de produit : pour un article dont le produit a été
 * choisi, l'offre de chaque magasin qui vend ce produit est remplacée par
 * celle de ce produit ; les autres magasins gardent leur meilleure offre.
 */
export function applyProductChoices(
  comparisons: readonly ItemComparison[],
  items: readonly ShoppingListItem[],
  choices: Record<string, string> | undefined,
  catalog: CatalogSnapshot = getCatalogSnapshot(),
  allergens?: readonly Allergen[],
): ItemComparison[] {
  if (!choices || Object.keys(choices).length === 0) return comparisons.slice();
  const index = catalogIndexWithoutAllergens(catalog, allergens);
  const itemsById = new Map(items.map((i) => [i.id, i]));
  return comparisons.map((c) => {
    const productId = choices[c.itemId];
    const item = itemsById.get(c.itemId);
    if (!productId || !item) return c;
    // Produit choisi contenant un allergène déclaré : choix ignoré (absent de l'index sûr).
    const chosen = allOffersForItem(item, index).filter((o) => o.productId === productId);
    if (chosen.length === 0) return c;
    const byStore = new Map(c.offers.map((o) => [o.storeId, o]));
    for (const o of chosen) byStore.set(o.storeId, o);
    const offers = Array.from(byStore.values()).sort(compareOffers);
    const next: ItemComparison = { ...c, offers, best: offers[0] };
    // L'alternative est désormais choisie : on ne la propose plus.
    if (c.cheaperAlternative?.productId === productId) delete next.cheaperAlternative;
    return next;
  });
}

/**
 * Retire d'une comparaison (ex. réponse du serveur) les offres dont le
 * produit, connu du catalogue, contient un allergène déclaré.
 */
export function withoutAllergenOffers(
  comparisons: readonly ItemComparison[],
  allergens: readonly Allergen[] | undefined,
  catalog: CatalogSnapshot = getCatalogSnapshot(),
): ItemComparison[] {
  if (!allergens || allergens.length === 0) return comparisons.slice();
  const unsafe = (productId: string) => {
    const p = catalog.productsById[productId];
    return !!p && productHasAllergen(p, allergens);
  };
  return comparisons.map((c) => {
    const offers = c.offers.filter((o) => !unsafe(o.productId));
    if (offers.length === c.offers.length && !(c.cheaperAlternative && unsafe(c.cheaperAlternative.productId))) return c;
    const next: ItemComparison = { itemId: c.itemId, label: c.label, offers };
    if (offers[0]) next.best = offers[0];
    if (c.cheaperAlternative && !unsafe(c.cheaperAlternative.productId)) next.cheaperAlternative = c.cheaperAlternative;
    return next;
  });
}

/**
 * Une ligne (panier, commande) vise-t-elle un produit connu contenant un des
 * allergènes déclarés ? Cas d'un panier calculé AVANT que le profil ne déclare
 * cet allergène : il ne doit plus être affiché, commandé ni copié.
 */
export function linesHaveAllergen(
  lines: readonly Pick<BasketLine, 'productId'>[],
  allergens: readonly Allergen[] | undefined,
  catalog: CatalogSnapshot = getCatalogSnapshot(),
): boolean {
  if (!allergens || allergens.length === 0) return false;
  return lines.some((l) => {
    const p = catalog.productsById[l.productId];
    return !!p && productHasAllergen(p, allergens);
  });
}

/** Panier dont une part contient un produit allergène pour ce profil (à recalculer, jamais à commander). */
export function planHasAllergen(
  plan: Pick<BasketPlan, 'parts'> | null | undefined,
  allergens: readonly Allergen[] | undefined,
  catalog: CatalogSnapshot = getCatalogSnapshot(),
): boolean {
  return !!plan && plan.parts.some((part) => linesHaveAllergen(part.lines, allergens, catalog));
}

/**
 * Articles sans offre sûre alors que le catalogue en a : tous leurs produits
 * connus contiennent un allergène déclaré du profil.
 */
export function allergenExcludedItems(
  items: readonly ShoppingListItem[],
  comparisons: readonly ItemComparison[],
  allergens: readonly Allergen[] | undefined,
  catalog: CatalogSnapshot = getCatalogSnapshot(),
): string[] {
  if (!allergens || allergens.length === 0) return [];
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const full = catalogIndexWithoutAllergens(catalog, []);
  return comparisons
    .filter((c) => c.offers.length === 0)
    .map((c) => c.itemId)
    .filter((id) => {
      const item = itemsById.get(id);
      return !!item && allOffersForItem(item, full).length > 0;
    });
}

/**
 * Budget estimé d'une liste (centimes) : somme des meilleures offres, toutes
 * enseignes, SANS les produits contenant un allergène déclaré (comme le
 * panier) ; `null` si rien n'est chiffré.
 */
export function listEstimateFor(
  items: readonly ShoppingListItem[],
  allergens: readonly Allergen[] | undefined,
  catalog: CatalogSnapshot = getCatalogSnapshot(),
): number | null {
  let total = 0;
  for (const c of compareList(items, catalogIndexWithoutAllergens(catalog, allergens))) total += c.best?.totalCents ?? 0;
  return total > 0 ? total : null;
}

/** Comparaison locale (articles non cochés). `storeIds` restreint les offres affichées. */
export function computeComparison(
  items: readonly ShoppingListItem[],
  storeIds?: readonly string[],
  catalog: CatalogSnapshot = getCatalogSnapshot(),
  allergens?: readonly Allergen[],
): ItemComparison[] {
  const comparisons = compareList(items, catalogIndexWithoutAllergens(catalog, allergens));
  if (!storeIds || storeIds.length === 0) return comparisons;
  const allowed = new Set(storeIds);
  return comparisons.map((c) => {
    const offers = c.offers.filter((o) => allowed.has(o.storeId));
    const next: ItemComparison = { itemId: c.itemId, label: c.label, offers };
    if (offers[0]) next.best = offers[0];
    if (c.cheaperAlternative && allowed.has(c.cheaperAlternative.storeId)) next.cheaperAlternative = c.cheaperAlternative;
    return next;
  });
}

/** Mode autorisé pour un droit donné. */
export function effectiveBasketMode(mode: BasketMode, entitlement: Entitlement): BasketMode {
  return mode === 'cheapest' && !canUse('optimized_basket', entitlement) ? 'single_store' : mode;
}

function knownStoreIds(storeIds: readonly string[], catalog: CatalogSnapshot): string[] {
  return storeIds.filter((id) => !!catalog.storesById[id]);
}

/** Calcul local complet (comparaison + panier). */
export function computeBasketLocal(req: BasketRequest, catalog: CatalogSnapshot = getCatalogSnapshot()): Omit<BasketResult, 'source' | 'durationMs'> {
  const mode = effectiveBasketMode(req.mode, req.entitlement);
  const nowIso = new Date().toISOString();
  const index = catalogIndexWithoutAllergens(catalog, req.allergens);
  const comparisons = applyProductChoices(
    compareList(req.items, index, nowIso),
    req.items,
    req.productChoices,
    catalog,
    req.allergens,
  );
  const allowed = knownStoreIds(req.storeIds, catalog);
  const plan = optimizeBasket(comparisons, catalog.stores, mode, {
    channel: req.channel,
    allowedStoreIds: allowed.length > 0 ? allowed : undefined,
    now: nowIso,
  });
  return {
    comparisons,
    plan,
    mode,
    downgraded: mode !== req.mode,
    allergenExcludedItemIds: allergenExcludedItems(req.items, comparisons, req.allergens, catalog),
  };
}

function parseRemoteBasket(raw: unknown): { comparisons: ItemComparison[]; plan: BasketPlan; mode?: BasketMode } | null {
  if (!isRecord(raw) || !Array.isArray(raw.comparisons) || !isRecord(raw.plan)) return null;
  const plan = raw.plan as unknown as BasketPlan;
  if (!Array.isArray(plan.parts) || typeof plan.totalCents !== 'number') return null;
  const meta = isRecord(raw.meta) ? raw.meta : {};
  const mode = meta.mode === 'cheapest' || meta.mode === 'single_store' ? (meta.mode as BasketMode) : undefined;
  return { comparisons: raw.comparisons as ItemComparison[], plan, mode };
}

export interface BasketService {
  computeBasket(req: BasketRequest): Promise<BasketResult>;
}

export function createBasketService(deps: { remote: BasketRemote | null; getCatalog?: () => CatalogSnapshot; now?: () => number }): BasketService {
  const getCatalog = deps.getCatalog ?? getCatalogSnapshot;
  const now = deps.now ?? (() => Date.now());
  return {
    async computeBasket(req) {
      const started = now();
      const catalog = getCatalog();
      const unchecked = req.items.filter((i) => !i.checked);
      const hasChoices = !!req.productChoices && Object.keys(req.productChoices).length > 0;
      // Les choix de produits sont un réglage local : calcul local dans ce cas.
      if (deps.remote && !hasChoices) {
        try {
          const raw = await deps.remote(
            {
              items: unchecked,
              mode: req.mode,
              storeIds: req.storeIds.length > 0 ? req.storeIds : undefined,
              channel: req.channel,
            },
            BASKET_TIMEOUT_MS,
          );
          const parsed = parseRemoteBasket(raw);
          if (!parsed) throw new Error('réponse illisible');
          // Défense en profondeur : le serveur filtre déjà selon le profil en base.
          if (req.allergens && req.allergens.length > 0) {
            const safe = withoutAllergenOffers(parsed.comparisons, req.allergens, catalog);
            const unsafeInPlan = parsed.plan.parts.some((part) =>
              part.lines.some((l) => {
                const p = catalog.productsById[l.productId];
                return !!p && productHasAllergen(p, req.allergens ?? []);
              }),
            );
            // Un panier distant contenant un produit à risque est recalculé localement.
            if (unsafeInPlan) throw new Error('panier distant non conforme aux allergies');
            parsed.comparisons = safe;
          }
          // Le serveur applique lui-même la limite gratuite ; on la réapplique par sécurité.
          const mode = parsed.mode ?? effectiveBasketMode(req.mode, req.entitlement);
          if (mode === 'cheapest' && !canUse('optimized_basket', req.entitlement)) throw new Error('mode non autorisé');
          return {
            comparisons: parsed.comparisons,
            plan: parsed.plan,
            mode,
            downgraded: mode !== req.mode,
            source: 'remote',
            durationMs: now() - started,
            allergenExcludedItemIds: allergenExcludedItems(unchecked, parsed.comparisons, req.allergens, catalog),
          };
        } catch (err) {
          const local = computeBasketLocal({ ...req, items: unchecked }, catalog);
          return { ...local, source: 'fallback', durationMs: now() - started, fallbackReason: errorMessage(err) };
        }
      }
      const local = computeBasketLocal({ ...req, items: unchecked }, catalog);
      return { ...local, source: 'local', durationMs: now() - started };
    },
  };
}

/** Appel réel de `optimize-basket` (null en mode démo). */
export function supabaseBasketRemote(): BasketRemote | null {
  const client = getSupabase();
  if (!client) return null;
  return async (body, timeoutMs) => {
    const { data, error } = await client.functions.invoke('optimize-basket', { body, timeout: timeoutMs });
    if (error) throw error;
    return data;
  };
}

let defaultService: BasketService | null = null;

export function getBasketService(): BasketService {
  if (!defaultService) defaultService = createBasketService({ remote: supabaseBasketRemote() });
  return defaultService;
}

export function __setBasketServiceForTests(s: BasketService | null): void {
  defaultService = s;
}

/** Panier optimisé (distant si disponible, sinon local). */
export const computeBasket = (req: BasketRequest): Promise<BasketResult> => getBasketService().computeBasket(req);

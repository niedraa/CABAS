/**
 * optimize-basket — comparateur de prix + panier optimisé.
 *
 * POST { items: ShoppingListItem[], mode: 'cheapest' | 'single_store',
 *        storeIds?: string[], channel?: 'drive' | 'delivery', maxStores?: 1-4, save?: boolean }
 * (JWT utilisateur obligatoire)
 *
 * - Comparaison (core › compareList) sur TOUS les magasins actifs : chaque
 *   article est comparé dans au moins 3 enseignes quand le catalogue le permet
 *   (critère du dossier) — fonctionnalité GRATUITE.
 * - Panier (core › optimizeBasket) restreint aux magasins choisis (storeIds,
 *   sinon magasins préférés du profil, sinon tous).
 * - Le mode « le moins cher » multi-magasins est PREMIUM : un utilisateur
 *   gratuit reçoit le panier « un seul magasin » (meta.downgraded = true).
 * - Allergènes : un produit contenant un allergène déclaré du profil
 *   (ingrédient ∪ Open Food Facts) n'est JAMAIS proposé (offre, alternative MDD).
 * - meta.pricing : prix relevés / ESTIMÉS retenus (toujours signalés « Estimé »).
 */
import type {
  Allergen,
  BasketMode,
  BasketPlan,
  CatalogIndex,
  CatalogMeta,
  Entitlement,
  Ingredient,
  OrderChannel,
  Price,
  Product,
  Store,
} from '../_shared/core/index.ts';
import { buildCatalogIndex, canUse, compareList, optimizeBasket } from '../_shared/core/index.ts';
import { json, readJson, requireMethod, withHandler } from '../_shared/http.ts';
import type { Logger } from '../_shared/logger.ts';
import {
  optionalEnum,
  optionalInt,
  optionalStringArray,
  parseShoppingListItems,
  requireRecord,
} from '../_shared/validation.ts';
import type { ShoppingListItem } from '../_shared/core/index.ts';

export interface BasketRepository {
  loadEntitlement(): Promise<Entitlement>;
  loadPreferredStoreIds(): Promise<string[]>;
  /**
   * Allergènes déclarés du profil (vide sans consentement) : aucun produit qui
   * en contient un n'est proposé. Facultatif (doublures de test).
   */
  loadAllergens?(): Promise<Allergen[]>;
  loadStores(): Promise<Store[]>;
  loadOffers(ingredientIds: string[]): Promise<{ products: Product[]; prices: Price[] }>;
  loadIngredients(ids: string[]): Promise<Ingredient[]>;
  /** Description de l'instantané de données ouvertes (null : aucune). Facultatif. */
  loadCatalogMeta?(): Promise<CatalogMeta | null>;
  /** Instantané du panier (basket_plans) ; renvoie son id. */
  saveBasketPlan(plan: BasketPlan, listId?: string): Promise<string>;
}

export interface OptimizeBasketDeps {
  authenticate(req: Request): Promise<{ userId: string; repo: BasketRepository }>;
  logger: Logger;
  now?: () => Date;
}

export interface OptimizeRequest {
  items: ShoppingListItem[];
  mode: BasketMode;
  storeIds?: string[];
  channel: OrderChannel;
  maxStores?: number;
  save: boolean;
  listId?: string;
}

const MODES: readonly BasketMode[] = ['cheapest', 'single_store'];
const CHANNELS: readonly OrderChannel[] = ['drive', 'delivery'];

export function parseOptimizeRequest(body: unknown): OptimizeRequest {
  const b = requireRecord(body);
  return {
    items: parseShoppingListItems(b.items),
    mode: optionalEnum(b.mode, 'mode', MODES) ?? 'cheapest',
    storeIds: optionalStringArray(b.storeIds, 'storeIds', 20, 64),
    channel: optionalEnum(b.channel, 'channel', CHANNELS) ?? 'drive',
    maxStores: optionalInt(b.maxStores, 'maxStores', 1, 4),
    save: b.save === true,
    listId: typeof b.listId === 'string' && b.listId.length > 0 && b.listId.length <= 128 ? b.listId : undefined,
  };
}

/** Provenance des prix retenus : relevés en magasin vs estimés (toujours signalés « Estimé »). */
export interface PricingMeta {
  /** Lignes du panier dont le prix est relevé (Open Prices, partenaire…). */
  observedPrices: number;
  /** Lignes du panier dont le prix est ESTIMÉ. */
  estimatedPrices: number;
  /** Lignes au prix de démonstration (ancien catalogue). */
  demoPrices: number;
  /** Articles du panier au prix estimé. */
  estimatedItemIds: string[];
  /** Offres estimées dans la comparaison (tous magasins). */
  estimatedOffers: number;
  /** Date de l'instantané de données ouvertes, s'il est connu. */
  snapshotAt?: string;
}

/** Compte les prix estimés / relevés effectivement utilisés (même index que le comparateur). */
export function pricingMeta(
  plan: BasketPlan,
  comparisons: readonly { offers: readonly { storeId: string; productId: string }[] }[],
  index: CatalogIndex,
): PricingMeta {
  const sourceOf = (productId: string, storeId: string) => index.pricesByProduct.get(productId)?.get(storeId)?.source;
  const meta: PricingMeta = {
    observedPrices: 0,
    estimatedPrices: 0,
    demoPrices: 0,
    estimatedItemIds: [],
    estimatedOffers: 0,
  };
  const estimatedItems = new Set<string>();
  for (const part of plan.parts) {
    for (const line of part.lines) {
      const source = sourceOf(line.productId, part.storeId);
      if (source === 'estimate') {
        meta.estimatedPrices++;
        estimatedItems.add(line.itemId);
      } else if (source === 'demo') meta.demoPrices++;
      else if (source) meta.observedPrices++;
    }
  }
  for (const c of comparisons) {
    for (const o of c.offers) if (sourceOf(o.productId, o.storeId) === 'estimate') meta.estimatedOffers++;
  }
  meta.estimatedItemIds = Array.from(estimatedItems).sort();
  return meta;
}

export function createOptimizeBasketHandler(deps: OptimizeBasketDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date());
  return withHandler(deps.logger, async (req, log) => {
    requireMethod(req, 'POST');
    const { userId, repo } = await deps.authenticate(req);
    const request = parseOptimizeRequest(await readJson(req, 512 * 1024));

    const ingredientIds = Array.from(
      new Set(request.items.map((i) => i.ingredientId).filter((id): id is string => typeof id === 'string')),
    );
    const [entitlement, preferred, stores, rawOffers, ingredients, catalogMeta, allergens] = await Promise.all([
      repo.loadEntitlement(),
      request.storeIds ? Promise.resolve([] as string[]) : repo.loadPreferredStoreIds(),
      repo.loadStores(),
      repo.loadOffers(ingredientIds),
      repo.loadIngredients(ingredientIds),
      // Information facultative : son absence (ou son échec) ne bloque jamais le panier.
      repo.loadCatalogMeta ? repo.loadCatalogMeta().catch(() => null) : Promise.resolve(null),
      // Sécurité : une erreur de lecture du profil fait échouer la requête (jamais d'offre non filtrée).
      repo.loadAllergens ? repo.loadAllergens() : Promise.resolve([] as Allergen[]),
    ]);

    // Produits contenant un allergène déclaré : retirés AVANT la comparaison.
    const declared = new Set(allergens);
    const safeProducts = declared.size === 0
      ? rawOffers.products
      : rawOffers.products.filter((p) => !p.allergens.some((a) => declared.has(a)));
    const safeIds = new Set(safeProducts.map((p) => p.id));
    const offers = {
      products: safeProducts,
      prices: rawOffers.prices.filter((p) => safeIds.has(p.productId)),
    };

    // Premium : panier multi-magasins.
    const premium = canUse('optimized_basket', entitlement);
    const mode: BasketMode = request.mode === 'cheapest' && !premium ? 'single_store' : request.mode;
    const downgraded = mode !== request.mode;

    // Magasins du panier : choix explicite > préférés > tous. Ids inconnus ignorés.
    const known = new Set(stores.map((s) => s.id));
    const wanted = (request.storeIds ?? preferred).filter((id) => known.has(id));
    const allowedStoreIds = wanted.length > 0 ? wanted : undefined;

    const nowIso = now().toISOString();
    const index = buildCatalogIndex(offers.products, offers.prices, stores, ingredients);
    // Comparaison sur TOUS les magasins (≥ 3 enseignes), panier sur les magasins retenus.
    const comparisons = compareList(request.items, index, nowIso);
    const plan = optimizeBasket(comparisons, stores, mode, {
      channel: request.channel,
      allowedStoreIds,
      maxStores: request.maxStores,
      now: nowIso,
    });

    let savedId: string | undefined;
    if (request.save) {
      try {
        savedId = await repo.saveBasketPlan(plan, request.listId);
      } catch (err) {
        log.error('basket snapshot failed', { error: err instanceof Error ? err.message : String(err) });
      }
    }

    const comparedStores = new Set(comparisons.flatMap((c) => c.offers.map((o) => o.storeId)));
    const pricing = pricingMeta(plan, comparisons, index);
    if (catalogMeta?.snapshotAt) pricing.snapshotAt = catalogMeta.snapshotAt;
    log.info('basket optimized', { userId, items: request.items.length, mode, downgraded, total: plan.totalCents });
    return json({
      comparisons,
      plan,
      meta: {
        requestedMode: request.mode,
        mode,
        downgraded,
        ...(downgraded ? { reason: 'premium_required' } : {}),
        entitlement,
        channel: request.channel,
        allowedStoreIds: allowedStoreIds ?? stores.map((s) => s.id),
        storesCompared: comparedStores.size,
        itemsWithoutOffer: comparisons.filter((c) => c.offers.length === 0).map((c) => c.itemId),
        pricing,
        allergenExcludedProducts: rawOffers.products.length - safeProducts.length,
        ...(savedId ? { basketPlanId: savedId } : {}),
      },
    });
  });
}

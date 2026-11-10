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
 */
import type {
  BasketMode,
  BasketPlan,
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
  loadStores(): Promise<Store[]>;
  loadOffers(ingredientIds: string[]): Promise<{ products: Product[]; prices: Price[] }>;
  loadIngredients(ids: string[]): Promise<Ingredient[]>;
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

export function createOptimizeBasketHandler(deps: OptimizeBasketDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date());
  return withHandler(deps.logger, async (req, log) => {
    requireMethod(req, 'POST');
    const { userId, repo } = await deps.authenticate(req);
    const request = parseOptimizeRequest(await readJson(req, 512 * 1024));

    const ingredientIds = Array.from(
      new Set(request.items.map((i) => i.ingredientId).filter((id): id is string => typeof id === 'string')),
    );
    const [entitlement, preferred, stores, offers, ingredients] = await Promise.all([
      repo.loadEntitlement(),
      request.storeIds ? Promise.resolve([] as string[]) : repo.loadPreferredStoreIds(),
      repo.loadStores(),
      repo.loadOffers(ingredientIds),
      repo.loadIngredients(ingredientIds),
    ]);

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
        ...(savedId ? { basketPlanId: savedId } : {}),
      },
    });
  });
}

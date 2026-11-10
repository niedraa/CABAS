/**
 * collect-prices — collecte quotidienne des prix (Open Prices) + détection des
 * baisses de prix sur les produits surveillés.
 *
 * Appel : cron (pg_cron + pg_net) ou opérateur, avec l'en-tête `x-cron-secret`.
 * POST { limit?: 1-500 (défaut 50), productIds?: string[], dryRun?: boolean }
 *
 *  1. produits à rafraîchir (les plus anciennement vérifiés d'abord) ;
 *  2. pour chacun, SÉQUENTIELLEMENT (respect des limites de l'API, délai
 *     configurable, Retry-After honoré une fois sur HTTP 429) : relevés Open
 *     Prices → normalisation en centimes par magasin ;
 *  3. upsert des prix (source 'open_prices') — un relevé plus ancien que le
 *     prix courant ne l'écrase pas ; un prix 'demo' est toujours remplacé ;
 *     l'historique est alimenté par trigger ;
 *  4. baisses de prix (core › detectPriceDrops) sur les produits surveillés
 *     (Premium, préférence « baisses de prix » active) → file de notifications
 *     (dédupliquée), envoyée par send-notifications.
 */
import type { Price, Product } from '../_shared/core/index.ts';
import { detectPriceDrops, formatPrice } from '../_shared/core/index.ts';
import { verifySharedSecret } from '../_shared/auth.ts';
import { json, readJson, requireMethod, withHandler } from '../_shared/http.ts';
import type { Logger } from '../_shared/logger.ts';
import { optionalInt, optionalStringArray, requireRecord } from '../_shared/validation.ts';
import type { NotificationInsert } from '../_shared/notifications.ts';

export type { NotificationInsert };
import {
  type CollectStore,
  fetchOpenPrices,
  latestObservationsByStore,
  type OpenPriceItem,
  OpenPricesHttpError,
} from './openPrices.ts';

export interface PriceWatchRow {
  userId: string;
  productId: string;
  storeId: string;
  referenceCents: number;
}

export interface PriceCollectionRepository {
  listProductsToCheck(limit: number, productIds?: string[]): Promise<Product[]>;
  loadStores(): Promise<CollectStore[]>;
  loadCurrentPrices(productIds: string[]): Promise<Price[]>;
  upsertPrices(prices: Price[]): Promise<void>;
  markChecked(productIds: string[], at: string): Promise<void>;
  /** Surveillances actives : utilisateurs Premium avec la préférence « baisses de prix ». */
  loadPriceWatches(productIds: string[]): Promise<PriceWatchRow[]>;
  /** Insère en ignorant les doublons (dedupe_key) ; renvoie le nombre inséré. */
  enqueueNotifications(rows: NotificationInsert[]): Promise<number>;
}

export interface CollectPricesDeps {
  repo: PriceCollectionRepository;
  cronSecret: string;
  fetch: typeof fetch;
  logger: Logger;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  /** Pause entre deux appels Open Prices (défaut 1000 ms). */
  delayMs?: number;
  /** Budget de temps total (défaut 120 s, sous la limite des Edge Functions). */
  timeBudgetMs?: number;
  /** Âge max d'un relevé pris en compte (défaut 60 jours). */
  maxAgeDays?: number;
  /** Seuil de baisse notifiée, % (défaut 5). */
  dropThresholdPct?: number;
}

export interface CollectStats {
  productsRequested: number;
  productsProcessed: number;
  observations: number;
  rejectedObservations: number;
  unmatchedObservations: number;
  pricesUpserted: number;
  pricesSkippedOlder: number;
  errors: number;
  rateLimited: boolean;
  stoppedEarly: boolean;
  priceDrops: number;
  notificationsQueued: number;
  dryRun: boolean;
  durationMs: number;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Faut-il remplacer le prix courant par ce relevé ? */
export function shouldReplace(current: Price | undefined, observedAt: string): boolean {
  if (!current) return true;
  if (current.source === 'demo') return true;
  return Date.parse(observedAt) > Date.parse(current.updatedAt);
}

export function createCollectPricesHandler(deps: CollectPricesDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? realSleep;
  const delayMs = deps.delayMs ?? 1000;
  const budget = deps.timeBudgetMs ?? 120_000;
  const maxAgeDays = deps.maxAgeDays ?? 60;

  return withHandler(deps.logger, async (req, log) => {
    requireMethod(req, 'POST');
    verifySharedSecret(req, 'x-cron-secret', deps.cronSecret);
    const body = requireRecord(await readJson(req));
    const limit = optionalInt(body.limit, 'limit', 1, 500) ?? 50;
    const productIds = optionalStringArray(body.productIds, 'productIds', 500);
    const dryRun = body.dryRun === true;

    const started = Date.now();
    const nowDate = now();
    const since = new Date(nowDate.getTime() - maxAgeDays * 86_400_000).toISOString().slice(0, 10);
    const [products, stores] = await Promise.all([deps.repo.listProductsToCheck(limit, productIds), deps.repo.loadStores()]);
    const current = new Map<string, Price>();
    for (const p of await deps.repo.loadCurrentPrices(products.map((p) => p.id))) {
      current.set(`${p.productId}|${p.storeId}`, p);
    }

    const stats: CollectStats = {
      productsRequested: products.length,
      productsProcessed: 0,
      observations: 0,
      rejectedObservations: 0,
      unmatchedObservations: 0,
      pricesUpserted: 0,
      pricesSkippedOlder: 0,
      errors: 0,
      rateLimited: false,
      stoppedEarly: false,
      priceDrops: 0,
      notificationsQueued: 0,
      dryRun,
      durationMs: 0,
    };
    const toUpsert: Price[] = [];
    const checked: string[] = [];

    const fetchItems = (ean: string) => fetchOpenPrices(ean, { fetch: deps.fetch, since, size: 50 });

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      if (Date.now() - started > budget) {
        stats.stoppedEarly = true;
        break;
      }
      if (i > 0 && delayMs > 0) await sleep(delayMs);
      let items: OpenPriceItem[];
      try {
        try {
          items = await fetchItems(product.ean);
        } catch (err) {
          // 429 : on attend Retry-After (borné à 30 s) puis on réessaie UNE fois.
          if (err instanceof OpenPricesHttpError && err.status === 429) {
            await sleep(Math.min(err.retryAfterMs ?? 5000, 30_000));
            items = await fetchItems(product.ean);
          } else {
            throw err;
          }
        }
      } catch (err) {
        if (err instanceof OpenPricesHttpError && err.status === 429) {
          stats.rateLimited = true;
          log.warn('open prices rate limited — stopping batch', { processed: stats.productsProcessed });
          break;
        }
        stats.errors++;
        log.warn('open prices fetch failed', { productId: product.id, error: err instanceof Error ? err.message : String(err) });
        continue;
      }

      const { observations, rejected, unmatched } = latestObservationsByStore(items, product, stores, nowDate, maxAgeDays);
      stats.observations += items.length;
      stats.rejectedObservations += rejected;
      stats.unmatchedObservations += unmatched;
      for (const obs of observations) {
        const key = `${product.id}|${obs.storeId}`;
        if (!shouldReplace(current.get(key), obs.observedAt)) {
          stats.pricesSkippedOlder++;
          continue;
        }
        const price: Price = {
          productId: product.id,
          storeId: obs.storeId,
          priceCents: obs.priceCents,
          updatedAt: obs.observedAt,
          source: 'open_prices',
        };
        if (obs.promoPriceCents !== undefined) {
          price.promoPriceCents = obs.promoPriceCents;
          price.promoLabel = 'Promo';
        }
        toUpsert.push(price);
      }
      checked.push(product.id);
      stats.productsProcessed++;
    }

    if (!dryRun) {
      if (toUpsert.length > 0) await deps.repo.upsertPrices(toUpsert);
      if (checked.length > 0) await deps.repo.markChecked(checked, nowDate.toISOString());
    }
    stats.pricesUpserted = toUpsert.length;

    // Baisses de prix sur les produits surveillés.
    const changedProducts = Array.from(new Set(toUpsert.map((p) => p.productId)));
    if (changedProducts.length > 0) {
      const watches = await deps.repo.loadPriceWatches(changedProducts);
      const byUser = new Map<string, PriceWatchRow[]>();
      for (const w of watches) byUser.set(w.userId, [...(byUser.get(w.userId) ?? []), w]);
      const productsById = new Map(products.map((p) => [p.id, p]));
      const storesById = new Map(stores.map((s) => [s.id, s]));
      const notifications: NotificationInsert[] = [];
      for (const [userId, list] of byUser) {
        const drops = detectPriceDrops(list, toUpsert, { thresholdPct: deps.dropThresholdPct ?? 5, now: nowDate.toISOString() });
        for (const d of drops) {
          const productName = productsById.get(d.productId)?.name ?? 'Un produit habituel';
          const storeName = storesById.get(d.storeId)?.name ?? d.storeId;
          notifications.push({
            userId,
            kind: 'price_drop',
            title: 'Baisse de prix 📉',
            body: `${productName} : ${formatPrice(d.newCents)} au lieu de ${formatPrice(d.oldCents)} chez ${storeName} (−${
              String(Math.round(d.dropPct)).replace('.', ',')
            } %)`,
            data: { type: 'price_drop', productId: d.productId, storeId: d.storeId, oldCents: d.oldCents, newCents: d.newCents },
            dedupeKey: `price_drop:${userId}:${d.productId}:${d.storeId}:${d.newCents}`,
          });
        }
      }
      stats.priceDrops = notifications.length;
      if (!dryRun && notifications.length > 0) stats.notificationsQueued = await deps.repo.enqueueNotifications(notifications);
    }

    stats.durationMs = Date.now() - started;
    log.info('collect-prices done', { ...stats });
    return json({ stats });
  });
}

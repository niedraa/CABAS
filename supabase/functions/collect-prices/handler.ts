/**
 * collect-prices — collecte INCRÉMENTALE des prix relevés (Open Prices, ODbL)
 * + détection des baisses de prix sur les produits surveillés.
 *
 * Appel : cron (pg_cron + pg_net) ou opérateur, avec l'en-tête `x-cron-secret`.
 * POST { dryRun?: boolean, since?: ISO 8601, maxPages?: 1-500, refreshLocations?: boolean }
 * (`limit` de l'ancienne version est accepté et ignoré.)
 *
 *  1. points de vente FR métropole des 10 enseignes : table
 *     `open_prices_locations`, rafraîchie chaque semaine depuis l'export
 *     `locations.jsonl.gz` (une requête) ;
 *  2. relevés créés depuis le dernier passage, par lots de ≤ 600 lieux, avec
 *     UN CURSEUR PAR LOT (`created__gte` ; à défaut le curseur global, puis le
 *     dernier relevé de l'instantané) — le lot le plus en retard d'abord, page
 *     par page, SÉQUENTIELLEMENT (≤ 1 requête / 2 s, Retry-After honoré une
 *     fois sur HTTP 429, budget de temps) : un lot qui ne peut pas tout lire en
 *     un passage reprend où il s'est arrêté, sans bloquer les autres ;
 *  3. filtres obligatoires (core › normalizeObservation) puis rattachement aux
 *     codes-barres et catégories vrac du catalogue → `price_observations` ;
 *  4. pour chaque (produit, enseigne) touché : médiane des relevés de 365 jours
 *     et du socle de l'instantané → prix 'open_prices' de l'enseigne (un relevé
 *     réel remplace TOUJOURS une estimation ; promo valable 7 jours au plus) ;
 *  5. baisses de prix (core › detectPriceDrops) sur les produits surveillés
 *     (Premium, préférence active) → file de notifications dédupliquée —
 *     JAMAIS sur un produit contenant un allergène déclaré du profil.
 */
import type { Allergen, Price, Product, Store } from '../_shared/core/index.ts';
import { detectPriceDrops, formatPrice } from '../_shared/core/index.ts';
import { verifySharedSecret } from '../_shared/auth.ts';
import { json, readJson, requireMethod, withHandler } from '../_shared/http.ts';
import type { Logger } from '../_shared/logger.ts';
import { badRequest, optionalInt, requireRecord } from '../_shared/validation.ts';
import type { NotificationInsert } from '../_shared/notifications.ts';
import {
  buildProductMatcher,
  chainPriceFromObservations,
  type CollectLocation,
  fetchLocationsDump,
  fetchPricesPage,
  locationBatches,
  matchItem,
  OpenPricesHttpError,
  type PricesPage,
  priceWindow,
  samePrice,
  shouldReplace,
  type StoredObservation,
  storesOfChain,
} from './openPrices.ts';

export type { NotificationInsert };
export { shouldReplace };

export interface PriceWatchRow {
  userId: string;
  productId: string;
  storeId: string;
  referenceCents: number;
  /** Allergènes déclarés du profil ; `null` si le profil est illisible (aucune alerte). */
  allergens: readonly Allergen[] | null;
}

export interface CollectState {
  /** Curseur le plus en retard (ISO) ; null au premier passage. Repli des lots sans curseur. */
  createdCursor: string | null;
  /** Prochain `created__gte` (ISO) de chaque lot de lieux (clé : `batchKey`). */
  batchCursors: Record<string, string>;
  locationsRefreshedAt: string | null;
}

/** Clé stable d'un lot de lieux (ids triés) : « premier id-dernier id ». */
export function batchKey(ids: readonly number[]): string {
  return `${ids[0]}-${ids[ids.length - 1]}`;
}

export interface PriceCollectionRepository {
  loadState(): Promise<CollectState>;
  saveState(state: CollectState & { lastRunAt: string; lastStats: CollectStats }): Promise<void>;
  /** `catalog_meta.meta.snapshotAt` (curseur initial), null sans instantané. */
  loadSnapshotAt(): Promise<string | null>;
  loadLocations(): Promise<CollectLocation[]>;
  /** Remplace la table des lieux (upsert + suppression des lieux disparus). */
  replaceLocations(locations: CollectLocation[], at: string): Promise<void>;
  /** Produits du catalogue (codes-barres, catégories vrac, enseignes des MDD). */
  loadProducts(): Promise<Product[]>;
  /** Magasins actifs. */
  loadStores(): Promise<Store[]>;
  /** Insère en ignorant les relevés déjà stockés ; renvoie le nombre inséré. */
  insertObservations(rows: StoredObservation[]): Promise<number>;
  /** Relevés et socles des produits, relevés à partir de `fromDay`. */
  loadObservations(productIds: string[], fromDay: string): Promise<StoredObservation[]>;
  loadCurrentPrices(productIds: string[]): Promise<Price[]>;
  upsertPrices(prices: Price[]): Promise<void>;
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
  /** Pause entre deux appels Open Prices (défaut 2000 ms : ≤ 1 requête / 2 s). */
  delayMs?: number;
  /** Budget de temps total (défaut 120 s, sous la limite des Edge Functions). */
  timeBudgetMs?: number;
  /** Rafraîchissement des points de vente (défaut 7 jours). */
  locationsMaxAgeMs?: number;
  /** Requêtes de relevés max par passage (défaut 200). */
  maxPages?: number;
  /** Seuil de baisse notifiée, % (défaut 5). */
  dropThresholdPct?: number;
}

export interface CollectStats {
  locations: number;
  locationsRefreshed: boolean;
  requests: number;
  items: number;
  rejectedObservations: number;
  unmatchedObservations: number;
  matchedObservations: number;
  observationsInserted: number;
  pairsRecomputed: number;
  pricesUpserted: number;
  pricesUnchanged: number;
  pricesSkippedOlder: number;
  estimatesReplaced: number;
  errors: number;
  rateLimited: boolean;
  stoppedEarly: boolean;
  cursorFrom: string;
  cursorTo: string;
  priceDrops: number;
  notificationsQueued: number;
  dryRun: boolean;
  durationMs: number;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const DAY_MS = 86_400_000;
/** Marge du curseur : relevés en cours d'enregistrement côté Open Prices (doublons ignorés). */
const CURSOR_MARGIN_MS = 10 * 60 * 1000;

function parseSince(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) {
    throw badRequest('since doit être une date ISO 8601 (ex. 2026-11-01T00:00:00Z).');
  }
  return new Date(Date.parse(v)).toISOString();
}

export function createCollectPricesHandler(deps: CollectPricesDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? realSleep;
  const delayMs = deps.delayMs ?? 2000;
  const budget = deps.timeBudgetMs ?? 120_000;
  const locationsMaxAgeMs = deps.locationsMaxAgeMs ?? 7 * DAY_MS;

  return withHandler(deps.logger, async (req, log) => {
    requireMethod(req, 'POST');
    verifySharedSecret(req, 'x-cron-secret', deps.cronSecret);
    const body = requireRecord(await readJson(req));
    optionalInt(body.limit, 'limit', 1, 500); // ancienne version : accepté, ignoré
    const maxPages = optionalInt(body.maxPages, 'maxPages', 1, 500) ?? deps.maxPages ?? 200;
    const since = parseSince(body.since);
    const dryRun = body.dryRun === true;
    const forceLocations = body.refreshLocations === true;

    const started = Date.now();
    const nowDate = now();
    const window = priceWindow(nowDate);
    let requests = 0;
    const throttle = async () => {
      if (requests > 0 && delayMs > 0) await sleep(delayMs);
      requests++;
    };

    const [state, snapshotAt, storedLocations] = await Promise.all([
      deps.repo.loadState(),
      deps.repo.loadSnapshotAt(),
      deps.repo.loadLocations(),
    ]);
    // Curseur de repli (lot sans curseur propre) : global, sinon l'instantané, sinon J−7.
    const defaultCursor = since ?? state.createdCursor ??
      (snapshotAt && Number.isFinite(Date.parse(snapshotAt))
        ? new Date(Date.parse(snapshotAt)).toISOString()
        : new Date(nowDate.getTime() - 7 * DAY_MS).toISOString());
    const batchCursorsIn = state.batchCursors ?? {};

    const stats: CollectStats = {
      locations: storedLocations.length,
      locationsRefreshed: false,
      requests: 0,
      items: 0,
      rejectedObservations: 0,
      unmatchedObservations: 0,
      matchedObservations: 0,
      observationsInserted: 0,
      pairsRecomputed: 0,
      pricesUpserted: 0,
      pricesUnchanged: 0,
      pricesSkippedOlder: 0,
      estimatesReplaced: 0,
      errors: 0,
      rateLimited: false,
      stoppedEarly: false,
      cursorFrom: defaultCursor,
      cursorTo: defaultCursor,
      priceDrops: 0,
      notificationsQueued: 0,
      dryRun,
      durationMs: 0,
    };

    // 1. Points de vente (rafraîchis chaque semaine).
    let locations = storedLocations;
    let locationsRefreshedAt = state.locationsRefreshedAt;
    const refreshedTs = locationsRefreshedAt ? Date.parse(locationsRefreshedAt) : NaN;
    const stale = !Number.isFinite(refreshedTs) || nowDate.getTime() - refreshedTs > locationsMaxAgeMs;
    if (forceLocations || stale || locations.length === 0) {
      try {
        await throttle();
        const fresh = await fetchLocationsDump({ fetch: deps.fetch });
        if (fresh.length > 0) {
          locations = fresh;
          locationsRefreshedAt = nowDate.toISOString();
          stats.locationsRefreshed = true;
          if (!dryRun) await deps.repo.replaceLocations(fresh, locationsRefreshedAt);
        } else {
          log.warn('open prices locations dump empty — keeping stored locations');
        }
      } catch (err) {
        stats.errors++;
        log.warn('open prices locations refresh failed', { error: err instanceof Error ? err.message : String(err) });
      }
    }
    stats.locations = locations.length;
    const locationsById = new Map(locations.map((l) => [l.id, l]));

    // 2-3. Relevés depuis le curseur, rattachés au catalogue.
    const [products, stores] = await Promise.all([deps.repo.loadProducts(), deps.repo.loadStores()]);
    const matcher = buildProductMatcher(products);
    const candidates: StoredObservation[] = [];
    const runStart = new Date(nowDate.getTime() - CURSOR_MARGIN_MS).toISOString();

    let pageRequests = 0;
    const fetchPage = async (ids: number[], createdGte: string, page: number): Promise<PricesPage> => {
      await throttle();
      pageRequests++;
      try {
        return await fetchPricesPage({ locationIds: ids, createdGte, page }, { fetch: deps.fetch });
      } catch (err) {
        // 429 : on attend Retry-After (borné à 30 s) puis on réessaie UNE fois.
        if (err instanceof OpenPricesHttpError && err.status === 429) {
          await sleep(Math.min(err.retryAfterMs ?? 5000, 30_000));
          requests++;
          return await fetchPricesPage({ locationIds: ids, createdGte, page }, { fetch: deps.fetch });
        }
        throw err;
      }
    };

    // Un curseur par lot ; le plus en retard passe d'abord (aucun lot ne bloque les autres).
    const batches = locationBatches(locations).map((ids) => {
      const key = batchKey(ids);
      const own = since ? undefined : batchCursorsIn[key];
      return { ids, key, from: own && Number.isFinite(Date.parse(own)) ? own : defaultCursor };
    }).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0) || a.ids[0] - b.ids[0]);
    /** Curseur atteint par lot : `runStart` si épuisé, dernier `created` lu si interrompu, inchangé sinon. */
    const batchCursorsOut: Record<string, string> = {};
    for (const b of batches) batchCursorsOut[b.key] = b.from;
    if (batches.length > 0) stats.cursorFrom = batches[0].from;
    let halted = false;
    for (const { ids, key, from: cursorFrom } of batches) {
      let lastCreated = cursorFrom;
      let done = false;
      for (let page = 1; !halted; page++) {
        if (Date.now() - started > budget || pageRequests >= maxPages) {
          stats.stoppedEarly = true;
          halted = true;
          break;
        }
        let res: PricesPage;
        try {
          res = await fetchPage(ids, cursorFrom, page);
        } catch (err) {
          if (err instanceof OpenPricesHttpError && err.status === 429) {
            // Limite de débit : on arrête tout, proprement (curseur conservé).
            stats.rateLimited = true;
            halted = true;
            log.warn('open prices rate limited — stopping run', { requests });
          } else {
            // Autre erreur : ce lot reprendra au prochain passage, les autres continuent.
            stats.errors++;
            log.warn('open prices fetch failed — batch skipped', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
          break;
        }
        for (const item of res.items) {
          stats.items++;
          const m = matchItem(item, window, matcher, locationsById.get(Number(item.location_id)));
          if (m.status === 'rejected') stats.rejectedObservations++;
          else if (m.status === 'unmatched') stats.unmatchedObservations++;
          else {
            stats.matchedObservations++;
            candidates.push(...m.rows);
          }
          if (typeof item.created === 'string' && Number.isFinite(Date.parse(item.created))) {
            const created = new Date(Date.parse(item.created)).toISOString();
            if (created > lastCreated) lastCreated = created;
          }
        }
        if (res.items.length === 0 || page >= res.pages) {
          done = true;
          break;
        }
      }
      // Jamais en arrière : un lot épuisé avance au début du passage (− marge), un lot
      // interrompu reprendra à son dernier relevé lu (doublons ignorés à l'insertion).
      const next = done ? runStart : lastCreated;
      if (next > cursorFrom) batchCursorsOut[key] = next;
      if (halted) break;
    }
    // Lots non atteints (ou en erreur) : leur curseur ne bouge pas. Global = le plus en retard.
    const values = Object.values(batchCursorsOut);
    stats.cursorTo = values.length > 0 ? values.reduce((a, b) => (a < b ? a : b)) : defaultCursor;
    stats.requests = requests;

    if (candidates.length > 0) {
      stats.observationsInserted = dryRun ? candidates.length : await deps.repo.insertObservations(candidates);
    }

    // 4. Prix d'enseigne des (produit, enseigne) touchés.
    const toUpsert: Price[] = [];
    const pairs = new Map<string, { productId: string; chain: StoredObservation['chain'] }>();
    for (const c of candidates) pairs.set(`${c.productId}|${c.chain}`, { productId: c.productId, chain: c.chain });
    if (pairs.size > 0) {
      const productIds = Array.from(new Set(Array.from(pairs.values()).map((p) => p.productId)));
      const [stored, currentPrices] = await Promise.all([
        deps.repo.loadObservations(productIds, window.from),
        deps.repo.loadCurrentPrices(productIds),
      ]);
      // dryRun : les relevés candidats ne sont pas en base ; on les ajoute (sans doublon).
      const all = [...stored];
      if (dryRun) {
        const seen = new Set(
          stored.filter((s) => s.kind === 'observation').map((s) => `${s.openPricesId}|${s.productId}`),
        );
        for (const c of candidates) if (!seen.has(`${c.openPricesId}|${c.productId}`)) all.push(c);
      }
      const byPair = new Map<string, StoredObservation[]>();
      for (const o of all) {
        const k = `${o.productId}|${o.chain}`;
        if (!pairs.has(k)) continue;
        const list = byPair.get(k);
        if (list) list.push(o);
        else byPair.set(k, [o]);
      }
      const current = new Map(currentPrices.map((p) => [`${p.productId}|${p.storeId}`, p]));
      const productsById = new Map(products.map((p) => [p.id, p]));
      for (const [k, { productId, chain }] of pairs) {
        const product = productsById.get(productId);
        if (!product) continue;
        stats.pairsRecomputed++;
        for (const store of storesOfChain(stores, chain)) {
          const next = chainPriceFromObservations(product, store.id, byPair.get(k) ?? [], window);
          if (!next) continue;
          const cur = current.get(`${productId}|${store.id}`);
          if (cur && samePrice(cur, next)) {
            stats.pricesUnchanged++;
            continue;
          }
          if (!shouldReplace(cur, next)) {
            stats.pricesSkippedOlder++;
            continue;
          }
          if (cur?.source === 'estimate') stats.estimatesReplaced++;
          toUpsert.push(next);
        }
      }
    }
    if (!dryRun && toUpsert.length > 0) await deps.repo.upsertPrices(toUpsert);
    stats.pricesUpserted = toUpsert.length;

    // 5. Baisses de prix sur les produits surveillés.
    const changedProducts = Array.from(new Set(toUpsert.map((p) => p.productId)));
    if (changedProducts.length > 0) {
      const watches = await deps.repo.loadPriceWatches(changedProducts);
      const byUser = new Map<string, PriceWatchRow[]>();
      for (const w of watches) byUser.set(w.userId, [...(byUser.get(w.userId) ?? []), w]);
      const productsById = new Map(products.map((p) => [p.id, p]));
      const storesById = new Map(stores.map((s) => [s.id, s]));
      const notifications: NotificationInsert[] = [];
      for (const [userId, list] of byUser) {
        // Allergènes du profil : jamais d'alerte sur un produit qui en contient un.
        // Profil illisible : on ne peut pas vérifier → aucune alerte (fail closed).
        const allergens = list[0]?.allergens ?? null;
        if (allergens === null || list.some((w) => w.allergens === null)) continue;
        const drops = detectPriceDrops(list, toUpsert, {
          thresholdPct: deps.dropThresholdPct ?? 5,
          now: nowDate.toISOString(),
          products: productsById,
          excludeAllergens: allergens,
        });
        for (const d of drops) {
          const productName = productsById.get(d.productId)?.name ?? 'Un produit habituel';
          const storeName = storesById.get(d.storeId)?.name ?? d.storeId;
          notifications.push({
            userId,
            kind: 'price_drop',
            title: 'Baisse de prix 📉',
            body: `${productName} : ${formatPrice(d.newCents)} au lieu de ${
              formatPrice(d.oldCents)
            } chez ${storeName} (−${String(Math.round(d.dropPct)).replace('.', ',')} %)`,
            data: {
              type: 'price_drop',
              productId: d.productId,
              storeId: d.storeId,
              oldCents: d.oldCents,
              newCents: d.newCents,
            },
            dedupeKey: `price_drop:${userId}:${d.productId}:${d.storeId}:${d.newCents}`,
          });
        }
      }
      stats.priceDrops = notifications.length;
      if (!dryRun && notifications.length > 0) {
        stats.notificationsQueued = await deps.repo.enqueueNotifications(notifications);
      }
    }

    stats.durationMs = Date.now() - started;
    if (!dryRun) {
      await deps.repo.saveState({
        createdCursor: stats.cursorTo,
        batchCursors: batchCursorsOut,
        locationsRefreshedAt,
        lastRunAt: nowDate.toISOString(),
        lastStats: stats,
      });
    }
    log.info('collect-prices done', { ...stats });
    return json({ stats });
  });
}

import { assert, assertEquals, assertFalse, assertStringIncludes } from '@std/assert';
import type { Price, Product } from '../_shared/core/index.ts';
import { silentLogger } from '../_shared/logger.ts';
import { PRODUCTS, STORES } from '../_shared/testing/fixtures.ts';
import {
  createCollectPricesHandler,
  type NotificationInsert,
  type PriceCollectionRepository,
  type PriceWatchRow,
  shouldReplace,
} from './handler.ts';
import {
  type CollectStore,
  detectChain,
  latestObservationsByStore,
  normalizeObservation,
  type OpenPriceItem,
  OPEN_PRICES_URL,
} from './openPrices.ts';

const NOW = new Date('2026-11-10T09:00:00.000Z');
const SECRET = 'cron-secret-test';
const COLLECT_STORES: CollectStore[] = STORES.map((s) => ({ ...s, osmLocationIds: s.id === 'carrefour' ? [987654] : [] }));
const RIZ = PRODUCTS.find((p) => p.id === 'prd_riz')!; // 1 kg
const RIZ_MDD = PRODUCTS.find((p) => p.id === 'prd_riz_mdd_lidl')!;

/** Relevé Open Prices au format de l'API v1. */
function item(over: Partial<OpenPriceItem> & { brand?: string; name?: string } = {}): OpenPriceItem {
  const { brand, name, ...rest } = over;
  return {
    id: 1,
    product_code: RIZ.ean,
    price: 1.79,
    currency: 'EUR',
    price_per: null,
    price_is_discounted: false,
    price_without_discount: null,
    date: '2026-11-05',
    location_osm_id: 111,
    location: { osm_id: 111, osm_brand: brand ?? 'E.Leclerc', osm_name: name ?? 'E.Leclerc Lyon', osm_address_city: 'Lyon' },
    ...rest,
  };
}

// ─── Normalisation (pure) ────────────────────────────────────────────────────

Deno.test('detectChain : marques et noms OSM (accents, casse, variantes)', () => {
  assertEquals(detectChain({ osm_brand: 'E.Leclerc' }), 'leclerc');
  assertEquals(detectChain({ osm_name: 'Carrefour Market Croix-Rousse' }), 'carrefour');
  assertEquals(detectChain({ osm_brand: 'Intermarché Super' }), 'intermarche');
  assertEquals(detectChain({ osm_brand: 'LIDL' }), 'lidl');
  assertEquals(detectChain({ osm_name: 'Monop\' Bellecour' }), 'monoprix');
  assertEquals(detectChain({ osm_brand: 'Auchan Supermarché' }), 'auchan');
  assertEquals(detectChain({ osm_brand: 'Biocoop' }), null);
  // La marque l'emporte sur le nom.
  assertEquals(detectChain({ osm_brand: 'Carrefour City', osm_name: 'Ancien Leclerc' }), 'carrefour');
  assertEquals(detectChain(null), null);
});

Deno.test('normalizeObservation : prix unitaire, au kilo, promo, rejets', () => {
  assertEquals(normalizeObservation(item(), RIZ, NOW), { priceCents: 179, observedAt: '2026-11-05T12:00:00.000Z' });
  // Prix au kilo, conditionnement de 500 g → moitié.
  const half: Product = { ...RIZ, packSize: 500 };
  assertEquals((normalizeObservation(item({ price: 3.2, price_per: 'KILOGRAM' }), half, NOW) as { priceCents: number }).priceCents, 160);
  // Prix au litre sur un produit en grammes → incohérent.
  assertEquals(normalizeObservation(item({ price_per: 'LITER' }), RIZ, NOW), { rejected: 'unit_mismatch' });
  // Promo : prix barré = prix normal, prix payé = promo.
  assertEquals(normalizeObservation(item({ price: 1.5, price_is_discounted: true, price_without_discount: 1.99 }), RIZ, NOW), {
    priceCents: 199,
    promoPriceCents: 150,
    observedAt: '2026-11-05T12:00:00.000Z',
  });
  // Prix en chaîne accepté.
  assertEquals((normalizeObservation(item({ price: '2.05' }), RIZ, NOW) as { priceCents: number }).priceCents, 205);
  assertEquals(normalizeObservation(item({ currency: 'CHF' }), RIZ, NOW), { rejected: 'currency' });
  assertEquals(normalizeObservation(item({ price: 0 }), RIZ, NOW), { rejected: 'invalid_price' });
  assertEquals(normalizeObservation(item({ price: 'abc' }), RIZ, NOW), { rejected: 'invalid_price' });
  assertEquals(normalizeObservation(item({ date: null }), RIZ, NOW), { rejected: 'no_date' });
  assertEquals(normalizeObservation(item({ date: '2026-06-01' }), RIZ, NOW), { rejected: 'too_old' });
  assertEquals(normalizeObservation(item({ price: 999 }), RIZ, NOW), { rejected: 'implausible' });
});

Deno.test('latestObservationsByStore : OSM exact > enseigne, dernier relevé, MDD limitée à son enseigne', () => {
  const items = [
    item({ id: 1, price: 1.89, date: '2026-11-01' }),
    item({ id: 2, price: 1.79, date: '2026-11-06' }), // plus récent chez Leclerc
    item({ id: 3, price: 2.19, location_osm_id: 987654, brand: 'Carrefour', name: 'Carrefour Part-Dieu' }), // OSM exact
    item({ id: 4, price: 2.49, location_osm_id: 222, brand: 'Carrefour City', name: 'Carrefour City Lyon' }), // carrefour a un OSM explicite → non rattaché
    item({ id: 5, price: 1.0, brand: 'Biocoop', name: 'Biocoop' }), // enseigne inconnue
    item({ id: 6, product_code: '0000000000000' }), // autre produit
  ];
  const { observations, rejected, unmatched } = latestObservationsByStore(items, RIZ, COLLECT_STORES, NOW);
  const byStore = Object.fromEntries(observations.map((o) => [o.storeId, o.priceCents]));
  assertEquals(byStore, { leclerc: 179, carrefour: 219 });
  assertEquals(unmatched, 2);
  assertEquals(rejected, 1);

  const mdd = latestObservationsByStore([item({ product_code: RIZ_MDD.ean, brand: 'Auchan' })], RIZ_MDD, COLLECT_STORES, NOW);
  assertEquals(mdd.observations.length, 0, 'une MDD Lidl ne peut pas avoir de prix chez Auchan');
});

Deno.test('shouldReplace : prix démo toujours remplacé, sinon seulement par plus récent', () => {
  const base: Price = { productId: 'p', storeId: 's', priceCents: 100, updatedAt: '2026-11-09T06:00:00.000Z', source: 'demo' };
  assert(shouldReplace(undefined, '2026-01-01T00:00:00Z'));
  assert(shouldReplace(base, '2026-11-01T12:00:00.000Z'));
  const real = { ...base, source: 'partner' as const };
  assertFalse(shouldReplace(real, '2026-11-01T12:00:00.000Z'));
  assert(shouldReplace(real, '2026-11-10T12:00:00.000Z'));
});

// ─── Handler ─────────────────────────────────────────────────────────────────

interface Fake extends PriceCollectionRepository {
  upserted: Price[];
  checked: string[];
  queued: NotificationInsert[];
}

function fakeRepo(opts: { products?: Product[]; current?: Price[]; watches?: PriceWatchRow[] } = {}): Fake {
  const upserted: Price[] = [];
  const checked: string[] = [];
  const queued: NotificationInsert[] = [];
  const dedupe = new Set<string>();
  return {
    upserted,
    checked,
    queued,
    listProductsToCheck: (limit, ids) =>
      Promise.resolve((opts.products ?? [RIZ, RIZ_MDD]).filter((p) => !ids || ids.includes(p.id)).slice(0, limit)),
    loadStores: () => Promise.resolve(COLLECT_STORES),
    loadCurrentPrices: () => Promise.resolve(opts.current ?? []),
    upsertPrices: (p) => {
      upserted.push(...p);
      return Promise.resolve();
    },
    markChecked: (ids) => {
      checked.push(...ids);
      return Promise.resolve();
    },
    loadPriceWatches: (ids) => Promise.resolve((opts.watches ?? []).filter((w) => ids.includes(w.productId))),
    enqueueNotifications: (rows) => {
      let n = 0;
      for (const r of rows) {
        if (dedupe.has(r.dedupeKey)) continue;
        dedupe.add(r.dedupeKey);
        queued.push(r);
        n++;
      }
      return Promise.resolve(n);
    },
  };
}

type Route = (url: URL) => Response | Promise<Response>;
function fakeFetch(route: Route) {
  const calls: URL[] = [];
  const f = ((input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    calls.push(url);
    return Promise.resolve(route(url));
  }) as typeof fetch;
  return { fetch: f, calls };
}

const jsonRes = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

function makeHandler(repo: PriceCollectionRepository, f: typeof fetch, extra: { sleeps?: number[] } = {}) {
  return createCollectPricesHandler({
    repo,
    cronSecret: SECRET,
    fetch: f,
    logger: silentLogger,
    now: () => NOW,
    delayMs: 250,
    sleep: (ms) => {
      extra.sleeps?.push(ms);
      return Promise.resolve();
    },
  });
}

function cronReq(body: unknown = {}, secret: string | null = SECRET) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secret !== null) headers['x-cron-secret'] = secret;
  return new Request('http://localhost/collect-prices', { method: 'POST', headers, body: JSON.stringify(body) });
}

Deno.test('secret cron absent ou faux → 401 ; non configuré → 500', async () => {
  const { fetch } = fakeFetch(() => jsonRes({ items: [] }));
  for (const secret of [null, 'mauvais', `${SECRET}x`]) {
    const res = await makeHandler(fakeRepo(), fetch)(cronReq({}, secret));
    assertEquals(res.status, 401);
    await res.body?.cancel();
  }
  const misconfigured = createCollectPricesHandler({ repo: fakeRepo(), cronSecret: '', fetch, logger: silentLogger });
  const res = await misconfigured(cronReq({}, ''));
  assertEquals(res.status, 500);
  await res.body?.cancel();
});

Deno.test('collecte : parse Open Prices, upsert source open_prices, requêtes séquentielles avec délai', async () => {
  const repo = fakeRepo();
  const sleeps: number[] = [];
  const { fetch, calls } = fakeFetch((url) => {
    const ean = url.searchParams.get('product_code');
    if (ean === RIZ.ean) {
      return jsonRes({
        items: [
          item({ id: 10, price: 1.69, date: '2026-11-08' }),
          item({ id: 11, price: 2.09, location_osm_id: 987654, brand: 'Carrefour', date: '2026-11-07', price_is_discounted: true, price_without_discount: 2.29 }),
        ],
        total: 2,
        page: 1,
        size: 50,
        pages: 1,
      });
    }
    return jsonRes({ items: [item({ product_code: RIZ_MDD.ean, price: 1.25, brand: 'Lidl', name: 'Lidl Gerland' })] });
  });
  const res = await makeHandler(repo, fetch, { sleeps })(cronReq({ limit: 10 }));
  assertEquals(res.status, 200);
  const { stats } = await res.json();
  assertEquals(stats.productsProcessed, 2);
  assertEquals(stats.pricesUpserted, 3);
  assertEquals(stats.errors, 0);
  // URL de l'API conforme.
  assertEquals(`${calls[0].origin}${calls[0].pathname}`, OPEN_PRICES_URL);
  assertEquals(calls[0].searchParams.get('order_by'), '-date');
  assertEquals(calls[0].searchParams.get('date__gte'), '2026-09-11');
  // Délai entre les appels (pas avant le premier).
  assertEquals(sleeps, [250]);
  const byKey = Object.fromEntries(repo.upserted.map((p) => [`${p.productId}|${p.storeId}`, p]));
  assertEquals(byKey['prd_riz|leclerc'].priceCents, 169);
  assertEquals(byKey['prd_riz|leclerc'].source, 'open_prices');
  assertEquals(byKey['prd_riz|carrefour'].priceCents, 229);
  assertEquals(byKey['prd_riz|carrefour'].promoPriceCents, 209);
  assertEquals(byKey['prd_riz_mdd_lidl|lidl'].priceCents, 125);
  assertEquals(repo.checked.sort(), ['prd_riz', 'prd_riz_mdd_lidl']);
});

Deno.test('collecte : un relevé plus ancien qu\'un prix réel n\'écrase pas', async () => {
  const current: Price[] = [
    { productId: 'prd_riz', storeId: 'leclerc', priceCents: 175, updatedAt: '2026-11-09T08:00:00.000Z', source: 'partner' },
  ];
  const repo = fakeRepo({ products: [RIZ], current });
  const { fetch } = fakeFetch(() => jsonRes({ items: [item({ date: '2026-11-05' })] }));
  const { stats } = await (await makeHandler(repo, fetch)(cronReq())).json();
  assertEquals(stats.pricesUpserted, 0);
  assertEquals(stats.pricesSkippedOlder, 1);
});

Deno.test('collecte : HTTP 429 → Retry-After honoré puis arrêt propre du lot', async () => {
  const repo = fakeRepo();
  const sleeps: number[] = [];
  let n = 0;
  const { fetch } = fakeFetch(() => {
    n++;
    return jsonRes({ detail: 'Too many requests' }, 429, { 'retry-after': '3' });
  });
  const res = await makeHandler(repo, fetch, { sleeps })(cronReq());
  assertEquals(res.status, 200);
  const { stats } = await res.json();
  assert(stats.rateLimited);
  assertEquals(stats.productsProcessed, 0);
  assertEquals(n, 2, 'une seule nouvelle tentative');
  assert(sleeps.includes(3000), 'Retry-After (3 s) respecté');
  assertEquals(repo.upserted.length, 0);
});

Deno.test('collecte : 429 puis succès au second essai', async () => {
  const repo = fakeRepo({ products: [RIZ] });
  let n = 0;
  const { fetch } = fakeFetch(() => (++n === 1 ? jsonRes({}, 429) : jsonRes({ items: [item()] })));
  const { stats } = await (await makeHandler(repo, fetch)(cronReq())).json();
  assertFalse(stats.rateLimited);
  assertEquals(stats.pricesUpserted, 1);
});

Deno.test('collecte : erreur 500 / réseau / JSON invalide sur un produit → compté, lot poursuivi', async () => {
  const repo = fakeRepo();
  const { fetch } = fakeFetch((url) =>
    url.searchParams.get('product_code') === RIZ.ean ? jsonRes({ error: 'boom' }, 500) : new Response('<html>', { status: 200 })
  );
  const { stats } = await (await makeHandler(repo, fetch)(cronReq())).json();
  assertEquals(stats.errors, 1);
  assertEquals(stats.productsProcessed, 1, 'le JSON illisible donne 0 relevé, pas une erreur');
  assertEquals(repo.checked, ['prd_riz_mdd_lidl']);
});

Deno.test('baisses de prix : notification mise en file (une seule fois), dryRun n\'écrit rien', async () => {
  const watches: PriceWatchRow[] = [
    { userId: 'u1', productId: 'prd_riz', storeId: 'leclerc', referenceCents: 199 },
    { userId: 'u2', productId: 'prd_riz', storeId: 'leclerc', referenceCents: 170 }, // baisse < 5 %
  ];
  const repo = fakeRepo({ products: [RIZ], watches });
  const { fetch } = fakeFetch(() => jsonRes({ items: [item({ price: 1.69 })] }));
  const handler = makeHandler(repo, fetch);

  const dry = await (await handler(cronReq({ dryRun: true }))).json();
  assertEquals(dry.stats.priceDrops, 1);
  assertEquals(dry.stats.notificationsQueued, 0);
  assertEquals(repo.upserted.length, 0);

  const { stats } = await (await handler(cronReq())).json();
  assertEquals(stats.notificationsQueued, 1);
  const n = repo.queued[0];
  assertEquals(n.userId, 'u1');
  assertEquals(n.kind, 'price_drop');
  assertStringIncludes(n.body, '1,69');
  assertStringIncludes(n.body, '1,99');
  assertEquals(n.dedupeKey, 'price_drop:u1:prd_riz:leclerc:169');

  const again = await (await handler(cronReq())).json();
  assertEquals(again.stats.notificationsQueued, 0, 'dédupliquée');
});

Deno.test('validation : limit hors bornes → 400', async () => {
  const { fetch } = fakeFetch(() => jsonRes({ items: [] }));
  const res = await makeHandler(fakeRepo(), fetch)(cronReq({ limit: 9999 }));
  assertEquals(res.status, 400);
  await res.body?.cancel();
});

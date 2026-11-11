import { assert, assertEquals, assertFalse, assertStringIncludes } from '@std/assert';
import type { Price, Product, Store } from '../_shared/core/index.ts';
import { silentLogger } from '../_shared/logger.ts';
import { fakeGtin, PRODUCTS, STORES } from '../_shared/testing/fixtures.ts';
import {
  type CollectState,
  type CollectStats,
  createCollectPricesHandler,
  type NotificationInsert,
  type PriceCollectionRepository,
  type PriceWatchRow,
} from './handler.ts';
import {
  type ApiPriceItem,
  buildProductMatcher,
  chainPriceFromObservations,
  type CollectLocation,
  decodeMaybeGzip,
  fetchLocationsDump,
  fetchPricesPage,
  locationBatches,
  locationFromRaw,
  matchItem,
  OPEN_DATA_USER_AGENT,
  OPEN_PRICES_DUMP_URLS,
  OPEN_PRICES_URL,
  priceWindow,
  type RawLocation,
  shouldReplace,
  type StoredObservation,
} from './openPrices.ts';
import { locationToRow, observationToRow, rowToLocation, rowToObservation } from './repo.ts';

const NOW = new Date('2026-11-10T09:00:00.000Z');
const WINDOW = priceWindow(NOW);
const SECRET = 'cron-secret-test';

const RIZ = PRODUCTS.find((p) => p.id === 'prd_riz')!; // 1 kg, code-barres
const RIZ_MDD_LIDL = PRODUCTS.find((p) => p.id === 'prd_riz_mdd_lidl')!;
const TOMATE_VRAC = PRODUCTS.find((p) => p.id === 'prd_tomate_vrac')!; // 1 kg, en:tomatoes
/** MDD Mousquetaires : même code-barres chez Intermarché ET Netto. */
const PATES_MDD: Product = {
  id: 'prd_pates_mdd_intermarche',
  ean: fakeGtin(900),
  name: 'Pâtes Chabrior',
  brand: 'Chabrior',
  isStoreBrand: true,
  storeChains: ['intermarche', 'netto'],
  ingredientId: 'pates',
  packSize: 500,
  packUnit: 'g',
  allergens: ['gluten'],
};
/** Vrac bio, 500 g : relevés « au kilo » étiquetés bio uniquement. */
const TOMATE_BIO_VRAC: Product = {
  ...TOMATE_VRAC,
  id: 'prd_tomate_bio_vrac',
  organic: true,
  packSize: 500,
};
const CATALOG = [RIZ, RIZ_MDD_LIDL, TOMATE_VRAC, PATES_MDD, TOMATE_BIO_VRAC];

const nationalStore = (chain: Store['chain']): Store => ({
  ...STORES[0],
  id: chain,
  chain,
  name: chain,
  pickup: 'drive',
});
const ALL_STORES: Store[] = [...STORES, nationalStore('intermarche'), nationalStore('netto'), nationalStore('superu')];

// ─── Lieux ───────────────────────────────────────────────────────────────────

function rawLoc(id: number, over: Partial<RawLocation> = {}): RawLocation {
  return {
    id,
    type: 'OSM',
    osm_id: 1000 + id,
    osm_type: 'NODE',
    osm_brand: 'E.Leclerc',
    osm_name: 'E.Leclerc',
    osm_tag_value: 'supermarket',
    osm_address_postcode: '69007',
    osm_address_city: 'Lyon',
    osm_address_country: 'France',
    osm_address_country_code: 'FR',
    ...over,
  };
}

Deno.test('lieux : les 10 enseignes, France métropolitaine uniquement, formats de proximité', () => {
  const chain = (over: Partial<RawLocation>) => locationFromRaw(rawLoc(1, over));
  assertEquals(chain({})?.chain, 'leclerc');
  assertEquals(chain({ osm_brand: 'Super U', osm_name: 'Super U Gerland' })?.chain, 'superu');
  assertEquals(chain({ osm_brand: 'Hyper U' })?.chain, 'superu');
  const uExpress = chain({ osm_brand: 'U Express', osm_name: 'U Express' })!;
  assertEquals([uExpress.chain, uExpress.proximity], ['superu', true]);
  assertEquals(chain({ osm_brand: 'Super U' })?.proximity, false);
  assertEquals(chain({ osm_brand: 'Utile' })?.proximity, true);
  assertEquals(chain({ osm_brand: 'Aldi' })?.chain, 'aldi');
  assertEquals(chain({ osm_brand: 'Netto' })?.chain, 'netto');
  assertEquals(chain({ osm_brand: 'Franprix' })?.chain, 'franprix');
  const monop = chain({ osm_brand: "Monop'" })!;
  assertEquals([monop.chain, monop.proximity], ['monoprix', true]);
  const city = chain({ osm_brand: 'Carrefour City' })!;
  assertEquals([city.chain, city.proximity], ['carrefour', true]);
  assertEquals(chain({ osm_brand: 'Intermarché Super' })?.chain, 'intermarche');
  // Jamais « U » seul (faux positifs), marque inconnue → pas de repli sur le nom.
  assertEquals(chain({ osm_brand: 'U', osm_name: 'U' }), null);
  assertEquals(chain({ osm_brand: 'Biocoop', osm_name: "Biocoop Carrefour de l'Europe" }), null);
  assertEquals(chain({ osm_brand: '', osm_name: 'Lidl Part-Dieu' })?.chain, 'lidl');
  // Étranger, outre-mer, station-service, lieu en ligne, id invalide : écartés.
  assertEquals(chain({ osm_address_country_code: 'BE', osm_address_country: 'Belgique', osm_brand: 'Aldi' }), null);
  assertEquals(chain({ osm_address_country_code: 'ES', osm_address_country: 'France' }), null);
  assertEquals(chain({ osm_address_country_code: null, osm_address_country: 'France' })?.chain, 'leclerc');
  assertEquals(chain({ osm_address_postcode: '97400' }), null);
  assertEquals(chain({ osm_address_postcode: '98000' }), null);
  assertEquals(chain({ osm_tag_value: 'fuel' }), null);
  assertEquals(chain({ type: 'ONLINE' }), null);
  assertEquals(locationFromRaw(rawLoc(0)), null);
  // Aller-retour ligne SQL.
  const loc = chain({ osm_brand: 'Netto', osm_name: 'Netto Vénissieux' })!;
  assertEquals(rowToLocation(locationToRow(loc, NOW.toISOString())), loc);
});

const gzip = async (text: string): Promise<ArrayBuffer> =>
  await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();

Deno.test('lieux : export locations.jsonl.gz (gzip ou texte), lignes illisibles et doublons ignorés', async () => {
  const lines = [
    rawLoc(3),
    rawLoc(1, { osm_brand: 'Lidl' }),
    rawLoc(2, { osm_address_country_code: 'DE', osm_address_country: 'Deutschland', osm_brand: 'Lidl' }),
    rawLoc(3),
    rawLoc(4, { osm_brand: 'Picard' }),
  ].map((l) => JSON.stringify(l)).join('\n') + '\n{tronqué';
  assertEquals(await decodeMaybeGzip(await gzip('a\nb')), 'a\nb');
  assertEquals(await decodeMaybeGzip(new TextEncoder().encode('ok').buffer), 'ok');
  for (const body of [await gzip(lines), new TextEncoder().encode(lines).buffer]) {
    const calls: { url: string; ua: string | null }[] = [];
    const f = ((input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), ua: new Headers(init?.headers).get('user-agent') });
      return Promise.resolve(new Response(body));
    }) as typeof fetch;
    const locs = await fetchLocationsDump({ fetch: f });
    assertEquals(locs.map((l) => [l.id, l.chain]), [[1, 'lidl'], [3, 'leclerc']]);
    assertEquals(calls[0].url, OPEN_PRICES_DUMP_URLS.locations);
    assertEquals(calls[0].ua, OPEN_DATA_USER_AGENT);
  }
});

Deno.test('relevés : requête incrémentale par lots de lieux (≤ 600), triée par création', async () => {
  const locs = Array.from({ length: 1300 }, (_, i) => locationFromRaw(rawLoc(i + 1))!);
  const batches = locationBatches(locs);
  assertEquals(batches.map((b) => b.length), [600, 600, 100]);
  let seen: URL | null = null;
  const f = ((input: string | URL | Request) => {
    seen = new URL(String(input));
    return Promise.resolve(Response.json({ items: [{ id: 1 }, null, 'x'], page: 2, pages: 3, total: 201 }));
  }) as typeof fetch;
  const page = await fetchPricesPage({ locationIds: [3, 5, 8], createdGte: '2026-11-04T00:00:00.000Z', page: 2 }, {
    fetch: f,
  });
  assertEquals(page, { items: [{ id: 1 }], page: 2, pages: 3 });
  const url = seen! as URL;
  assertEquals(`${url.origin}${url.pathname}`, OPEN_PRICES_URL);
  assertEquals(url.searchParams.get('location_id__in'), '3,5,8');
  assertEquals(url.searchParams.get('created__gte'), '2026-11-04T00:00:00.000Z');
  assertEquals(url.searchParams.get('duplicate_of__isnull'), 'true');
  assertEquals(url.searchParams.get('order_by'), 'created');
  assertEquals(url.searchParams.get('size'), '100');
  assertEquals(url.searchParams.get('page'), '2');
});

// ─── Rattachement ────────────────────────────────────────────────────────────

const LECLERC_LOC = locationFromRaw(rawLoc(400))!;
const INTERMARCHE_LOC = locationFromRaw(rawLoc(401, { osm_brand: 'Intermarché Super', osm_name: 'Intermarché' }))!;
const NETTO_LOC = locationFromRaw(rawLoc(402, { osm_brand: 'Netto', osm_name: 'Netto' }))!;
const CITY_LOC = locationFromRaw(rawLoc(403, { osm_brand: 'Carrefour City', osm_name: 'Carrefour City' }))!;
const CARREFOUR_LOC = locationFromRaw(rawLoc(404, { osm_brand: 'Carrefour', osm_name: 'Carrefour' }))!;
const LIDL_LOC = locationFromRaw(rawLoc(405, { osm_brand: 'Lidl', osm_name: 'Lidl' }))!;
const LOCATIONS: CollectLocation[] = [LECLERC_LOC, INTERMARCHE_LOC, NETTO_LOC, CITY_LOC, CARREFOUR_LOC, LIDL_LOC];
const RAW_BY_ID = new Map<number, RawLocation>([
  [400, rawLoc(400)],
  [401, rawLoc(401, { osm_brand: 'Intermarché Super', osm_name: 'Intermarché' })],
  [402, rawLoc(402, { osm_brand: 'Netto', osm_name: 'Netto' })],
  [403, rawLoc(403, { osm_brand: 'Carrefour City', osm_name: 'Carrefour City' })],
  [404, rawLoc(404, { osm_brand: 'Carrefour', osm_name: 'Carrefour' })],
  [405, rawLoc(405, { osm_brand: 'Lidl', osm_name: 'Lidl' })],
]);

let SEQ = 1000;
/** Relevé de l'API v1 (lieu joint), propriétaire jamais lu. */
function item(over: Partial<ApiPriceItem> & { loc?: number } = {}): ApiPriceItem {
  const { loc = 400, ...rest } = over;
  const id = rest.id ?? SEQ++;
  return {
    id,
    type: 'PRODUCT',
    product_code: RIZ.ean,
    price: 1.79,
    currency: 'EUR',
    price_per: null,
    price_is_discounted: false,
    price_without_discount: null,
    date: '2026-11-05',
    receipt_quantity: null,
    duplicate_of: null,
    location_id: loc,
    location: RAW_BY_ID.get(loc),
    created: `2026-11-0${(id % 5) + 5}T08:00:00.000Z`,
    ...rest,
  };
}
const vrac = (over: Partial<ApiPriceItem> & { loc?: number } = {}) =>
  item({
    type: 'CATEGORY',
    product_code: null,
    category_tag: 'en:tomatoes',
    price_per: 'KILOGRAM',
    price: 2.99,
    ...over,
  });

const MATCHER = buildProductMatcher(CATALOG);
const rowsOf = (i: ApiPriceItem, fallback?: CollectLocation) => {
  const m = matchItem(i, WINDOW, MATCHER, fallback);
  return m.status === 'matched' ? m.rows : m.status;
};

Deno.test('rattachement : code-barres, vrac (bio à part), MDD dans ses seules enseignes', () => {
  const r = rowsOf(item({ id: 1, price: '1.79' })) as StoredObservation[];
  assertEquals(r, [{
    productId: 'prd_riz',
    chain: 'leclerc',
    kind: 'observation',
    openPricesId: 1,
    locationId: 400,
    weight: 1,
    regularMilli: 1790,
    pricePer: null,
    proximity: false,
    observedOn: '2026-11-05',
    sourceCreatedAt: '2026-11-06T08:00:00.000Z',
  }]);
  // Vrac au kilo : conventionnel et bio agrégés séparément.
  assertEquals((rowsOf(vrac()) as StoredObservation[]).map((o) => [o.productId, o.pricePer, o.regularMilli]), [
    ['prd_tomate_vrac', 'KILOGRAM', 2990],
  ]);
  assertEquals((rowsOf(vrac({ labels_tags: ['en:organic'] })) as StoredObservation[]).map((o) => o.productId), [
    'prd_tomate_bio_vrac',
  ]);
  assertEquals(rowsOf(vrac({ price_per: 'UNIT' })), 'unmatched', 'à la pièce ≠ au kilo');
  // MDD Mousquetaires : Intermarché et Netto, jamais chez Leclerc.
  assertEquals((rowsOf(item({ product_code: PATES_MDD.ean, loc: 402 })) as StoredObservation[])[0].chain, 'netto');
  assertEquals(
    (rowsOf(item({ product_code: PATES_MDD.ean, loc: 401 })) as StoredObservation[])[0].chain,
    'intermarche',
  );
  assertEquals(rowsOf(item({ product_code: PATES_MDD.ean, loc: 400 })), 'unmatched');
  assertEquals(rowsOf(item({ product_code: RIZ_MDD_LIDL.ean, loc: 404 })), 'unmatched');
  // Format de proximité signalé.
  assertEquals((rowsOf(item({ loc: 403 })) as StoredObservation[])[0].proximity, true);
  // Promo avec prix barré : prix normal + promo.
  const promo =
    (rowsOf(item({ price: 1.5, price_is_discounted: true, price_without_discount: 1.99 })) as StoredObservation[])[0];
  assertEquals([promo.regularMilli, promo.promoMilli], [1990, 1500]);
  // Lieu absent du relevé : repli sur le lieu connu.
  assertEquals((rowsOf(item({ location: null }), LECLERC_LOC) as StoredObservation[])[0].chain, 'leclerc');
  // Produit hors catalogue.
  assertEquals(rowsOf(item({ product_code: '3017620425035' })), 'unmatched');
});

Deno.test('rattachement : filtres obligatoires (étranger, DOM, devise, doublon, quantité, poids variable, promo sans prix barré…)', () => {
  const rejected = [
    item({ location: rawLoc(400, { osm_address_country_code: 'BE', osm_address_country: 'Belgique' }) }),
    item({ location: rawLoc(400, { osm_address_country_code: 'CH', osm_address_country: 'France' }) }),
    item({ location: rawLoc(400, { osm_address_postcode: '97200' }) }),
    item({ location: rawLoc(400, { osm_tag_value: 'fuel' }) }),
    item({ location: rawLoc(400, { osm_brand: 'Biocoop' }) }),
    item({ location: null }),
    item({ currency: 'CHF' }),
    item({ duplicate_of: 42 }),
    item({ date: null }),
    item({ date: '2025-11-01' }), // hors fenêtre de 365 j
    item({ date: '2026-12-01' }), // futur
    item({ receipt_quantity: 2 }),
    item({ product_code: '2012345000017' }), // poids variable
    item({ product_code: '3017620425036' }), // clé fausse
    item({ price: 0 }),
    item({ price: 'abc' }),
    item({ price: 1.5, price_is_discounted: true, price_without_discount: null }),
    item({ price_per: 'KILOGRAM' }), // code-barres « au kilo » : ambigu
    item({ id: null }),
  ];
  for (const [i, it] of rejected.entries()) assertEquals(rowsOf(it), 'rejected', `cas ${i}`);
  // receipt_quantity 1 (ou « 1.000 » de l'export) accepté.
  assert(Array.isArray(rowsOf(item({ receipt_quantity: 1 }))));
});

// ─── Prix d'enseigne ─────────────────────────────────────────────────────────

const obs = (over: Partial<StoredObservation>): StoredObservation => ({
  productId: 'prd_riz',
  chain: 'leclerc',
  kind: 'observation',
  openPricesId: SEQ++,
  weight: 1,
  regularMilli: 1790,
  pricePer: null,
  proximity: false,
  observedOn: '2026-11-05',
  ...over,
});

Deno.test("prix d'enseigne : médiane relevés + socle pondéré, hors proximité préféré, fenêtre de 365 j", () => {
  // Socle : 9 relevés à 1,69 € ; 2 nouveaux relevés à 1,99 € → médiane 1,69 €.
  const snapshot = obs({
    kind: 'snapshot',
    openPricesId: undefined,
    weight: 9,
    regularMilli: 1690,
    observedOn: '2026-11-01',
    observedFrom: '2026-02-01',
  });
  const p = chainPriceFromObservations(RIZ, 'leclerc', [
    snapshot,
    obs({ regularMilli: 1990, observedOn: '2026-11-08' }),
    obs({ regularMilli: 1990, observedOn: '2026-11-09' }),
    obs({ regularMilli: 2990, proximity: true, observedOn: '2026-11-09' }), // proximité : écarté
    obs({ regularMilli: 990, observedOn: '2025-10-01' }), // hors fenêtre
  ], WINDOW)!;
  assertEquals(p, {
    productId: 'prd_riz',
    storeId: 'leclerc',
    priceCents: 169,
    updatedAt: '2026-11-09T12:00:00.000Z',
    source: 'open_prices',
    observationCount: 11,
    observedFrom: '2026-02-01',
  });
  // Seulement des relevés de proximité : utilisés faute de mieux.
  assertEquals(
    chainPriceFromObservations(
      RIZ,
      'carrefour',
      [obs({ chain: 'carrefour', proximity: true, regularMilli: 2290 })],
      WINDOW,
    )?.priceCents,
    229,
  );
  assertEquals(chainPriceFromObservations(RIZ, 'leclerc', [], WINDOW), null);
  // Vrac au kilo → prix du conditionnement (500 g).
  assertEquals(
    chainPriceFromObservations(TOMATE_BIO_VRAC, 'leclerc', [
      obs({ productId: TOMATE_BIO_VRAC.id, pricePer: 'KILOGRAM', regularMilli: 4990 }),
    ], WINDOW)
      ?.priceCents,
    250,
  );
  // Unité incohérente (relevé au kilo sur un code-barres) : ignorée.
  assertEquals(chainPriceFromObservations(RIZ, 'leclerc', [obs({ pricePer: 'KILOGRAM' })], WINDOW), null);
});

Deno.test("prix d'enseigne : promo relevée valable 7 jours au plus", () => {
  const recent = chainPriceFromObservations(RIZ, 'leclerc', [
    obs({ regularMilli: 1990, observedOn: '2026-11-01', promoMilli: 1290 }), // trop ancienne (> 7 j)
    obs({ regularMilli: 1990, observedOn: '2026-11-06', promoMilli: 1490 }),
  ], WINDOW)!;
  assertEquals([recent.promoPriceCents, recent.promoLabel, recent.promoUntil], [149, 'Promo relevée', '2026-11-13']);
  const old = chainPriceFromObservations(RIZ, 'leclerc', [
    obs({ regularMilli: 1990, observedOn: '2026-10-20', promoMilli: 1490 }),
  ], WINDOW)!;
  assertEquals(old.promoPriceCents, undefined);
});

Deno.test('shouldReplace : un relevé réel remplace toujours une estimation, un réel seulement par plus récent', () => {
  const next: Price = {
    productId: 'p',
    storeId: 's',
    priceCents: 100,
    updatedAt: '2026-10-01T12:00:00.000Z',
    source: 'open_prices',
    observationCount: 1,
    observedFrom: '2026-10-01',
  };
  const base = { productId: 'p', storeId: 's', priceCents: 120, updatedAt: '2026-11-11T00:00:00.000Z' };
  assert(shouldReplace(undefined, next));
  assert(
    shouldReplace({ ...base, source: 'estimate', estimateMethod: 'chain_index', estimateBasisCount: 3 }, next),
    'estimation plus récente remplacée',
  );
  assert(shouldReplace({ ...base, source: 'demo' }, next));
  assertFalse(shouldReplace({ ...base, source: 'open_prices', observationCount: 4 }, next));
  assertFalse(shouldReplace({ ...base, source: 'partner' }, next));
  assert(shouldReplace({ ...base, source: 'open_prices', updatedAt: '2026-10-01T00:00:00.000Z' }, next), 'même jour');
});

Deno.test('relevés stockés : aller-retour ligne SQL (owner jamais stocké)', () => {
  const o = obs({ locationId: 400, promoMilli: 1490, sourceCreatedAt: '2026-11-06T08:00:00.000Z' });
  const row = observationToRow(o);
  assertFalse('owner' in row);
  assertEquals(rowToObservation({ ...row, id: 1, recorded_at: NOW.toISOString() }), o);
});

// ─── Handler ─────────────────────────────────────────────────────────────────

interface Fake extends PriceCollectionRepository {
  state: CollectState & { lastStats?: CollectStats };
  locations: CollectLocation[];
  observations: StoredObservation[];
  prices: Map<string, Price>;
  upserted: Price[];
  queued: NotificationInsert[];
  saves: number;
}

function fakeRepo(opts: {
  current?: Price[];
  watches?: PriceWatchRow[];
  observations?: StoredObservation[];
  locations?: CollectLocation[];
  state?: Partial<CollectState>;
  snapshotAt?: string | null;
} = {}): Fake {
  const dedupe = new Set<string>();
  const repo: Fake = {
    state: {
      createdCursor: opts.state?.createdCursor ?? null,
      locationsRefreshedAt: opts.state?.locationsRefreshedAt ?? '2026-11-08T00:00:00.000Z',
    },
    locations: opts.locations ?? LOCATIONS,
    observations: [...(opts.observations ?? [])],
    prices: new Map((opts.current ?? []).map((p) => [`${p.productId}|${p.storeId}`, p])),
    upserted: [],
    queued: [],
    saves: 0,
    loadState: () =>
      Promise.resolve({
        createdCursor: repo.state.createdCursor,
        locationsRefreshedAt: repo.state.locationsRefreshedAt,
      }),
    saveState: (s) => {
      repo.state = {
        createdCursor: s.createdCursor,
        locationsRefreshedAt: s.locationsRefreshedAt,
        lastStats: s.lastStats,
      };
      repo.saves++;
      return Promise.resolve();
    },
    loadSnapshotAt: () => Promise.resolve(opts.snapshotAt === undefined ? '2026-11-04' : opts.snapshotAt),
    loadLocations: () => Promise.resolve(repo.locations),
    replaceLocations: (locs) => {
      repo.locations = locs;
      return Promise.resolve();
    },
    loadProducts: () => Promise.resolve(CATALOG),
    loadStores: () => Promise.resolve(ALL_STORES),
    insertObservations: (rows) => {
      let n = 0;
      for (const r of rows) {
        if (repo.observations.some((o) => o.openPricesId === r.openPricesId && o.productId === r.productId)) continue;
        repo.observations.push(r);
        n++;
      }
      return Promise.resolve(n);
    },
    loadObservations: (ids, fromDay) =>
      Promise.resolve(repo.observations.filter((o) => ids.includes(o.productId) && o.observedOn >= fromDay)),
    loadCurrentPrices: (ids) =>
      Promise.resolve(Array.from(repo.prices.values()).filter((p) => ids.includes(p.productId))),
    upsertPrices: (ps) => {
      for (const p of ps) repo.prices.set(`${p.productId}|${p.storeId}`, p);
      repo.upserted.push(...ps);
      return Promise.resolve();
    },
    loadPriceWatches: (ids) => Promise.resolve((opts.watches ?? []).filter((w) => ids.includes(w.productId))),
    enqueueNotifications: (rows) => {
      let n = 0;
      for (const r of rows) {
        if (dedupe.has(r.dedupeKey)) continue;
        dedupe.add(r.dedupeKey);
        repo.queued.push(r);
        n++;
      }
      return Promise.resolve(n);
    },
  };
  return repo;
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

const page = (items: ApiPriceItem[], p = 1, pages = 1) =>
  Response.json({ items, page: p, pages, size: 100, total: items.length });
const isPrices = (url: URL) => url.pathname === '/api/v1/prices';

function makeHandler(
  repo: PriceCollectionRepository,
  f: typeof fetch,
  extra: { sleeps?: number[]; maxPages?: number } = {},
) {
  return createCollectPricesHandler({
    repo,
    cronSecret: SECRET,
    fetch: f,
    logger: silentLogger,
    now: () => NOW,
    delayMs: 2000,
    maxPages: extra.maxPages,
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

async function run(
  repo: PriceCollectionRepository,
  f: typeof fetch,
  body: unknown = {},
  extra = {},
): Promise<{ status: number; stats: CollectStats }> {
  const res = await makeHandler(repo, f, extra)(cronReq(body));
  const data = await res.json();
  return { status: res.status, stats: data.stats };
}

Deno.test('secret cron absent ou faux → 401 ; non configuré → 500', async () => {
  const { fetch } = fakeFetch(() => page([]));
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

Deno.test('collecte : relevés depuis le curseur → relevés stockés, prix national, curseur avancé', async () => {
  const estimate: Price = {
    productId: 'prd_riz',
    storeId: 'carrefour',
    priceCents: 205,
    updatedAt: '2026-11-11T00:00:00.000Z',
    source: 'estimate',
    estimateMethod: 'chain_index',
    estimateBasisCount: 12,
  };
  const repo = fakeRepo({
    current: [estimate],
    observations: [
      obs({
        kind: 'snapshot',
        openPricesId: undefined,
        weight: 3,
        regularMilli: 1690,
        observedOn: '2026-10-30',
        observedFrom: '2026-03-01',
      }),
    ],
  });
  const sleeps: number[] = [];
  const { fetch, calls } = fakeFetch((url) => {
    if (!isPrices(url)) return new Response('not found', { status: 404 });
    const p = Number(url.searchParams.get('page'));
    if (p === 1) {
      return page(
        [
          item({ id: 1, price: 1.79, created: '2026-11-05T08:00:00Z' }),
          item({ id: 2, price: 2.09, loc: 404, created: '2026-11-05T09:00:00Z' }),
          item({ id: 3, price: 2.49, loc: 403, created: '2026-11-05T10:00:00Z' }), // Carrefour City
        ],
        1,
        2,
      );
    }
    return page(
      [
        vrac({ id: 4, price: 2.99, created: '2026-11-06T08:00:00Z' }),
        item({ id: 5, product_code: PATES_MDD.ean, loc: 402, price: 0.95, created: '2026-11-06T09:00:00Z' }),
        item({ id: 6, location: rawLoc(400, { osm_address_country_code: 'BE', osm_address_country: 'Belgique' }) }),
        item({ id: 7, product_code: '3017620425035' }),
      ],
      2,
      2,
    );
  });
  const { status, stats } = await run(repo, fetch, {}, { sleeps });
  assertEquals(status, 200);
  // Curseur initial = date de l'instantané ; requêtes espacées de 2 s.
  assertEquals(calls.map((c) => c.searchParams.get('created__gte')), [
    '2026-11-04T00:00:00.000Z',
    '2026-11-04T00:00:00.000Z',
  ]);
  assertEquals(sleeps, [2000]);
  assertEquals(stats.items, 7);
  assertEquals(stats.matchedObservations, 5);
  assertEquals(stats.rejectedObservations, 1, 'relevé belge');
  assertEquals(stats.unmatchedObservations, 1, 'produit hors catalogue');
  assertEquals(stats.observationsInserted, 5);
  assertEquals(stats.estimatesReplaced, 1);
  const byKey = Object.fromEntries(repo.upserted.map((p) => [`${p.productId}|${p.storeId}`, p]));
  // Leclerc : socle (3 × 1,69) + 1,79 → médiane 1,69 €, 4 relevés.
  assertEquals(byKey['prd_riz|leclerc'], {
    productId: 'prd_riz',
    storeId: 'leclerc',
    priceCents: 169,
    updatedAt: '2026-11-05T12:00:00.000Z',
    source: 'open_prices',
    observationCount: 4,
    observedFrom: '2026-03-01',
  });
  // Carrefour : l'hyper (2,09) l'emporte sur le City (2,49) ; l'estimation est remplacée.
  assertEquals([
    byKey['prd_riz|carrefour'].priceCents,
    byKey['prd_riz|carrefour'].source,
    byKey['prd_riz|carrefour'].observationCount,
  ], [209, 'open_prices', 1]);
  assertEquals(byKey['prd_tomate_vrac|leclerc'].priceCents, 299);
  assertEquals(byKey['prd_pates_mdd_intermarche|netto'].priceCents, 95);
  assertEquals(byKey['prd_pates_mdd_intermarche|intermarche'], undefined);
  // Lots épuisés : curseur au début du passage (marge de 10 min).
  assertEquals(repo.state.createdCursor, '2026-11-10T08:50:00.000Z');
  assertEquals(stats.cursorTo, '2026-11-10T08:50:00.000Z');

  // Second passage : mêmes relevés (chevauchement) → rien de neuf, rien réécrit.
  repo.upserted.length = 0;
  const again = await run(repo, fetch);
  assertEquals(calls.at(-1)!.searchParams.get('created__gte'), '2026-11-10T08:50:00.000Z');
  assertEquals(again.stats.observationsInserted, 0);
  assertEquals(again.stats.pricesUpserted, 0);
  assert(again.stats.pricesUnchanged >= 4);
});

Deno.test("collecte : un relevé plus ancien qu'un prix réel n'écrase pas", async () => {
  const current: Price[] = [{
    productId: 'prd_riz',
    storeId: 'leclerc',
    priceCents: 175,
    updatedAt: '2026-11-09T08:00:00.000Z',
    source: 'partner',
  }];
  const repo = fakeRepo({ current });
  const { fetch } = fakeFetch(() => page([item({ date: '2026-11-05' })]));
  const { stats } = await run(repo, fetch);
  assertEquals(stats.pricesUpserted, 0);
  assertEquals(stats.pricesSkippedOlder, 1);
});

Deno.test("collecte : lieux périmés (> 7 j) rafraîchis depuis l'export, une seule requête", async () => {
  const repo = fakeRepo({ locations: [], state: { locationsRefreshedAt: null } });
  const dump = [rawLoc(400), rawLoc(401, { osm_brand: 'Intermarché' }), rawLoc(9, { osm_address_postcode: '97100' })]
    .map((l) => JSON.stringify(l)).join('\n');
  const gz = await gzip(dump);
  const { fetch, calls } = fakeFetch((url) => (isPrices(url) ? page([item({ id: 1 })]) : new Response(gz)));
  const { stats } = await run(repo, fetch);
  assert(stats.locationsRefreshed);
  assertEquals(stats.locations, 2);
  assertEquals(repo.locations.map((l) => l.id), [400, 401]);
  assertEquals(repo.state.locationsRefreshedAt, NOW.toISOString());
  assertEquals(calls.filter((c) => !isPrices(c)).length, 1);
  assertEquals(calls.find(isPrices)!.searchParams.get('location_id__in'), '400,401');
  // Récent : pas de nouveau téléchargement.
  const again = await run(repo, fetch);
  assertFalse(again.stats.locationsRefreshed);
});

Deno.test('collecte : export des lieux en échec → lieux stockés conservés, erreur comptée', async () => {
  const repo = fakeRepo({ state: { locationsRefreshedAt: '2026-10-01T00:00:00.000Z' } });
  const { fetch } = fakeFetch((url) => (isPrices(url) ? page([]) : new Response('boom', { status: 503 })));
  const { stats } = await run(repo, fetch);
  assertEquals(stats.errors, 1);
  assertEquals(stats.locations, LOCATIONS.length);
  assertEquals(repo.state.locationsRefreshedAt, '2026-10-01T00:00:00.000Z');
});

Deno.test('collecte : HTTP 429 → Retry-After honoré une fois puis arrêt, curseur conservé', async () => {
  const repo = fakeRepo({ state: { createdCursor: '2026-11-09T00:00:00.000Z' } });
  const sleeps: number[] = [];
  let n = 0;
  const { fetch } = fakeFetch(() => {
    n++;
    return Response.json({ detail: 'Too many requests' }, { status: 429, headers: { 'retry-after': '3' } });
  });
  const { status, stats } = await run(repo, fetch, {}, { sleeps });
  assertEquals(status, 200);
  assert(stats.rateLimited);
  assertEquals(n, 2, 'une seule nouvelle tentative');
  assert(sleeps.includes(3000), 'Retry-After (3 s) respecté');
  assertEquals(repo.state.createdCursor, '2026-11-09T00:00:00.000Z');
});

Deno.test('collecte : lot en erreur ou budget épuisé → curseur au dernier relevé traité du lot le plus en retard', async () => {
  const locs = Array.from({ length: 700 }, (_, i) => locationFromRaw(rawLoc(i + 1))!); // 2 lots
  const repo = fakeRepo({ locations: locs, state: { createdCursor: '2026-11-04T00:00:00.000Z' } });
  const { fetch } = fakeFetch((url) => {
    const firstBatch = url.searchParams.get('location_id__in')!.startsWith('1,');
    if (!firstBatch) return Response.json({ error: 'boom' }, { status: 500 });
    return Number(url.searchParams.get('page')) === 1
      ? page([item({ id: 1, loc: 1, location: rawLoc(1), created: '2026-11-07T10:00:00Z' })], 1, 3)
      : page([item({ id: 2, loc: 1, location: rawLoc(1), created: '2026-11-08T10:00:00Z' })], 2, 3);
  });
  // maxPages = 2 : le 1er lot s'arrête page 2 (sur 3) ; le 2e lot n'est pas lu.
  const { stats } = await run(repo, fetch, { maxPages: 2 });
  assert(stats.stoppedEarly);
  assertEquals(repo.state.createdCursor, '2026-11-04T00:00:00.000Z', 'lot non lu : curseur inchangé');
  // Sans plafond : 1er lot complet, 2e lot en erreur → curseur = dernier relevé du lot en retard.
  const repo2 = fakeRepo({ locations: locs, state: { createdCursor: '2026-11-04T00:00:00.000Z' } });
  const { fetch: f2 } = fakeFetch((url) =>
    url.searchParams.get('location_id__in')!.startsWith('1,')
      ? page([item({ id: 1, loc: 1, location: rawLoc(1), created: '2026-11-07T10:00:00Z' })])
      : Response.json({ error: 'boom' }, { status: 500 })
  );
  const r2 = await run(repo2, f2);
  assertEquals(r2.stats.errors, 1);
  assertEquals(repo2.state.createdCursor, '2026-11-04T00:00:00.000Z');
  assertEquals(r2.stats.observationsInserted, 1, 'le lot sain est traité');
});

Deno.test('collecte : `since` (rejeu) et validation', async () => {
  const repo = fakeRepo();
  const { fetch, calls } = fakeFetch(() => page([]));
  await run(repo, fetch, { since: '2026-10-01', limit: 200 });
  assertEquals(calls[0].searchParams.get('created__gte'), '2026-10-01T00:00:00.000Z');
  for (const body of [{ since: 'hier' }, { maxPages: 0 }, { limit: 9999 }]) {
    const res = await makeHandler(repo, fetch)(cronReq(body));
    assertEquals(res.status, 400);
    await res.body?.cancel();
  }
  // Sans instantané ni curseur : 7 derniers jours.
  const repo2 = fakeRepo({ snapshotAt: null });
  const { fetch: f2, calls: c2 } = fakeFetch(() => page([]));
  await run(repo2, f2);
  assertEquals(c2[0].searchParams.get('created__gte'), '2026-11-03T09:00:00.000Z');
});

Deno.test("baisses de prix : notification mise en file (une seule fois), dryRun n'écrit rien", async () => {
  const watches: PriceWatchRow[] = [
    { userId: 'u1', productId: 'prd_riz', storeId: 'leclerc', referenceCents: 199 },
    { userId: 'u2', productId: 'prd_riz', storeId: 'leclerc', referenceCents: 170 }, // baisse < 5 %
  ];
  const repo = fakeRepo({ watches });
  const { fetch } = fakeFetch(() => page([item({ id: 77, price: 1.69 })]));
  const handler = makeHandler(repo, fetch);

  const dry = await (await handler(cronReq({ dryRun: true }))).json();
  assertEquals(dry.stats.priceDrops, 1);
  assertEquals(dry.stats.notificationsQueued, 0);
  assertEquals(dry.stats.pricesUpserted, 1);
  assertEquals(repo.upserted.length, 0);
  assertEquals(repo.observations.length, 0);
  assertEquals(repo.saves, 0, 'dryRun : curseur non enregistré');

  const { stats } = await (await handler(cronReq())).json();
  assertEquals(stats.notificationsQueued, 1);
  const n = repo.queued[0];
  assertEquals(n.userId, 'u1');
  assertEquals(n.kind, 'price_drop');
  assertStringIncludes(n.body, '1,69');
  assertStringIncludes(n.body, '1,99');
  assertEquals(n.dedupeKey, 'price_drop:u1:prd_riz:leclerc:169');

  const again = await (await handler(cronReq({ since: '2026-11-04T00:00:00Z' }))).json();
  assertEquals(again.stats.notificationsQueued, 0, 'dédupliquée');
});

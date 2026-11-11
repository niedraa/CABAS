/**
 * Collecte Open Prices (Open Food Facts) — client HTTP et logique PURE propre
 * à la collecte incrémentale. Données ouvertes ODbL.
 *
 * Les RÈGLES de données (filtres France métropolitaine, enseignes, GTIN,
 * prix normal, médiane) sont celles de `core/openPrices.ts`, partagées avec
 * le pipeline d'import de l'instantané : la collecte quotidienne et
 * l'instantané appliquent exactement les mêmes.
 *
 *  1. points de vente : export `locations.jsonl.gz` → lieux de France
 *     métropolitaine des 10 enseignes (hors stations-service) ;
 *  2. relevés : `GET /api/v1/prices?location_id__in=…&created__gte=…` par lots
 *     de lieux, triés par date de création (curseur incrémental) ;
 *  3. rattachement : code-barres (`ean:<gtin>`) ou catégorie vrac
 *     (`cat:<tag>:<KILOGRAM|UNIT>[:organic]`) d'un produit du catalogue ; une
 *     MDD n'est rattachée qu'à ses enseignes ;
 *  4. prix d'enseigne : médiane (core › aggregateObservations) des relevés de
 *     365 jours + du socle de l'instantané (pondéré par son nombre de relevés).
 *
 * Le champ `owner` (pseudonyme du contributeur) n'est JAMAIS lu ni conservé.
 */
import type { Price, Product, Store, StoreChain } from '../_shared/core/index.ts';
import {
  aggregateKey,
  aggregateObservations,
  categoryKey,
  detectChain,
  eanKey,
  isFranceMetro,
  normalizeGtin,
  normalizeObservation,
  OPEN_DATA_USER_AGENT,
  OPEN_PRICES_DUMP_URLS,
  type PriceObservation,
  type RawPriceItem,
} from '../_shared/core/openPrices.ts';

export const OPEN_PRICES_API = 'https://prices.openfoodfacts.org/api/v1';
export const OPEN_PRICES_URL = `${OPEN_PRICES_API}/prices`;
export { OPEN_DATA_USER_AGENT, OPEN_PRICES_DUMP_URLS };

/** Fenêtre des relevés retenus (jours). */
export const WINDOW_DAYS = 365;
/** Durée de validité d'une promo relevée (jours) : Open Prices ne donne pas de date de fin. */
export const PROMO_VALIDITY_DAYS = 7;
/** Lieux par requête `location_id__in` (URL < 4 Ko). */
export const LOCATION_BATCH = 600;
/** Plafond de pseudo-relevés tirés d'un socle (mémoire bornée). */
const MAX_SNAPSHOT_COPIES = 5000;

const DAY_MS = 86_400_000;

/** Jour UTC `YYYY-MM-DD`. */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Jour + n jours. */
export function addDays(day: string, n: number): string {
  return isoDay(new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS));
}

/** Fenêtre glissante des relevés (bornes incluses). */
export function priceWindow(now: Date, days = WINDOW_DAYS): { from: string; to: string } {
  return { from: isoDay(new Date(now.getTime() - days * DAY_MS)), to: isoDay(now) };
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

export class OpenPricesHttpError extends Error {
  constructor(readonly status: number, readonly retryAfterMs: number | null) {
    super(`Open Prices HTTP ${status}`);
    this.name = 'OpenPricesHttpError';
  }
}

export interface HttpOptions {
  fetch: typeof fetch;
  signal?: AbortSignal;
}

async function getOk(url: string, opts: HttpOptions, accept: string): Promise<Response> {
  const res = await opts.fetch(url, {
    headers: { Accept: accept, 'User-Agent': OPEN_DATA_USER_AGENT },
    signal: opts.signal,
  });
  if (!res.ok) {
    await res.body?.cancel();
    const retry = res.headers.get('retry-after');
    const retryAfterMs = retry && Number.isFinite(Number(retry)) ? Number(retry) * 1000 : null;
    throw new OpenPricesHttpError(res.status, retryAfterMs);
  }
  return res;
}

// ─── Points de vente ─────────────────────────────────────────────────────────

/** Lieu Open Prices brut (export JSONL ou API `/locations`). */
export interface RawLocation {
  id?: number | null;
  type?: string | null;
  osm_id?: number | string | null;
  osm_type?: string | null;
  osm_name?: string | null;
  osm_brand?: string | null;
  osm_tag_value?: string | null;
  osm_address_postcode?: string | null;
  osm_address_city?: string | null;
  osm_address_country?: string | null;
  osm_address_country_code?: string | null;
}

/** Point de vente retenu (ligne de `open_prices_locations`). */
export interface CollectLocation {
  id: number;
  osmId: number | null;
  osmType: string | null;
  chain: StoreChain;
  proximity: boolean;
  osmName: string | null;
  osmBrand: string | null;
  osmTagValue: string | null;
  postcode: string | null;
  city: string | null;
}

const optText = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/** Lieu d'une des 10 enseignes en France métropolitaine (hors carburant), sinon `null`. */
export function locationFromRaw(raw: RawLocation): CollectLocation | null {
  const id = Number(raw.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (raw.type && raw.type !== 'OSM') return null;
  if (!isFranceMetro(raw)) return null;
  if ((raw.osm_tag_value ?? '').trim().toLowerCase() === 'fuel') return null;
  const detected = detectChain(raw);
  if (!detected) return null;
  const osmId = Number(raw.osm_id);
  const osmType = optText(raw.osm_type)?.toUpperCase() ?? null;
  return {
    id,
    osmId: Number.isFinite(osmId) && osmId > 0 ? osmId : null,
    osmType: osmType === 'NODE' || osmType === 'WAY' || osmType === 'RELATION' ? osmType : null,
    chain: detected.chain,
    proximity: detected.proximity,
    osmName: optText(raw.osm_name),
    osmBrand: optText(raw.osm_brand),
    osmTagValue: optText(raw.osm_tag_value),
    postcode: optText(raw.osm_address_postcode),
    city: optText(raw.osm_address_city),
  };
}

/** Lieu stocké → forme attendue par `normalizeObservation` (repli si le relevé n'a pas son lieu). */
export function locationForObservation(loc: CollectLocation): NonNullable<RawPriceItem['location']> {
  return {
    osm_brand: loc.osmBrand,
    osm_name: loc.osmName,
    osm_address_country_code: 'FR',
    osm_address_country: 'France',
    osm_address_postcode: loc.postcode,
    osm_tag_value: loc.osmTagValue,
  };
}

/** Lignes JSON d'un texte JSONL (lignes illisibles ignorées). */
export function parseJsonLines(text: string): unknown[] {
  const out: unknown[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      // ligne tronquée ou corrompue : ignorée
    }
  }
  return out;
}

/** Texte d'un corps éventuellement compressé (gzip détecté à la signature 1f 8b). */
export async function decodeMaybeGzip(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  }
  return new TextDecoder().decode(bytes);
}

/** Points de vente retenus de l'export complet `locations.jsonl.gz` (une requête, ~1,3 Mo). */
export async function fetchLocationsDump(opts: HttpOptions): Promise<CollectLocation[]> {
  const res = await getOk(OPEN_PRICES_DUMP_URLS.locations, opts, 'application/gzip, application/x-ndjson, */*');
  const text = await decodeMaybeGzip(await res.arrayBuffer());
  const out: CollectLocation[] = [];
  const seen = new Set<number>();
  for (const raw of parseJsonLines(text)) {
    if (!raw || typeof raw !== 'object') continue;
    const loc = locationFromRaw(raw as RawLocation);
    if (loc && !seen.has(loc.id)) {
      seen.add(loc.id);
      out.push(loc);
    }
  }
  return out.sort((a, b) => a.id - b.id);
}

// ─── Relevés ─────────────────────────────────────────────────────────────────

/** Relevé de l'API v1 (champs utilisés ; `owner` n'est jamais lu). */
export interface ApiPriceItem extends RawPriceItem {
  id?: number | null;
  location_id?: number | null;
  /** Création du relevé dans Open Prices (curseur incrémental). */
  created?: string | null;
}

export interface PricesPage {
  items: ApiPriceItem[];
  page: number;
  pages: number;
}

/** Une page de relevés créés depuis `createdGte` pour des lieux donnés, du plus ancien au plus récent. */
export async function fetchPricesPage(
  query: { locationIds: readonly number[]; createdGte: string; page: number; size?: number },
  opts: HttpOptions,
): Promise<PricesPage> {
  const params = new URLSearchParams({
    location_id__in: query.locationIds.join(','),
    created__gte: query.createdGte,
    duplicate_of__isnull: 'true',
    order_by: 'created',
    size: String(query.size ?? 100),
    page: String(query.page),
  });
  const res = await getOk(`${OPEN_PRICES_URL}?${params}`, opts, 'application/json');
  const body = await res.json().catch(() => null) as Record<string, unknown> | null;
  const items = body && Array.isArray(body.items)
    ? (body.items.filter((i) => i && typeof i === 'object') as ApiPriceItem[])
    : [];
  const pages = Number(body?.pages);
  return { items, page: query.page, pages: Number.isFinite(pages) && pages >= 0 ? pages : query.page };
}

/** Lots de lieux (ids triés) pour `location_id__in`. */
export function locationBatches(locations: readonly CollectLocation[], size = LOCATION_BATCH): number[][] {
  const ids = Array.from(new Set(locations.map((l) => l.id))).sort((a, b) => a - b);
  const out: number[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

// ─── Rattachement au catalogue ───────────────────────────────────────────────

/**
 * Unité des relevés d'un produit vrac : celle de la SOURCE (`offPricePer`,
 * comme l'instantané — un concombre au poids se relève à la pièce), à défaut
 * déduite du conditionnement (g → au kilo, pièce → à la pièce) ; `null` sinon.
 */
export function loosePricePer(product: Pick<Product, 'packUnit' | 'offPricePer'>): 'KILOGRAM' | 'UNIT' | null {
  if (product.offPricePer === 'KILOGRAM' || product.offPricePer === 'UNIT') return product.offPricePer;
  return product.packUnit === 'g' ? 'KILOGRAM' : product.packUnit === 'piece' ? 'UNIT' : null;
}

/** Facteur prix unitaire de la source → prix du conditionnement du produit (celui du générateur si connu). */
export function packFactor(
  product: Pick<Product, 'packSize' | 'packUnit' | 'offPricePer' | 'offPackFactor'>,
  pricePer: 'KILOGRAM' | 'UNIT' | null,
): number {
  if (pricePer !== null && product.offPackFactor !== undefined && product.offPackFactor > 0) {
    if (loosePricePer(product) === pricePer) return product.offPackFactor;
  }
  if (pricePer === 'KILOGRAM') return product.packSize / 1000;
  if (pricePer === 'UNIT') return product.packSize;
  return 1;
}

/** Catégories vrac d'un produit, par ordre de préférence (la 1re = `offCategoryTag`). */
export function looseCategoryTags(product: Pick<Product, 'offCategoryTag' | 'offCategoryTags'>): string[] {
  const tags = (product.offCategoryTags && product.offCategoryTags.length > 0)
    ? product.offCategoryTags
    : product.offCategoryTag
    ? [product.offCategoryTag]
    : [];
  return Array.from(new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean)));
}

/**
 * Clés d'agrégat d'un produit du catalogue (même forme que core › aggregateKey
 * d'un relevé) : son code-barres, ou UNE clé par catégorie vrac (toutes ses
 * catégories, dans l'ordre de préférence).
 */
export function productKeys(product: Product): string[] {
  if (product.ean) {
    const gtin = normalizeGtin(product.ean);
    return gtin ? [eanKey(gtin)] : [];
  }
  const per = loosePricePer(product);
  if (!per) return [];
  return looseCategoryTags(product).map((tag) =>
    aggregateKey({ key: categoryKey(tag, per), pricePer: per, organic: !!product.organic })
  );
}

/** Clé d'agrégat principale d'un produit (code-barres ou 1re catégorie vrac). */
export function productKey(product: Product): string | null {
  return productKeys(product)[0] ?? null;
}

/** Index clé d'agrégat → produits du catalogue. */
export function buildProductMatcher(products: readonly Product[]): Map<string, Product[]> {
  const m = new Map<string, Product[]>();
  for (const p of products) {
    for (const key of productKeys(p)) {
      const list = m.get(key);
      if (!list) m.set(key, [p]);
      else if (!list.includes(p)) list.push(p);
    }
  }
  return m;
}

/** Catégorie d'une clé de relevé vrac `cat:<tag>:<unité>` (sinon `undefined`). */
function categoryOfKey(key: string): string | undefined {
  const m = /^cat:(.+):(?:KILOGRAM|UNIT)$/.exec(key);
  return m ? m[1] : undefined;
}

/** Plus grand entier SQL (`integer`) : au-delà, la ligne ne peut pas être stockée. */
const MAX_SQL_INT = 2_147_483_647;

/** Relevé (ou socle) stocké dans `price_observations`. */
export interface StoredObservation {
  productId: string;
  chain: StoreChain;
  kind: 'observation' | 'snapshot';
  openPricesId?: number;
  locationId?: number;
  weight: number;
  /** Prix normal, millièmes d'euro, dans l'unité de la source. */
  regularMilli: number;
  promoMilli?: number;
  pricePer: 'KILOGRAM' | 'UNIT' | null;
  /** Vrac : catégorie Open Food Facts du relevé (socle : celle retenue par l'instantané). */
  categoryTag?: string;
  proximity: boolean;
  /** Jour du relevé (socle : relevé le plus récent). */
  observedOn: string;
  /** Socle : relevé le plus ancien. */
  observedFrom?: string;
  sourceCreatedAt?: string;
}

export type MatchResult =
  | { status: 'rejected' }
  | { status: 'unmatched' }
  | { status: 'matched'; rows: StoredObservation[] };

/**
 * Relevé brut → lignes à stocker (une par produit rattaché). `fallbackLocation`
 * sert si l'API n'a pas joint le lieu au relevé.
 */
export function matchItem(
  item: ApiPriceItem,
  window: { from: string; to: string },
  matcher: ReadonlyMap<string, readonly Product[]>,
  fallbackLocation?: CollectLocation,
): MatchResult {
  const id = Number(item.id);
  if (!Number.isInteger(id) || id <= 0) return { status: 'rejected' };
  const raw: RawPriceItem = item.location || !fallbackLocation
    ? item
    : { ...item, location: locationForObservation(fallbackLocation) };
  const obs = normalizeObservation(raw, window);
  if (!obs) return { status: 'rejected' };
  // Défense en profondeur : un prix hors de l'entier SQL bloquerait toute l'insertion.
  const regularMilli = Math.round(obs.regularEur * 1000);
  if (!(regularMilli > 0 && regularMilli <= MAX_SQL_INT)) return { status: 'rejected' };
  const categoryTag = obs.pricePer !== null ? categoryOfKey(obs.key) : undefined;
  const products = (matcher.get(aggregateKey(obs)) ?? []).filter(
    (p) => !p.isStoreBrand || (p.storeChains ?? []).includes(obs.chain),
  );
  if (products.length === 0) return { status: 'unmatched' };
  const locationId = Number(item.location_id);
  const created = typeof item.created === 'string' && Number.isFinite(Date.parse(item.created))
    ? item.created
    : undefined;
  const rows = products.map((p) => {
    const row: StoredObservation = {
      productId: p.id,
      chain: obs.chain,
      kind: 'observation',
      openPricesId: id,
      weight: 1,
      regularMilli,
      pricePer: obs.pricePer,
      proximity: obs.proximity,
      observedOn: obs.date,
    };
    if (categoryTag) row.categoryTag = categoryTag;
    if (Number.isInteger(locationId) && locationId > 0) row.locationId = locationId;
    if (obs.promoEur !== undefined) {
      const promo = Math.round(obs.promoEur * 1000);
      if (promo > 0 && promo < row.regularMilli) row.promoMilli = promo;
    }
    if (created) row.sourceCreatedAt = created;
    return row;
  });
  return { status: 'matched', rows };
}

// ─── Prix d'enseigne ─────────────────────────────────────────────────────────

/** Relevés stockés → relevés core (un socle devient `weight` pseudo-relevés à son prix). */
export function toCoreObservations(rows: readonly StoredObservation[], key: string): PriceObservation[] {
  const out: PriceObservation[] = [];
  for (const r of rows) {
    const base = {
      key,
      chain: r.chain,
      proximity: r.proximity,
      regularEur: r.regularMilli / 1000,
      pricePer: r.pricePer,
      organic: false,
    };
    if (r.kind === 'snapshot') {
      const copies = Math.min(Math.max(1, Math.floor(r.weight)), MAX_SNAPSHOT_COPIES);
      out.push({ ...base, date: r.observedFrom && r.observedFrom < r.observedOn ? r.observedFrom : r.observedOn });
      for (let i = 1; i < copies; i++) out.push({ ...base, date: r.observedOn });
    } else {
      out.push({ ...base, date: r.observedOn });
    }
  }
  return out;
}

/**
 * Prix national d'une enseigne pour un produit, à partir de ses relevés de la
 * fenêtre (et du socle de l'instantané) : médiane du prix normal, relevés
 * hors proximité préférés. Promo : la plus récente des relevés de moins de
 * 7 jours, valable 7 jours après son relevé. `null` si aucun relevé.
 */
export function chainPriceFromObservations(
  product: Product,
  storeId: string,
  rows: readonly StoredObservation[],
  window: { from: string; to: string },
): Price | null {
  const inWindow = rows.filter((r) => r.observedOn >= window.from && r.observedOn <= window.to);
  // Unité cohérente avec le produit (un code-barres : prix du conditionnement ;
  // vrac : l'unité de la source, comme l'instantané).
  const per = product.ean ? null : loosePricePer(product);
  let usable = inWindow.filter((r) => r.pricePer === per);
  if (!product.ean) {
    // Vrac : la 1re catégorie (ordre de préférence) qui a des relevés dans la
    // fenêtre, comme l'instantané. Relevé sans catégorie (ancien) : la 1re.
    const tags = looseCategoryTags(product);
    const rank = (r: StoredObservation) => (r.categoryTag ? tags.indexOf(r.categoryTag) : 0);
    const ranked = usable.filter((r) => rank(r) >= 0);
    const best = ranked.reduce((m, r) => Math.min(m, rank(r)), Number.POSITIVE_INFINITY);
    usable = ranked.filter((r) => rank(r) === best);
  }
  const agg = aggregateObservations(toCoreObservations(usable, productKey(product) ?? product.id));
  if (!agg) return null;
  const factor = packFactor(product, per);
  const priceCents = Math.max(1, Math.round(agg.medianCents * factor));
  const price: Price = {
    productId: product.id,
    storeId,
    priceCents,
    updatedAt: `${agg.to}T12:00:00.000Z`,
    source: 'open_prices',
    observationCount: agg.count,
    observedFrom: agg.from,
  };
  const promoFrom = addDays(window.to, -PROMO_VALIDITY_DAYS);
  const latestPromo = usable
    .filter((r) => r.kind === 'observation' && r.promoMilli !== undefined && r.observedOn >= promoFrom)
    .sort((
      a,
      b,
    ) => (a.observedOn === b.observedOn
      ? (b.openPricesId ?? 0) - (a.openPricesId ?? 0)
      : a.observedOn < b.observedOn
      ? 1
      : -1)
    )[0];
  if (latestPromo?.promoMilli !== undefined) {
    const promoCents = Math.round((latestPromo.promoMilli / 10) * factor);
    if (promoCents > 0 && promoCents < priceCents) {
      price.promoPriceCents = promoCents;
      price.promoLabel = 'Promo relevée';
      price.promoUntil = addDays(latestPromo.observedOn, PROMO_VALIDITY_DAYS);
    }
  }
  return price;
}

const REAL_SOURCES = new Set<Price['source']>(['open_prices', 'partner', 'collect']);

/**
 * Faut-il écrire ce prix relevé à la place du prix courant ?
 * - aucun prix, prix fictif ou ESTIMATION : toujours (un relevé réel remplace
 *   toujours une estimation) ;
 * - prix réel : seulement si le nouveau repose sur un relevé au moins aussi récent.
 */
export function shouldReplace(current: Price | undefined, next: Price): boolean {
  if (!current) return true;
  if (!REAL_SOURCES.has(current.source)) return true;
  return next.updatedAt.slice(0, 10) >= current.updatedAt.slice(0, 10);
}

/** Même prix (valeur, promo, provenance) : inutile de réécrire la ligne. */
export function samePrice(a: Price, b: Price): boolean {
  return a.priceCents === b.priceCents &&
    (a.promoPriceCents ?? null) === (b.promoPriceCents ?? null) &&
    (a.promoUntil ?? null) === (b.promoUntil ?? null) &&
    a.source === b.source &&
    (a.observationCount ?? null) === (b.observationCount ?? null) &&
    (a.observedFrom ?? null) === (b.observedFrom ?? null) &&
    a.updatedAt.slice(0, 10) === b.updatedAt.slice(0, 10);
}

/** Magasins actifs d'une enseigne (un « magasin » national par enseigne : id === chain). */
export function storesOfChain(stores: readonly Store[], chain: StoreChain): Store[] {
  return stores.filter((s) => s.chain === chain);
}

/**
 * Client et normalisation Open Prices (Open Food Facts) —
 * https://prices.openfoodfacts.org/api/v1/prices
 *
 * Données ouvertes (ODbL) de prix relevés par la communauté (tickets,
 * étiquettes). Chaque relevé est rattaché à un point de vente OpenStreetMap.
 *
 * Normalisation (fonctions PURES, testées) :
 *  - EUR uniquement, prix > 0 ;
 *  - `price_per` = KILOGRAM / LITER → converti en prix du CONDITIONNEMENT du
 *    produit Cabas (pack_size g / ml) ; UNIT (ou absent) → prix unitaire ;
 *  - promotion : `price_is_discounted` + `price_without_discount` → prix
 *    normal + prix promo ;
 *  - magasin : identifiant OSM connu (stores.osm_location_ids) en priorité,
 *    sinon enseigne déduite de `osm_brand` / `osm_name` → magasins de cette
 *    enseigne (approximation « prix national de l'enseigne ») ;
 *  - une MDD n'est rattachée qu'à son enseigne.
 */
import type { Product, Store, StoreChain } from '../_shared/core/index.ts';
import { foldText } from '../_shared/core/index.ts';

export const OPEN_PRICES_URL = 'https://prices.openfoodfacts.org/api/v1/prices';

/** Relevé Open Prices (champs utilisés ; tout le reste est ignoré). */
export interface OpenPriceItem {
  id?: number;
  product_code?: string | null;
  price?: number | string | null;
  currency?: string | null;
  price_per?: string | null;
  price_is_discounted?: boolean | null;
  price_without_discount?: number | string | null;
  date?: string | null;
  location_osm_id?: number | null;
  location?: {
    osm_id?: number | null;
    osm_brand?: string | null;
    osm_name?: string | null;
    osm_address_city?: string | null;
  } | null;
}

export class OpenPricesHttpError extends Error {
  constructor(readonly status: number, readonly retryAfterMs: number | null) {
    super(`Open Prices HTTP ${status}`);
    this.name = 'OpenPricesHttpError';
  }
}

export interface FetchPricesOptions {
  fetch: typeof fetch;
  /** Relevés à partir de cette date (YYYY-MM-DD). */
  since?: string;
  size?: number;
  signal?: AbortSignal;
  userAgent?: string;
}

/** Relevés récents d'un code-barres (une page, du plus récent au plus ancien). */
export async function fetchOpenPrices(ean: string, opts: FetchPricesOptions): Promise<OpenPriceItem[]> {
  const params = new URLSearchParams({ product_code: ean, order_by: '-date', size: String(opts.size ?? 50) });
  if (opts.since) params.set('date__gte', opts.since);
  const res = await opts.fetch(`${OPEN_PRICES_URL}?${params}`, {
    headers: { Accept: 'application/json', 'User-Agent': opts.userAgent ?? 'Cabas/1.0 (comparateur de prix)' },
    signal: opts.signal,
  });
  if (!res.ok) {
    await res.body?.cancel();
    const retry = res.headers.get('retry-after');
    const retryAfterMs = retry && Number.isFinite(Number(retry)) ? Number(retry) * 1000 : null;
    throw new OpenPricesHttpError(res.status, retryAfterMs);
  }
  const body = await res.json().catch(() => null);
  const items = body && typeof body === 'object' ? (body as { items?: unknown }).items : null;
  return Array.isArray(items) ? (items.filter((i) => i && typeof i === 'object') as OpenPriceItem[]) : [];
}

// ─── Normalisation ───────────────────────────────────────────────────────────

const CHAIN_PATTERNS: [RegExp, StoreChain][] = [
  [/\bleclerc\b/, 'leclerc'],
  [/\bcarrefour\b/, 'carrefour'],
  [/\bauchan\b/, 'auchan'],
  [/\bintermarche\b/, 'intermarche'],
  [/\blidl\b/, 'lidl'],
  [/\bmonoprix\b|\bmonop\b/, 'monoprix'],
];

/** Enseigne déduite du nom / de la marque OSM du point de vente. */
export function detectChain(location: OpenPriceItem['location']): StoreChain | null {
  if (!location) return null;
  // La marque OSM (`brand`) fait foi ; le nom du point de vente n'est qu'un repli.
  for (const field of [location.osm_brand, location.osm_name]) {
    const text = ` ${foldText(field ?? '').replace(/[^a-z0-9]+/g, ' ')} `;
    for (const [re, chain] of CHAIN_PATTERNS) if (re.test(text)) return chain;
  }
  return null;
}

/** Store Cabas enrichi des points de vente OSM rattachés. */
export interface CollectStore extends Store {
  osmLocationIds: number[];
}

/** Magasins Cabas concernés par un relevé. */
export function storesForObservation(item: OpenPriceItem, stores: readonly CollectStore[]): CollectStore[] {
  const osmId = Number(item.location_osm_id ?? item.location?.osm_id ?? NaN);
  if (Number.isFinite(osmId)) {
    const exact = stores.filter((s) => s.osmLocationIds.includes(osmId));
    if (exact.length > 0) return exact;
  }
  const chain = detectChain(item.location);
  if (!chain) return [];
  // Enseigne : magasins sans point OSM explicite (sinon on préfère les relevés exacts).
  return stores.filter((s) => s.chain === chain && s.osmLocationIds.length === 0);
}

const toNum = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN);

export type RejectReason = 'currency' | 'invalid_price' | 'unit_mismatch' | 'no_date' | 'too_old' | 'implausible';

export interface NormalizedObservation {
  priceCents: number;
  promoPriceCents?: number;
  /** Date du relevé (ISO, midi UTC pour éviter les décalages de fuseau). */
  observedAt: string;
}

/**
 * Prix du conditionnement du produit Cabas, en centimes, ou motif de rejet.
 * `maxAgeDays` : relevés plus anciens ignorés.
 */
export function normalizeObservation(
  item: OpenPriceItem,
  product: Product,
  now: Date,
  maxAgeDays = 60,
): NormalizedObservation | { rejected: RejectReason } {
  if ((item.currency ?? 'EUR').toUpperCase() !== 'EUR') return { rejected: 'currency' };
  const price = toNum(item.price);
  if (!Number.isFinite(price) || price <= 0) return { rejected: 'invalid_price' };
  const date = typeof item.date === 'string' ? item.date.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { rejected: 'no_date' };
  const observed = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(observed)) return { rejected: 'no_date' };
  if (now.getTime() - observed > maxAgeDays * 86_400_000) return { rejected: 'too_old' };

  // Prix au kilo / litre → prix du conditionnement.
  const per = (item.price_per ?? 'UNIT').toUpperCase();
  let factor = 1;
  if (per === 'KILOGRAM') {
    if (product.packUnit !== 'g') return { rejected: 'unit_mismatch' };
    factor = product.packSize / 1000;
  } else if (per === 'LITER') {
    if (product.packUnit !== 'ml') return { rejected: 'unit_mismatch' };
    factor = product.packSize / 1000;
  }
  const paid = Math.round(price * factor * 100);
  let regular = paid;
  let promo: number | undefined;
  const without = toNum(item.price_without_discount);
  if (item.price_is_discounted && Number.isFinite(without) && without > price) {
    regular = Math.round(without * factor * 100);
    promo = paid;
  }
  // Garde-fou contre les saisies aberrantes (centimes / euros inversés…).
  if (regular < 5 || regular > 50_000) return { rejected: 'implausible' };
  const out: NormalizedObservation = { priceCents: regular, observedAt: new Date(observed).toISOString() };
  if (promo !== undefined && promo > 0 && promo < regular) out.promoPriceCents = promo;
  return out;
}

export interface StoreObservation extends NormalizedObservation {
  storeId: string;
  /** Id du relevé Open Prices (traçabilité). */
  sourceId?: number;
}

/**
 * Dernier relevé valide par magasin pour un produit. Les MDD ne sont
 * rattachées qu'aux magasins de leur enseigne.
 */
export function latestObservationsByStore(
  items: readonly OpenPriceItem[],
  product: Product,
  stores: readonly CollectStore[],
  now: Date,
  maxAgeDays = 60,
): { observations: StoreObservation[]; rejected: number; unmatched: number } {
  const best = new Map<string, StoreObservation>();
  let rejected = 0;
  let unmatched = 0;
  for (const item of items) {
    if (item.product_code && item.product_code !== product.ean) {
      rejected++;
      continue;
    }
    const norm = normalizeObservation(item, product, now, maxAgeDays);
    if ('rejected' in norm) {
      rejected++;
      continue;
    }
    let targets = storesForObservation(item, stores);
    if (product.isStoreBrand && product.storeChain) targets = targets.filter((s) => s.chain === product.storeChain);
    if (targets.length === 0) {
      unmatched++;
      continue;
    }
    for (const s of targets) {
      const prev = best.get(s.id);
      const candidate: StoreObservation = { ...norm, storeId: s.id, sourceId: item.id };
      // Le plus récent gagne ; à date égale, l'id de relevé le plus grand (le plus récent saisi).
      if (
        !prev || candidate.observedAt > prev.observedAt ||
        (candidate.observedAt === prev.observedAt && (candidate.sourceId ?? 0) > (prev.sourceId ?? 0))
      ) {
        best.set(s.id, candidate);
      }
    }
  }
  return { observations: Array.from(best.values()), rejected, unmatched };
}

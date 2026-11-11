/**
 * Implémentation Supabase (client SERVICE — tâche système) du
 * PriceCollectionRepository. Tables système : open_prices_locations,
 * price_observations, price_collection_state (service_role uniquement).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Allergen, Price, StoreChain } from '../_shared/core/index.ts';
import {
  effectiveEntitlement,
  isoTimestamp,
  num,
  priceToRow,
  type Row,
  rowToCatalogMeta,
  rowToPrice,
  rowToProduct,
  rowToStore,
  rowToSubscription,
} from '../_shared/mappers.ts';
import { fetchAll, unwrap } from '../_shared/supabaseClient.ts';
import type { CollectStats, NotificationInsert, PriceCollectionRepository, PriceWatchRow } from './handler.ts';
import type { CollectLocation, StoredObservation } from './openPrices.ts';

const CHUNK = 500;
function chunks<T>(xs: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

const optText = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const optInt = (v: unknown): number | undefined => {
  const n = num(v, NaN);
  return Number.isFinite(n) ? n : undefined;
};

export function locationToRow(l: CollectLocation, at: string): Row {
  return {
    id: l.id,
    osm_id: l.osmId,
    osm_type: l.osmType,
    chain: l.chain,
    proximity: l.proximity,
    osm_name: l.osmName,
    osm_brand: l.osmBrand,
    osm_tag_value: l.osmTagValue,
    postcode: l.postcode,
    city: l.city,
    refreshed_at: at,
  };
}

export function rowToLocation(r: Row): CollectLocation {
  return {
    id: num(r.id),
    osmId: optInt(r.osm_id) ?? null,
    osmType: optText(r.osm_type),
    chain: String(r.chain) as StoreChain,
    proximity: r.proximity === true,
    osmName: optText(r.osm_name),
    osmBrand: optText(r.osm_brand),
    osmTagValue: optText(r.osm_tag_value),
    postcode: optText(r.postcode),
    city: optText(r.city),
  };
}

/** Curseurs par lot (jsonb) → ISO ; entrées illisibles ignorées. */
export function rowToBatchCursors(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [key, value] of Object.entries(v as Record<string, unknown>)) {
    if (typeof value === 'string' && Number.isFinite(Date.parse(value))) out[key] = isoTimestamp(value);
  }
  return out;
}

export function observationToRow(o: StoredObservation): Row {
  return {
    product_id: o.productId,
    chain: o.chain,
    kind: o.kind,
    open_prices_id: o.openPricesId ?? null,
    location_id: o.locationId ?? null,
    weight: o.weight,
    regular_milli: o.regularMilli,
    promo_milli: o.promoMilli ?? null,
    price_per: o.pricePer,
    category_tag: o.categoryTag ?? null,
    proximity: o.proximity,
    observed_on: o.observedOn,
    observed_from: o.observedFrom ?? null,
    source_created_at: o.sourceCreatedAt ?? null,
  };
}

export function rowToObservation(r: Row): StoredObservation {
  const o: StoredObservation = {
    productId: String(r.product_id),
    chain: String(r.chain) as StoreChain,
    kind: r.kind === 'snapshot' ? 'snapshot' : 'observation',
    weight: Math.max(1, num(r.weight, 1)),
    regularMilli: num(r.regular_milli),
    pricePer: r.price_per === 'KILOGRAM' || r.price_per === 'UNIT' ? r.price_per : null,
    proximity: r.proximity === true,
    observedOn: String(r.observed_on).slice(0, 10),
  };
  const id = optInt(r.open_prices_id);
  if (id !== undefined) o.openPricesId = id;
  const loc = optInt(r.location_id);
  if (loc !== undefined) o.locationId = loc;
  const promo = optInt(r.promo_milli);
  if (promo !== undefined) o.promoMilli = promo;
  const from = optText(r.observed_from);
  if (from) o.observedFrom = from.slice(0, 10);
  const tag = optText(r.category_tag);
  if (tag) o.categoryTag = tag;
  const created = optText(r.source_created_at);
  if (created) o.sourceCreatedAt = isoTimestamp(created);
  return o;
}

export function createPriceCollectionRepository(client: SupabaseClient, now: () => Date): PriceCollectionRepository {
  return {
    async loadState() {
      const row = unwrap<Row | null>(
        'price_collection_state',
        await client.from('price_collection_state').select('*').eq('id', true).maybeSingle(),
      );
      return {
        createdCursor: row?.created_cursor ? isoTimestamp(row.created_cursor) : null,
        batchCursors: rowToBatchCursors(row?.batch_cursors),
        locationsRefreshedAt: row?.locations_refreshed_at ? isoTimestamp(row.locations_refreshed_at) : null,
      };
    },
    async saveState(
      state: {
        createdCursor: string | null;
        batchCursors: Record<string, string>;
        locationsRefreshedAt: string | null;
        lastRunAt: string;
        lastStats: CollectStats;
      },
    ) {
      unwrap(
        'save state',
        await client.from('price_collection_state').upsert(
          {
            id: true,
            created_cursor: state.createdCursor,
            batch_cursors: state.batchCursors,
            locations_refreshed_at: state.locationsRefreshedAt,
            last_run_at: state.lastRunAt,
            last_stats: state.lastStats,
          },
          { onConflict: 'id' },
        ),
      );
    },
    async loadSnapshotAt() {
      const row = unwrap<Row | null>(
        'catalog_meta',
        await client.from('catalog_meta').select('meta').eq('id', true).maybeSingle(),
      );
      // Borne exacte de l'instantané (juste après le dernier relevé de l'export), sinon sa date.
      const meta = rowToCatalogMeta(row);
      if (meta?.lastCreatedAt) return new Date(Math.floor(Date.parse(meta.lastCreatedAt)) + 1).toISOString();
      return meta?.snapshotAt ?? null;
    },
    async loadLocations() {
      const rows = await fetchAll<Row>(
        'open_prices_locations',
        (from, to) => client.from('open_prices_locations').select('*').order('id').range(from, to),
      );
      return rows.map(rowToLocation);
    },
    async replaceLocations(locations, at) {
      for (const batch of chunks(locations)) {
        unwrap(
          'upsert locations',
          await client.from('open_prices_locations').upsert(batch.map((l) => locationToRow(l, at)), {
            onConflict: 'id',
          }),
        );
      }
      // Lieux disparus de l'export (fermés, changés d'enseigne) : retirés.
      unwrap('prune locations', await client.from('open_prices_locations').delete().lt('refreshed_at', at));
    },
    async loadProducts() {
      const rows = await fetchAll<Row>(
        'products',
        (from, to) => client.from('products').select('*').order('id').range(from, to),
      );
      return rows.map(rowToProduct);
    },
    async loadStores() {
      const rows = unwrap<Row[]>('stores', await client.from('stores').select('*').eq('is_active', true).order('id')) ??
        [];
      return rows.map(rowToStore);
    },
    async insertObservations(rows) {
      let inserted = 0;
      for (const batch of chunks(rows)) {
        const res = unwrap<Row[]>(
          'insert observations',
          await client
            .from('price_observations')
            .upsert(batch.map(observationToRow), { onConflict: 'open_prices_id,product_id', ignoreDuplicates: true })
            .select('id'),
        );
        inserted += res?.length ?? 0;
      }
      return inserted;
    },
    async loadObservations(productIds, fromDay) {
      const out: StoredObservation[] = [];
      for (const ids of chunks(productIds, 150)) {
        const rows = await fetchAll<Row>(
          'price_observations',
          (from, to) =>
            client.from('price_observations').select('*').in('product_id', ids).gte('observed_on', fromDay).order('id')
              .range(from, to),
        );
        out.push(...rows.map(rowToObservation));
      }
      return out;
    },
    async loadCurrentPrices(productIds) {
      const out: Price[] = [];
      for (const ids of chunks(productIds)) {
        const rows = await fetchAll<Row>(
          'prices',
          (from, to) => client.from('prices').select('*').in('product_id', ids).range(from, to),
        );
        out.push(...rows.map(rowToPrice));
      }
      return out;
    },
    async upsertPrices(prices) {
      for (const batch of chunks(prices)) {
        unwrap(
          'upsert prices',
          await client.from('prices').upsert(batch.map(priceToRow), { onConflict: 'product_id,store_id' }),
        );
      }
    },
    async loadPriceWatches(productIds): Promise<PriceWatchRow[]> {
      const watches: Row[] = [];
      for (const ids of chunks(productIds)) {
        watches.push(
          ...await fetchAll<Row>(
            'price_watches',
            (from, to) =>
              client.from('price_watches').select('user_id, product_id, store_id, reference_cents').in(
                'product_id',
                ids,
              ).range(from, to),
          ),
        );
      }
      const userIds = Array.from(new Set(watches.map((w) => String(w.user_id))));
      if (userIds.length === 0) return [];
      // Filtre : préférence « baisses de prix » ET Premium effectif (alertes = fonctionnalité Premium).
      const eligible = new Set<string>();
      for (const ids of chunks(userIds)) {
        const [prefs, subs] = await Promise.all([
          client.from('notification_preferences').select('user_id, price_drops').in('user_id', ids),
          client.from('subscriptions').select('*').in('user_id', ids),
        ]);
        const optIn = new Set(
          (unwrap<Row[]>('prefs', prefs) ?? []).filter((p) => p.price_drops === true).map((p) => String(p.user_id)),
        );
        for (const s of unwrap<Row[]>('subscriptions', subs) ?? []) {
          const uid = String(s.user_id);
          if (optIn.has(uid) && effectiveEntitlement(rowToSubscription(s), now()) === 'premium') eligible.add(uid);
        }
      }
      // Allergènes déclarés (donnée de santé, lue ici seulement pour NE PAS alerter
      // sur un produit qui en contient). Profil illisible → null : aucune alerte.
      const allergensByUser = new Map<string, Allergen[]>();
      for (const ids of chunks([...eligible])) {
        const profiles = unwrap<Row[]>(
          'profiles',
          await client.from('profiles').select('id, allergens').in('id', ids),
        ) ?? [];
        for (const p of profiles) {
          allergensByUser.set(String(p.id), Array.isArray(p.allergens) ? (p.allergens as Allergen[]) : []);
        }
      }
      return watches
        .filter((w) => eligible.has(String(w.user_id)))
        .map((w) => ({
          userId: String(w.user_id),
          productId: String(w.product_id),
          storeId: String(w.store_id),
          referenceCents: num(w.reference_cents),
          allergens: allergensByUser.get(String(w.user_id)) ?? null,
        }));
    },
    async enqueueNotifications(rows: NotificationInsert[]) {
      let inserted = 0;
      for (const batch of chunks(rows)) {
        const res = unwrap<Row[]>(
          'enqueue',
          await client
            .from('notification_queue')
            .upsert(
              batch.map((n) => ({
                user_id: n.userId,
                kind: n.kind,
                title: n.title,
                body: n.body,
                data: n.data,
                dedupe_key: n.dedupeKey,
              })),
              { onConflict: 'dedupe_key', ignoreDuplicates: true },
            )
            .select('id'),
        );
        inserted += res?.length ?? 0;
      }
      return inserted;
    },
  };
}

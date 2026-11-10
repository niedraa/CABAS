/**
 * Implémentation Supabase (client SERVICE — tâche système) du
 * PriceCollectionRepository.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Price } from '../_shared/core/index.ts';
import { effectiveEntitlement, num, priceToRow, type Row, rowToPrice, rowToProduct, rowToStore, rowToSubscription } from '../_shared/mappers.ts';
import { fetchAll, unwrap } from '../_shared/supabaseClient.ts';
import type { NotificationInsert, PriceCollectionRepository, PriceWatchRow } from './handler.ts';
import type { CollectStore } from './openPrices.ts';

const CHUNK = 500;
function chunks<T>(xs: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

export function createPriceCollectionRepository(client: SupabaseClient, now: () => Date): PriceCollectionRepository {
  return {
    async listProductsToCheck(limit, productIds) {
      let q = client.from('products').select('*').order('last_price_check_at', { ascending: true, nullsFirst: true }).limit(limit);
      if (productIds && productIds.length > 0) q = q.in('id', productIds);
      return (unwrap<Row[]>('products', await q) ?? []).map(rowToProduct);
    },
    async loadStores(): Promise<CollectStore[]> {
      const rows = unwrap<Row[]>('stores', await client.from('stores').select('*').eq('is_active', true)) ?? [];
      return rows.map((r) => ({
        ...rowToStore(r),
        osmLocationIds: Array.isArray(r.osm_location_ids) ? (r.osm_location_ids as unknown[]).map((x) => num(x)) : [],
      }));
    },
    async loadCurrentPrices(productIds) {
      const out: Price[] = [];
      for (const ids of chunks(productIds)) {
        const rows = await fetchAll<Row>('prices', (from, to) => client.from('prices').select('*').in('product_id', ids).range(from, to));
        out.push(...rows.map(rowToPrice));
      }
      return out;
    },
    async upsertPrices(prices) {
      for (const batch of chunks(prices)) {
        unwrap('upsert prices', await client.from('prices').upsert(batch.map(priceToRow), { onConflict: 'product_id,store_id' }));
      }
    },
    async markChecked(productIds, at) {
      for (const ids of chunks(productIds)) {
        unwrap('mark checked', await client.from('products').update({ last_price_check_at: at }).in('id', ids));
      }
    },
    async loadPriceWatches(productIds): Promise<PriceWatchRow[]> {
      const watches: Row[] = [];
      for (const ids of chunks(productIds)) {
        watches.push(
          ...await fetchAll<Row>('price_watches', (from, to) =>
            client.from('price_watches').select('user_id, product_id, store_id, reference_cents').in('product_id', ids).range(from, to)),
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
        const optIn = new Set((unwrap<Row[]>('prefs', prefs) ?? []).filter((p) => p.price_drops === true).map((p) => String(p.user_id)));
        for (const s of unwrap<Row[]>('subscriptions', subs) ?? []) {
          const uid = String(s.user_id);
          if (optIn.has(uid) && effectiveEntitlement(rowToSubscription(s), now()) === 'premium') eligible.add(uid);
        }
      }
      return watches
        .filter((w) => eligible.has(String(w.user_id)))
        .map((w) => ({
          userId: String(w.user_id),
          productId: String(w.product_id),
          storeId: String(w.store_id),
          referenceCents: num(w.reference_cents),
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
              batch.map((n) => ({ user_id: n.userId, kind: n.kind, title: n.title, body: n.body, data: n.data, dedupe_key: n.dedupeKey })),
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

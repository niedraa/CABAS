/**
 * Implémentation Supabase du BasketRepository (client UTILISATEUR → RLS).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BasketPlan } from '../_shared/core/index.ts';
import { loadIngredientsByIds, loadOffers, loadStores } from '../_shared/catalog.ts';
import { effectiveEntitlement, type Row, rowToSubscription } from '../_shared/mappers.ts';
import { unwrap } from '../_shared/supabaseClient.ts';
import type { BasketRepository } from './handler.ts';

export function createBasketRepository(client: SupabaseClient, userId: string, now: () => Date): BasketRepository {
  return {
    async loadEntitlement() {
      const row = unwrap<Row | null>(
        'subscription',
        await client.from('subscriptions').select('*').eq('user_id', userId).maybeSingle(),
      );
      return effectiveEntitlement(rowToSubscription(row), now());
    },
    async loadPreferredStoreIds() {
      const row = unwrap<Row | null>(
        'profile',
        await client.from('profiles').select('preferred_store_ids').eq('id', userId).maybeSingle(),
      );
      return Array.isArray(row?.preferred_store_ids) ? (row.preferred_store_ids as string[]) : [];
    },
    loadStores: () => loadStores(client),
    loadOffers: (ids) => loadOffers(client, ids),
    loadIngredients: (ids) => loadIngredientsByIds(client, ids),
    async saveBasketPlan(plan: BasketPlan, listId?: string) {
      const row = unwrap<Row>(
        'basket_plans',
        await client
          .from('basket_plans')
          .insert({
            user_id: userId,
            list_id: listId ?? null,
            mode: plan.mode,
            total_cents: plan.totalCents,
            savings_cents: plan.savingsCents,
            snapshot: plan,
            computed_at: plan.computedAt,
          })
          .select('id')
          .single(),
      );
      return String(row.id);
    },
  };
}

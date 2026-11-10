/**
 * Implémentation Supabase (client SERVICE) du SubscriptionRepository.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Row } from '../_shared/mappers.ts';
import { DbError, unwrap } from '../_shared/supabaseClient.ts';
import type { RecordStatus, SubscriptionRepository } from './handler.ts';

export function createSubscriptionRepository(client: SupabaseClient): SubscriptionRepository {
  return {
    async recordEvent(e): Promise<RecordStatus> {
      const inserted = unwrap<Row[]>(
        'revenuecat_events insert',
        await client
          .from('revenuecat_events')
          .upsert(
            {
              id: e.id,
              type: e.type,
              app_user_id: e.appUserId,
              user_id: e.userId,
              event_at: e.eventAt,
              environment: e.environment,
              payload: e.payload,
            },
            { onConflict: 'id', ignoreDuplicates: true },
          )
          .select('id'),
      );
      if (inserted && inserted.length > 0) return 'new';
      const existing = unwrap<Row | null>(
        'revenuecat_events select',
        await client.from('revenuecat_events').select('processed_at').eq('id', e.id).maybeSingle(),
      );
      return existing?.processed_at ? 'processed' : 'pending';
    },
    async getSubscription(userId) {
      const row = unwrap<Row | null>(
        'subscription',
        await client.from('subscriptions').select('updated_from_event_at, billing_issue_at, will_renew').eq(
          'user_id',
          userId,
        ).maybeSingle(),
      );
      if (!row) return null;
      return {
        updatedFromEventAt: typeof row.updated_from_event_at === 'string' ? row.updated_from_event_at : null,
        billingIssueAt: typeof row.billing_issue_at === 'string' ? row.billing_issue_at : null,
        willRenew: row.will_renew === true,
      };
    },
    async upsertSubscription(userId, patch) {
      const res = await client.from('subscriptions').upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' });
      // 23503 : violation de clé étrangère → l'utilisateur n'existe pas (compte supprimé).
      if (res.error?.code === '23503') return 'user_not_found';
      if (res.error) throw new DbError('subscriptions upsert', res.error.message, res.error.code);
      return 'ok';
    },
    async markEventProcessed(id, outcome) {
      unwrap(
        'revenuecat_events update',
        await client.from('revenuecat_events').update({
          processed_at: new Date().toISOString(),
          outcome: outcome.slice(0, 500),
        }).eq('id', id),
      );
    },
  };
}

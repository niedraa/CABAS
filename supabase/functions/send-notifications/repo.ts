/**
 * Implémentation Supabase (client SERVICE — tâche système) du NotificationRepository.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { num, type Row } from '../_shared/mappers.ts';
import { fetchAll, unwrap } from '../_shared/supabaseClient.ts';
import type { NotificationKind, NotificationRepository, QueuedNotification, ReminderPreference } from './handler.ts';

const CHUNK = 300;
function chunks<T>(xs: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

function rowToPref(r: Row): ReminderPreference {
  return {
    userId: String(r.user_id),
    planningReminder: r.planning_reminder === true,
    planningReminderWeekday: num(r.planning_reminder_weekday, 6),
    planningReminderHour: num(r.planning_reminder_hour, 18),
    orderReminder: r.order_reminder === true,
    priceDrops: r.price_drops === true,
    timezone: typeof r.timezone === 'string' && r.timezone ? r.timezone : 'Europe/Paris',
  };
}

export function createNotificationRepository(client: SupabaseClient): NotificationRepository {
  return {
    async listReminderPreferences() {
      const prefs = await fetchAll<Row>('notification_preferences', (from, to) =>
        client
          .from('notification_preferences')
          .select('*')
          .or('planning_reminder.eq.true,order_reminder.eq.true')
          .order('user_id')
          .range(from, to));
      if (prefs.length === 0) return [];
      // Seuls les utilisateurs joignables (au moins un jeton push).
      const withToken = new Set<string>();
      for (const ids of chunks(prefs.map((p) => String(p.user_id)))) {
        const rows = unwrap<Row[]>('push_tokens', await client.from('push_tokens').select('user_id').in('user_id', ids)) ?? [];
        for (const r of rows) withToken.add(String(r.user_id));
      }
      return prefs.filter((p) => withToken.has(String(p.user_id))).map(rowToPref);
    },
    async usersWithPlanForWeek(userIds, weekStart) {
      const out = new Set<string>();
      for (const ids of chunks(userIds)) {
        const rows = unwrap<Row[]>(
          'meal_plans',
          await client.from('meal_plans').select('user_id').eq('week_start', weekStart).in('user_id', ids),
        ) ?? [];
        for (const r of rows) out.add(String(r.user_id));
      }
      return out;
    },
    async usersWithUnorderedPlan(userIds, weekStart) {
      const out = new Set<string>();
      for (const ids of chunks(userIds)) {
        const plans = unwrap<Row[]>(
          'meal_plans',
          await client.from('meal_plans').select('user_id, id, generated_at').eq('week_start', weekStart).in('user_id', ids),
        ) ?? [];
        if (plans.length === 0) continue;
        const planUsers = plans.map((p) => String(p.user_id));
        const [lists, orders] = await Promise.all([
          client.from('shopping_lists').select('user_id, meal_plan_id').in('user_id', planUsers),
          client.from('order_handoffs').select('user_id, created_at').in('user_id', planUsers),
        ]);
        const listKeys = new Set((unwrap<Row[]>('shopping_lists', lists) ?? []).map((l) => `${l.user_id}|${l.meal_plan_id}`));
        const orderRows = unwrap<Row[]>('order_handoffs', orders) ?? [];
        for (const p of plans) {
          const uid = String(p.user_id);
          if (!listKeys.has(`${uid}|${p.id}`)) continue;
          const since = Date.parse(String(p.generated_at));
          const ordered = orderRows.some((o) => String(o.user_id) === uid && Date.parse(String(o.created_at)) >= since);
          if (!ordered) out.add(uid);
        }
      }
      return out;
    },
    async enqueue(rows) {
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
    async listPending(limit, nowIso) {
      const rows = unwrap<Row[]>(
        'notification_queue',
        await client
          .from('notification_queue')
          .select('id, user_id, kind, title, body, data, attempts')
          .eq('status', 'pending')
          .lte('scheduled_for', nowIso)
          .order('scheduled_for')
          .limit(limit),
      ) ?? [];
      return rows.map((r): QueuedNotification => ({
        id: num(r.id),
        userId: String(r.user_id),
        kind: String(r.kind) as NotificationKind,
        title: String(r.title),
        body: String(r.body),
        data: r.data && typeof r.data === 'object' ? (r.data as Record<string, unknown>) : {},
        attempts: num(r.attempts),
      }));
    },
    async loadPreferences(userIds) {
      const map = new Map<string, ReminderPreference>();
      for (const ids of chunks(userIds)) {
        const rows = unwrap<Row[]>('prefs', await client.from('notification_preferences').select('*').in('user_id', ids)) ?? [];
        for (const r of rows) map.set(String(r.user_id), rowToPref(r));
      }
      return map;
    },
    async loadPushTokens(userIds) {
      const out: { userId: string; token: string }[] = [];
      for (const ids of chunks(userIds)) {
        const rows = unwrap<Row[]>('push_tokens', await client.from('push_tokens').select('user_id, token').in('user_id', ids)) ?? [];
        for (const r of rows) out.push({ userId: String(r.user_id), token: String(r.token) });
      }
      return out;
    },
    async markResults(results, nowIso) {
      // Une requête par statut final (les erreurs sont tronquées : pas de données personnelles).
      for (const r of results) {
        unwrap(
          'mark result',
          await client
            .from('notification_queue')
            .update({
              status: r.status,
              attempts: r.attempts,
              last_error: r.error ? r.error.slice(0, 200) : null,
              sent_at: r.status === 'sent' ? nowIso : null,
            })
            .eq('id', r.id),
        );
      }
    },
    async deleteTokens(tokens) {
      let n = 0;
      for (const batch of chunks(tokens)) {
        const rows = unwrap<Row[]>('delete tokens', await client.from('push_tokens').delete().in('token', batch).select('id')) ?? [];
        n += rows.length;
      }
      return n;
    },
  };
}

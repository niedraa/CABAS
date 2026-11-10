/**
 * send-notifications — rappels et alertes push (cron toutes les 15 min).
 *
 * Appel : pg_cron + pg_net, en-tête `x-cron-secret`. POST {}.
 *
 *  1. Rappel de planification : utilisateurs dont le jour / l'heure de rappel
 *     (notification_preferences, heure LOCALE de leur fuseau, Europe/Paris par
 *     défaut) correspondent à maintenant, et qui n'ont pas encore de planning
 *     pour la semaine visée → mis en file (dédupliqué par jour).
 *  2. Rappel de commande : le VENDREDI à `orderReminderHour` (10 h locale par
 *     défaut), utilisateurs dont le planning de la semaine suivante a une liste
 *     de courses mais aucune commande préparée depuis → mis en file.
 *  3. Vidage de la file (y compris les baisses de prix déposées par
 *     collect-prices) : envoi Expo Push par lots de 100, statut mis à jour,
 *     jetons `DeviceNotRegistered` supprimés, erreurs transitoires réessayées
 *     (5 tentatives max).
 */
import { formatWeekRange, startOfWeek } from '../_shared/core/index.ts';
import { verifySharedSecret } from '../_shared/auth.ts';
import { type ExpoMessage, type ExpoTicket, chunk, sendExpoBatch } from '../_shared/expoPush.ts';
import { json, requireMethod, withHandler } from '../_shared/http.ts';
import type { Logger } from '../_shared/logger.ts';
import { nextWeekStart, zonedParts } from '../_shared/time.ts';
import type { NotificationInsert } from '../_shared/notifications.ts';

export type { NotificationInsert };

export type NotificationKind = NotificationInsert['kind'];

export interface ReminderPreference {
  userId: string;
  planningReminder: boolean;
  /** 0 = lundi … 6 = dimanche. */
  planningReminderWeekday: number;
  planningReminderHour: number;
  orderReminder: boolean;
  priceDrops: boolean;
  timezone: string;
}

export interface QueuedNotification {
  id: number;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  data: Record<string, unknown>;
  attempts: number;
}

export interface NotificationResult {
  id: number;
  status: 'sent' | 'failed' | 'skipped' | 'pending';
  attempts: number;
  error?: string;
}

export interface NotificationRepository {
  /** Préférences des utilisateurs ayant au moins un rappel actif ET un jeton push. */
  listReminderPreferences(): Promise<ReminderPreference[]>;
  usersWithPlanForWeek(userIds: string[], weekStart: string): Promise<Set<string>>;
  /** Planning de la semaine + liste de courses, sans commande préparée depuis la génération. */
  usersWithUnorderedPlan(userIds: string[], weekStart: string): Promise<Set<string>>;
  enqueue(rows: NotificationInsert[]): Promise<number>;
  listPending(limit: number, nowIso: string): Promise<QueuedNotification[]>;
  loadPreferences(userIds: string[]): Promise<Map<string, ReminderPreference>>;
  loadPushTokens(userIds: string[]): Promise<{ userId: string; token: string }[]>;
  markResults(results: NotificationResult[], nowIso: string): Promise<void>;
  deleteTokens(tokens: string[]): Promise<number>;
}

export interface SendNotificationsDeps {
  repo: NotificationRepository;
  cronSecret: string;
  fetch: typeof fetch;
  logger: Logger;
  expoAccessToken?: string;
  now?: () => Date;
  /** Heure locale du rappel de commande du vendredi (défaut 10). */
  orderReminderHour?: number;
  maxAttempts?: number;
  batchLimit?: number;
}

/** Erreurs Expo transitoires (réessayées). */
const RETRYABLE = new Set(['MessageRateExceeded', 'InvalidResponse', 'HttpError']);
const FRIDAY = 4;

/** Semaine visée par le rappel de planification (lundi : la semaine en cours ; sinon la suivante). */
export function planningTargetWeek(localDate: string, localWeekday: number): string {
  return localWeekday === 0 ? startOfWeek(localDate) : nextWeekStart(localDate);
}

export function planningReminder(userId: string, weekStart: string, localDate: string): NotificationInsert {
  return {
    userId,
    kind: 'planning_reminder',
    title: 'Ta semaine t\'attend 🥕',
    body: `2 minutes pour planifier tes repas du ${formatWeekRange(weekStart)} : ta liste de courses suivra toute seule.`,
    data: { type: 'planning_reminder', weekStart, url: 'cabas:///' },
    dedupeKey: `planning:${userId}:${localDate}`,
  };
}

export function orderReminder(userId: string, weekStart: string): NotificationInsert {
  return {
    userId,
    kind: 'order_reminder',
    title: 'Ta liste est prête 🛒',
    body: 'Commande ton drive avant le week-end : on a déjà comparé les prix pour toi.',
    data: { type: 'order_reminder', weekStart, url: 'cabas:///panier' },
    dedupeKey: `order:${userId}:${weekStart}`,
  };
}

/** La notification est-elle toujours voulue par l'utilisateur (préférence modifiable après mise en file) ? */
function optedIn(kind: NotificationKind, pref: ReminderPreference | undefined): boolean {
  if (!pref) return true;
  if (kind === 'planning_reminder') return pref.planningReminder;
  if (kind === 'order_reminder') return pref.orderReminder;
  return pref.priceDrops;
}

export function createSendNotificationsHandler(deps: SendNotificationsDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date());
  const orderHour = deps.orderReminderHour ?? 10;
  const maxAttempts = deps.maxAttempts ?? 5;
  const batchLimit = deps.batchLimit ?? 1000;

  return withHandler(deps.logger, async (req, log) => {
    requireMethod(req, 'POST');
    verifySharedSecret(req, 'x-cron-secret', deps.cronSecret);
    await req.body?.cancel();
    const nowDate = now();
    const nowIso = nowDate.toISOString();
    const { repo } = deps;

    // ── 1 & 2. Rappels (mis en file, dédupliqués) ──
    const prefs = await repo.listReminderPreferences();
    const planningByWeek = new Map<string, { userId: string; localDate: string }[]>();
    const orderByWeek = new Map<string, string[]>();
    for (const p of prefs) {
      const local = zonedParts(nowDate, p.timezone || 'Europe/Paris');
      if (p.planningReminder && local.weekday === p.planningReminderWeekday && local.hour === p.planningReminderHour) {
        const week = planningTargetWeek(local.date, local.weekday);
        planningByWeek.set(week, [...(planningByWeek.get(week) ?? []), { userId: p.userId, localDate: local.date }]);
      }
      if (p.orderReminder && local.weekday === FRIDAY && local.hour === orderHour) {
        const week = nextWeekStart(local.date);
        orderByWeek.set(week, [...(orderByWeek.get(week) ?? []), p.userId]);
      }
    }
    const reminders: NotificationInsert[] = [];
    for (const [week, list] of planningByWeek) {
      const planned = await repo.usersWithPlanForWeek(list.map((x) => x.userId), week);
      for (const x of list) if (!planned.has(x.userId)) reminders.push(planningReminder(x.userId, week, x.localDate));
    }
    for (const [week, userIds] of orderByWeek) {
      const unordered = await repo.usersWithUnorderedPlan(userIds, week);
      for (const u of userIds) if (unordered.has(u)) reminders.push(orderReminder(u, week));
    }
    const queued = reminders.length > 0 ? await repo.enqueue(reminders) : 0;

    // ── 3. Vidage de la file ──
    const pending = await repo.listPending(batchLimit, nowIso);
    const userIds = Array.from(new Set(pending.map((n) => n.userId)));
    const [userPrefs, tokens] = userIds.length > 0
      ? await Promise.all([repo.loadPreferences(userIds), repo.loadPushTokens(userIds)])
      : [new Map<string, ReminderPreference>(), [] as { userId: string; token: string }[]];
    const tokensByUser = new Map<string, string[]>();
    for (const t of tokens) tokensByUser.set(t.userId, [...(tokensByUser.get(t.userId) ?? []), t.token]);

    const results = new Map<number, NotificationResult>();
    const outcome = new Map<number, { ok: number; errors: string[]; retryable: boolean }>();
    const outgoing: { notificationId: number; message: ExpoMessage }[] = [];
    for (const n of pending) {
      if (!optedIn(n.kind, userPrefs.get(n.userId))) {
        results.set(n.id, { id: n.id, status: 'skipped', attempts: n.attempts, error: 'opted_out' });
        continue;
      }
      const userTokens = tokensByUser.get(n.userId) ?? [];
      if (userTokens.length === 0) {
        results.set(n.id, { id: n.id, status: 'skipped', attempts: n.attempts, error: 'no_push_token' });
        continue;
      }
      outcome.set(n.id, { ok: 0, errors: [], retryable: false });
      for (const to of userTokens) {
        outgoing.push({
          notificationId: n.id,
          message: { to, title: n.title, body: n.body, data: { ...n.data, notificationId: n.id }, sound: 'default', channelId: 'default', priority: 'high' },
        });
      }
    }

    const deadTokens = new Set<string>();
    let batches = 0;
    for (const batch of chunk(outgoing)) {
      batches++;
      let tickets: ExpoTicket[];
      try {
        tickets = await sendExpoBatch(batch.map((b) => b.message), { fetch: deps.fetch, accessToken: deps.expoAccessToken });
      } catch (err) {
        log.warn('expo batch failed', { error: err instanceof Error ? err.message : String(err), size: batch.length });
        tickets = batch.map(() => ({ status: 'error', message: 'HTTP', details: { error: 'HttpError' } }));
      }
      tickets.forEach((ticket, i) => {
        const { notificationId, message } = batch[i];
        const o = outcome.get(notificationId)!;
        if (ticket.status === 'ok') {
          o.ok++;
          return;
        }
        const code = ticket.details?.error ?? 'Unknown';
        o.errors.push(code);
        if (code === 'DeviceNotRegistered') deadTokens.add(message.to);
        if (RETRYABLE.has(code)) o.retryable = true;
      });
    }

    for (const n of pending) {
      const o = outcome.get(n.id);
      if (!o) continue;
      const attempts = n.attempts + 1;
      if (o.ok > 0) results.set(n.id, { id: n.id, status: 'sent', attempts });
      else if (o.retryable && attempts < maxAttempts) {
        results.set(n.id, { id: n.id, status: 'pending', attempts, error: o.errors.join(',') });
      } else results.set(n.id, { id: n.id, status: 'failed', attempts, error: o.errors.join(',') || 'Unknown' });
    }

    const tokensRemoved = deadTokens.size > 0 ? await repo.deleteTokens(Array.from(deadTokens)) : 0;
    if (results.size > 0) await repo.markResults(Array.from(results.values()), nowIso);

    const count = (s: NotificationResult['status']) => Array.from(results.values()).filter((r) => r.status === s).length;
    const stats = {
      remindersQueued: queued,
      planningCandidates: Array.from(planningByWeek.values()).reduce((a, l) => a + l.length, 0),
      orderCandidates: Array.from(orderByWeek.values()).reduce((a, l) => a + l.length, 0),
      processed: pending.length,
      sent: count('sent'),
      failed: count('failed'),
      skipped: count('skipped'),
      retrying: count('pending'),
      messages: outgoing.length,
      batches,
      tokensRemoved,
    };
    log.info('send-notifications done', stats);
    return json({ stats });
  });
}

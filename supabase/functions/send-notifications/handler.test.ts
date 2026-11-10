import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { silentLogger } from '../_shared/logger.ts';
import type { NotificationInsert } from '../_shared/notifications.ts';
import { zonedParts } from '../_shared/time.ts';
import { EXPO_PUSH_URL } from '../_shared/expoPush.ts';
import {
  createSendNotificationsHandler,
  type NotificationRepository,
  type NotificationResult,
  planningTargetWeek,
  type QueuedNotification,
  type ReminderPreference,
} from './handler.ts';

const SECRET = 'cron-secret';
// Dimanche 15/11/2026, 18 h 05 à Paris (UTC+1).
const SUNDAY_18H_PARIS = new Date('2026-11-15T17:05:00.000Z');
// Vendredi 13/11/2026, 10 h 10 à Paris.
const FRIDAY_10H_PARIS = new Date('2026-11-13T09:10:00.000Z');

function pref(userId: string, over: Partial<ReminderPreference> = {}): ReminderPreference {
  return {
    userId,
    planningReminder: true,
    planningReminderWeekday: 6,
    planningReminderHour: 18,
    orderReminder: true,
    priceDrops: true,
    timezone: 'Europe/Paris',
    ...over,
  };
}

interface FakeDb extends NotificationRepository {
  queue: (QueuedNotification & { status: string; dedupeKey: string; error?: string })[];
  tokens: { userId: string; token: string }[];
  deleted: string[];
}

function fakeDb(opts: {
  prefs?: ReminderPreference[];
  tokens?: { userId: string; token: string }[];
  plans?: Record<string, string[]>; // weekStart → users with a plan
  unordered?: Record<string, string[]>; // weekStart → users with list but no order
  queue?: (Omit<QueuedNotification, 'id' | 'attempts'> & { attempts?: number })[];
} = {}): FakeDb {
  let nextId = 1;
  const db: FakeDb = {
    queue: [],
    tokens: [...(opts.tokens ?? [])],
    deleted: [],
    listReminderPreferences: () => {
      const reachable = new Set(db.tokens.map((t) => t.userId));
      return Promise.resolve((opts.prefs ?? []).filter((p) => reachable.has(p.userId)));
    },
    usersWithPlanForWeek: (ids, week) => Promise.resolve(new Set((opts.plans?.[week] ?? []).filter((u) => ids.includes(u)))),
    usersWithUnorderedPlan: (ids, week) => Promise.resolve(new Set((opts.unordered?.[week] ?? []).filter((u) => ids.includes(u)))),
    enqueue(rows: NotificationInsert[]) {
      let n = 0;
      for (const r of rows) {
        if (db.queue.some((q) => q.dedupeKey === r.dedupeKey)) continue;
        db.queue.push({ id: nextId++, userId: r.userId, kind: r.kind, title: r.title, body: r.body, data: r.data, attempts: 0, status: 'pending', dedupeKey: r.dedupeKey });
        n++;
      }
      return Promise.resolve(n);
    },
    listPending: (limit) => Promise.resolve(db.queue.filter((q) => q.status === 'pending').slice(0, limit).map((q) => ({ ...q }))),
    loadPreferences: (ids) => Promise.resolve(new Map((opts.prefs ?? []).filter((p) => ids.includes(p.userId)).map((p) => [p.userId, p]))),
    loadPushTokens: (ids) => Promise.resolve(db.tokens.filter((t) => ids.includes(t.userId))),
    markResults(results: NotificationResult[]) {
      for (const r of results) {
        const q = db.queue.find((x) => x.id === r.id)!;
        q.status = r.status;
        q.attempts = r.attempts;
        q.error = r.error;
      }
      return Promise.resolve();
    },
    deleteTokens(tokens) {
      const before = db.tokens.length;
      db.tokens = db.tokens.filter((t) => !tokens.includes(t.token));
      db.deleted.push(...tokens);
      return Promise.resolve(before - db.tokens.length);
    },
  };
  for (const q of opts.queue ?? []) {
    db.queue.push({ id: nextId++, attempts: 0, status: 'pending', dedupeKey: `seed:${nextId}`, ...q });
  }
  return db;
}

/** Faux serveur Expo : ticket selon le jeton (…dead… / …rate… / ok). */
function fakeExpo(opts: { httpStatus?: number } = {}) {
  const requests: { headers: Headers; messages: { to: string; title: string; data: Record<string, unknown> }[] }[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    assertEquals(String(input), EXPO_PUSH_URL);
    const messages = JSON.parse(String(init?.body));
    requests.push({ headers: new Headers(init?.headers), messages });
    if (opts.httpStatus) return new Response('down', { status: opts.httpStatus });
    const data = messages.map((m: { to: string }) =>
      m.to.includes('dead')
        ? { status: 'error', message: `"${m.to}" is not a registered push notification recipient`, details: { error: 'DeviceNotRegistered' } }
        : m.to.includes('rate')
        ? { status: 'error', message: 'rate', details: { error: 'MessageRateExceeded' } }
        : { status: 'ok', id: crypto.randomUUID() }
    );
    return new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetch: f, requests };
}

function handler(db: NotificationRepository, now: Date, f: typeof fetch, extra: { expoAccessToken?: string; maxAttempts?: number } = {}) {
  return createSendNotificationsHandler({ repo: db, cronSecret: SECRET, fetch: f, logger: silentLogger, now: () => now, ...extra });
}

async function run(h: (r: Request) => Promise<Response>, secret = SECRET) {
  const res = await h(new Request('http://localhost/send-notifications', { method: 'POST', headers: { 'x-cron-secret': secret }, body: '{}' }));
  return { status: res.status, data: await res.json() };
}

const tok = (userId: string, suffix = 'ok') => ({ userId, token: `ExponentPushToken[${userId}-${suffix}]` });

// ─── Utilitaires de temps ────────────────────────────────────────────────────

Deno.test('zonedParts : heure locale Paris / New York, fuseau invalide → Paris', () => {
  assertEquals(zonedParts(SUNDAY_18H_PARIS, 'Europe/Paris'), { date: '2026-11-15', weekday: 6, hour: 18, minute: 5 });
  assertEquals(zonedParts(SUNDAY_18H_PARIS, 'America/New_York').hour, 12);
  assertEquals(zonedParts(new Date('2026-07-01T16:00:00Z'), 'Europe/Paris').hour, 18, 'heure d\'été (UTC+2)');
  assertEquals(zonedParts(SUNDAY_18H_PARIS, 'Mars/Olympus'), zonedParts(SUNDAY_18H_PARIS, 'Europe/Paris'));
});

Deno.test('planningTargetWeek : lundi → semaine en cours, sinon la suivante', () => {
  assertEquals(planningTargetWeek('2026-11-15', 6), '2026-11-16');
  assertEquals(planningTargetWeek('2026-11-16', 0), '2026-11-16');
  assertEquals(planningTargetWeek('2026-11-19', 3), '2026-11-23');
});

// ─── Sécurité ────────────────────────────────────────────────────────────────

Deno.test('secret cron invalide → 401, rien n\'est envoyé', async () => {
  const expo = fakeExpo();
  const db = fakeDb({ queue: [{ userId: 'a', kind: 'price_drop', title: 't', body: 'b', data: {} }], tokens: [tok('a')] });
  const { status } = await run(handler(db, SUNDAY_18H_PARIS, expo.fetch), 'faux');
  assertEquals(status, 401);
  assertEquals(expo.requests.length, 0);
  assertEquals(db.queue[0].status, 'pending');
});

// ─── Rappels ─────────────────────────────────────────────────────────────────

Deno.test('rappel de planification : à l\'heure locale, sans planning existant, dédupliqué', async () => {
  const expo = fakeExpo();
  const db = fakeDb({
    prefs: [
      pref('alice'),
      pref('bob', { timezone: 'America/New_York' }), // 12 h à New York : pas encore
      pref('chloe'), // a déjà son planning
      pref('dan', { planningReminder: false }),
      pref('eve', { planningReminderHour: 9 }),
      pref('fred'), // pas de jeton push → jamais candidat
    ],
    tokens: [tok('alice'), tok('bob'), tok('chloe'), tok('dan'), tok('eve')],
    plans: { '2026-11-16': ['chloe'] },
  });
  const h = handler(db, SUNDAY_18H_PARIS, expo.fetch);
  const { status, data } = await run(h);
  assertEquals(status, 200);
  assertEquals(data.stats.remindersQueued, 1);
  assertEquals(data.stats.sent, 1);
  assertEquals(db.queue[0].userId, 'alice');
  assertEquals(db.queue[0].kind, 'planning_reminder');
  assertEquals(db.queue[0].data.weekStart, '2026-11-16');
  assertStringIncludes(expo.requests[0].messages[0].title, 'semaine');

  // Le cron repasse 15 min plus tard (même heure locale) : pas de doublon.
  const again = await run(handler(db, new Date(SUNDAY_18H_PARIS.getTime() + 15 * 60_000), expo.fetch));
  assertEquals(again.data.stats.remindersQueued, 0);
  assertEquals(db.queue.length, 1);
});

Deno.test('rappel de planification : fuseau de l\'utilisateur respecté (New York à 18 h locale)', async () => {
  const expo = fakeExpo();
  const db = fakeDb({ prefs: [pref('bob', { timezone: 'America/New_York' })], tokens: [tok('bob')] });
  const nyEvening = new Date('2026-11-15T23:05:00.000Z'); // 18 h 05 à New York (UTC−5)
  const { data } = await run(handler(db, nyEvening, expo.fetch));
  assertEquals(data.stats.remindersQueued, 1);
});

Deno.test('rappel de commande : vendredi 10 h, plannings avec liste non commandée uniquement', async () => {
  const expo = fakeExpo();
  const db = fakeDb({
    prefs: [pref('alice'), pref('bob'), pref('chloe', { orderReminder: false })],
    tokens: [tok('alice'), tok('bob'), tok('chloe')],
    unordered: { '2026-11-16': ['alice', 'chloe'] },
  });
  const { data } = await run(handler(db, FRIDAY_10H_PARIS, expo.fetch));
  assertEquals(data.stats.orderCandidates, 2);
  assertEquals(data.stats.remindersQueued, 1);
  assertEquals(db.queue[0].userId, 'alice');
  assertEquals(db.queue[0].kind, 'order_reminder');
  assertEquals(db.queue[0].dedupeKey, 'order:alice:2026-11-16');
});

// ─── Envoi ───────────────────────────────────────────────────────────────────

Deno.test('envoi : lots de 100 messages, jeton d\'accès Expo transmis', async () => {
  const expo = fakeExpo();
  const queue = Array.from({ length: 150 }, (_, i) => ({ userId: `u${i}`, kind: 'price_drop' as const, title: 'Baisse', body: 'b', data: { productId: 'p' } }));
  const db = fakeDb({ queue, tokens: queue.map((q) => tok(q.userId)) });
  const { data } = await run(handler(db, SUNDAY_18H_PARIS, expo.fetch, { expoAccessToken: 'expo-token' }));
  assertEquals(expo.requests.length, 2);
  assertEquals(expo.requests[0].messages.length, 100);
  assertEquals(expo.requests[1].messages.length, 50);
  assertEquals(expo.requests[0].headers.get('authorization'), 'Bearer expo-token');
  assertEquals(data.stats.sent, 150);
  assert(db.queue.every((q) => q.status === 'sent' && q.attempts === 1));
  assertEquals(expo.requests[0].messages[0].data.notificationId, db.queue[0].id);
});

Deno.test('DeviceNotRegistered : jeton supprimé ; notification envoyée si un autre appareil a reçu', async () => {
  const expo = fakeExpo();
  const db = fakeDb({
    queue: [
      { userId: 'alice', kind: 'price_drop', title: 't', body: 'b', data: {} },
      { userId: 'bob', kind: 'price_drop', title: 't', body: 'b', data: {} },
    ],
    tokens: [tok('alice', 'dead'), tok('alice', 'phone'), tok('bob', 'dead')],
  });
  const { data } = await run(handler(db, SUNDAY_18H_PARIS, expo.fetch));
  assertEquals(data.stats.tokensRemoved, 2);
  assertEquals(db.deleted.sort(), ['ExponentPushToken[alice-dead]', 'ExponentPushToken[bob-dead]']);
  assertEquals(db.tokens, [tok('alice', 'phone')]);
  assertEquals(db.queue.find((q) => q.userId === 'alice')!.status, 'sent');
  const bob = db.queue.find((q) => q.userId === 'bob')!;
  assertEquals(bob.status, 'failed');
  assertEquals(bob.error, 'DeviceNotRegistered');
});

Deno.test('erreurs transitoires : réessai (pending) puis échec après le nombre max de tentatives', async () => {
  const expo = fakeExpo();
  const db = fakeDb({ queue: [{ userId: 'alice', kind: 'price_drop', title: 't', body: 'b', data: {} }], tokens: [tok('alice', 'rate')] });
  const h = handler(db, SUNDAY_18H_PARIS, expo.fetch, { maxAttempts: 3 });
  await run(h);
  assertEquals(db.queue[0].status, 'pending');
  assertEquals(db.queue[0].attempts, 1);
  await run(h);
  assertEquals(db.queue[0].status, 'pending');
  const { data } = await run(h);
  assertEquals(db.queue[0].status, 'failed');
  assertEquals(db.queue[0].attempts, 3);
  assertEquals(data.stats.failed, 1);
});

Deno.test('Expo indisponible (HTTP 503) → notifications laissées en file', async () => {
  const expo = fakeExpo({ httpStatus: 503 });
  const db = fakeDb({ queue: [{ userId: 'alice', kind: 'order_reminder', title: 't', body: 'b', data: {} }], tokens: [tok('alice')] });
  const { status, data } = await run(handler(db, SUNDAY_18H_PARIS, expo.fetch));
  assertEquals(status, 200);
  assertEquals(data.stats.retrying, 1);
  assertEquals(db.queue[0].status, 'pending');
  assertEquals(db.tokens.length, 1, 'aucun jeton supprimé sur une panne Expo');
});

Deno.test('préférence désactivée depuis la mise en file, ou aucun appareil → ignorée', async () => {
  const expo = fakeExpo();
  const db = fakeDb({
    prefs: [pref('alice', { priceDrops: false }), pref('bob')],
    queue: [
      { userId: 'alice', kind: 'price_drop', title: 't', body: 'b', data: {} },
      { userId: 'bob', kind: 'price_drop', title: 't', body: 'b', data: {} },
    ],
    tokens: [tok('alice')],
  });
  const { data } = await run(handler(db, FRIDAY_10H_PARIS, expo.fetch));
  assertEquals(expo.requests.length, 0);
  assertEquals(data.stats.skipped, 2);
  assertEquals(db.queue.map((q) => q.error), ['opted_out', 'no_push_token']);
});

Deno.test('file vide : aucun appel Expo', async () => {
  const expo = fakeExpo();
  const { data } = await run(handler(fakeDb(), SUNDAY_18H_PARIS, expo.fetch));
  assertEquals(expo.requests.length, 0);
  assertEquals(data.stats.processed, 0);
});

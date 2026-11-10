import { assert, assertEquals, assertFalse } from '@std/assert';
import { silentLogger } from '../_shared/logger.ts';
import {
  concernsEntitlement,
  createRevenueCatWebhookHandler,
  type CurrentSubscription,
  decideSubscription,
  type RecordStatus,
  resolveUserId,
  type RevenueCatEvent,
  type SubscriptionPatch,
  type SubscriptionRepository,
} from './handler.ts';

const SECRET = 'rc_whsec_test_123';
const NOW = new Date('2026-11-10T09:00:00.000Z');
const USER = '6f9619ff-8b86-4d01-b42d-00cf4fc964ff';
const USER2 = '7a1b2c3d-1111-4222-8333-444455556666';
const DAY = 86_400_000;

function event(over: Partial<RevenueCatEvent> = {}): RevenueCatEvent {
  return {
    id: crypto.randomUUID(),
    type: 'INITIAL_PURCHASE',
    app_user_id: USER,
    original_app_user_id: USER,
    aliases: [USER],
    entitlement_ids: ['premium'],
    product_id: 'cabas_premium_monthly',
    period_type: 'NORMAL',
    purchased_at_ms: NOW.getTime() - DAY,
    expiration_at_ms: NOW.getTime() + 30 * DAY,
    event_timestamp_ms: NOW.getTime() - 1000,
    environment: 'PRODUCTION',
    store: 'APP_STORE',
    original_transaction_id: '1000000000000001',
    subscriber_attributes: { $email: { value: 'alice@example.com' } },
    ...over,
  };
}

interface Fake extends SubscriptionRepository {
  events: Map<string, { processed: boolean; outcome?: string; payload: Record<string, unknown> }>;
  subs: Map<string, SubscriptionPatch>;
  failUpsertOnce: boolean;
}

function fakeRepo(knownUsers = [USER, USER2]): Fake {
  const repo: Fake = {
    events: new Map(),
    subs: new Map(),
    failUpsertOnce: false,
    recordEvent(e) {
      const ex = repo.events.get(e.id);
      if (ex) return Promise.resolve<RecordStatus>(ex.processed ? 'processed' : 'pending');
      repo.events.set(e.id, { processed: false, payload: e.payload });
      return Promise.resolve<RecordStatus>('new');
    },
    getSubscription(userId) {
      const s = repo.subs.get(userId);
      return Promise.resolve<CurrentSubscription | null>(
        s
          ? { updatedFromEventAt: s.updated_from_event_at, billingIssueAt: s.billing_issue_at, willRenew: s.will_renew }
          : null,
      );
    },
    upsertSubscription(userId, patch) {
      if (repo.failUpsertOnce) {
        repo.failUpsertOnce = false;
        return Promise.reject(new Error('db timeout'));
      }
      if (!knownUsers.includes(userId)) return Promise.resolve('user_not_found' as const);
      repo.subs.set(userId, patch);
      return Promise.resolve('ok' as const);
    },
    markEventProcessed(id, outcome) {
      const ex = repo.events.get(id)!;
      ex.processed = true;
      ex.outcome = outcome;
      return Promise.resolve();
    },
  };
  return repo;
}

function handler(repo: SubscriptionRepository, secret = SECRET) {
  return createRevenueCatWebhookHandler({ repo, webhookSecret: secret, logger: silentLogger, now: () => NOW });
}

// deno-lint-ignore no-explicit-any
async function send(
  h: (r: Request) => Promise<Response>,
  ev: RevenueCatEvent | unknown,
  auth: string | null = SECRET,
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth !== null) headers.authorization = auth;
  const body = ev && typeof ev === 'object' && 'type' in (ev as object) ? { api_version: '1.0', event: ev } : ev;
  const res = await h(
    new Request('http://localhost/revenuecat-webhook', { method: 'POST', headers, body: JSON.stringify(body) }),
  );
  return { status: res.status, data: await res.json() };
}

// ─── Sécurité ────────────────────────────────────────────────────────────────

Deno.test("webhook : mauvais secret → 401, rien n'est enregistré", async () => {
  const repo = fakeRepo();
  for (const auth of [null, 'wrong', `${SECRET}x`, SECRET.slice(0, -1), `Bearer wrong`]) {
    const { status, data } = await send(handler(repo), event(), auth);
    assertEquals(status, 401, String(auth));
    assertEquals(data.error.code, 'unauthorized');
  }
  assertEquals(repo.events.size, 0);
  assertEquals(repo.subs.size, 0);
});

Deno.test('webhook : secret accepté tel quel ou en « Bearer »', async () => {
  const repo = fakeRepo();
  assertEquals((await send(handler(repo), event(), SECRET)).status, 200);
  assertEquals((await send(handler(repo), event(), `Bearer ${SECRET}`)).status, 200);
});

Deno.test('webhook : secret non configuré → 500 (jamais ouvert)', async () => {
  const { status } = await send(handler(fakeRepo(), ''), event(), '');
  assertEquals(status, 500);
});

Deno.test('webhook : corps invalide → 400', async () => {
  const h = handler(fakeRepo());
  assertEquals((await send(h, { api_version: '1.0' })).status, 400);
  assertEquals((await send(h, { event: { type: 'RENEWAL' } })).status, 400);
});

// ─── Cycle de vie de l'abonnement ────────────────────────────────────────────

Deno.test('INITIAL_PURCHASE (essai) → premium, is_trial, expiration, will_renew', async () => {
  const repo = fakeRepo();
  const ev = event({ period_type: 'TRIAL', expiration_at_ms: NOW.getTime() + 7 * DAY });
  const { status, data } = await send(handler(repo), ev);
  assertEquals(status, 200);
  assertEquals(data.outcome, 'applied:premium');
  const s = repo.subs.get(USER)!;
  assertEquals(s.entitlement, 'premium');
  assert(s.is_trial);
  assert(s.will_renew);
  assertEquals(s.expires_at, new Date(NOW.getTime() + 7 * DAY).toISOString());
  assertEquals(s.store, 'app_store');
  assertEquals(s.product_id, 'cabas_premium_monthly');
  assertEquals(s.original_transaction_id, '1000000000000001');
  assertEquals(s.last_event_id, ev.id);
  // Minimisation : les attributs d'abonné (e-mail) ne sont pas stockés.
  assertFalse('subscriber_attributes' in repo.events.get(ev.id)!.payload);
});

Deno.test('événement en double → 200 « duplicate », aucun nouvel effet', async () => {
  const repo = fakeRepo();
  const ev = event();
  await send(handler(repo), ev);
  repo.subs.delete(USER);
  const { status, data } = await send(handler(repo), ev);
  assertEquals(status, 200);
  assertEquals(data.status, 'duplicate');
  assertFalse(repo.subs.has(USER), 'pas de retraitement');
});

Deno.test('échec de traitement → 500, puis retraité à la relivraison', async () => {
  const repo = fakeRepo();
  repo.failUpsertOnce = true;
  const ev = event();
  const first = await send(handler(repo), ev);
  assertEquals(first.status, 500);
  assertFalse(repo.events.get(ev.id)!.processed);
  const retry = await send(handler(repo), ev);
  assertEquals(retry.status, 200);
  assertEquals(retry.data.status, 'processed');
  assertEquals(repo.subs.get(USER)!.entitlement, 'premium');
});

Deno.test('séquence complète : achat → renouvellement → annulation → expiration', async () => {
  const repo = fakeRepo();
  const h = handler(repo);
  const t = NOW.getTime();
  await send(h, event({ type: 'INITIAL_PURCHASE', event_timestamp_ms: t - 40 * DAY, period_type: 'TRIAL' }));
  await send(h, event({ type: 'RENEWAL', event_timestamp_ms: t - 30 * DAY, period_type: 'NORMAL' }));
  assertFalse(repo.subs.get(USER)!.is_trial);
  await send(h, event({ type: 'CANCELLATION', event_timestamp_ms: t - 10 * DAY, cancel_reason: 'UNSUBSCRIBE' }));
  let s = repo.subs.get(USER)!;
  assertEquals(s.entitlement, 'premium', "accès conservé jusqu'à l'échéance");
  assertFalse(s.will_renew);
  await send(h, event({ type: 'UNCANCELLATION', event_timestamp_ms: t - 5 * DAY }));
  assert(repo.subs.get(USER)!.will_renew);
  await send(h, event({ type: 'EXPIRATION', event_timestamp_ms: t - 1000, expiration_at_ms: t - 2000 }));
  s = repo.subs.get(USER)!;
  assertEquals(s.entitlement, 'free');
  assertFalse(s.will_renew);
});

Deno.test('événement plus ancien que le dernier appliqué → ignoré (ordre non garanti)', async () => {
  const repo = fakeRepo();
  const h = handler(repo);
  await send(
    h,
    event({ type: 'EXPIRATION', event_timestamp_ms: NOW.getTime() - 1000, expiration_at_ms: NOW.getTime() - 2000 }),
  );
  const { data } = await send(h, event({ type: 'RENEWAL', event_timestamp_ms: NOW.getTime() - 60_000 }));
  assertEquals(data.outcome, 'ignored:stale_event');
  assertEquals(repo.subs.get(USER)!.entitlement, 'free');
});

Deno.test('CANCELLATION pour remboursement (échéance passée) → free immédiatement', () => {
  const d = decideSubscription(
    event({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', expiration_at_ms: NOW.getTime() - 1000 }),
    null,
    NOW,
  );
  assert(d.action === 'apply');
  assertEquals(d.patch.entitlement, 'free');
});

Deno.test('BILLING_ISSUE : période de grâce conservée, horodatée', () => {
  const d = decideSubscription(
    event({
      type: 'BILLING_ISSUE',
      expiration_at_ms: NOW.getTime() - DAY,
      grace_period_expiration_at_ms: NOW.getTime() + 3 * DAY,
    }),
    { updatedFromEventAt: null, billingIssueAt: null, willRenew: true },
    NOW,
  );
  assert(d.action === 'apply');
  assertEquals(d.patch.entitlement, 'premium');
  assertEquals(d.patch.expires_at, new Date(NOW.getTime() + 3 * DAY).toISOString());
  assert(d.patch.billing_issue_at);
  assert(d.patch.will_renew);
});

Deno.test('SUBSCRIPTION_PAUSED / PRODUCT_CHANGE / TEMPORARY_ENTITLEMENT_GRANT', () => {
  const paused = decideSubscription(event({ type: 'SUBSCRIPTION_PAUSED' }), null, NOW);
  assert(paused.action === 'apply' && paused.patch.entitlement === 'premium' && !paused.patch.will_renew);
  const change = decideSubscription(
    event({ type: 'PRODUCT_CHANGE', new_product_id: 'cabas_premium_yearly' }),
    null,
    NOW,
  );
  assert(change.action === 'apply' && change.patch.product_id === 'cabas_premium_yearly');
  const temp = decideSubscription(
    event({ type: 'TEMPORARY_ENTITLEMENT_GRANT', expiration_at_ms: NOW.getTime() + DAY }),
    null,
    NOW,
  );
  assert(temp.action === 'apply' && temp.patch.entitlement === 'premium' && !temp.patch.will_renew);
});

Deno.test("TRANSFER : retire à l'ancien compte, accorde au nouveau", async () => {
  const repo = fakeRepo();
  const h = handler(repo);
  await send(h, event({ app_user_id: USER, event_timestamp_ms: NOW.getTime() - DAY }));
  const { data } = await send(
    h,
    event({
      type: 'TRANSFER',
      app_user_id: undefined,
      transferred_from: [USER],
      transferred_to: [USER2],
      event_timestamp_ms: NOW.getTime(),
    }),
  );
  assertEquals(data.updates, 2);
  assertEquals(repo.subs.get(USER)!.entitlement, 'free');
  assertEquals(repo.subs.get(USER2)!.entitlement, 'premium');
});

Deno.test('ids anonymes, entitlement étranger, type non géré, TEST, compte supprimé → 200 ignoré', async () => {
  const repo = fakeRepo([USER]);
  const h = handler(repo);
  const cases: [Partial<RevenueCatEvent>, string][] = [
    [
      { app_user_id: '$RCAnonymousID:abc', original_app_user_id: '$RCAnonymousID:abc', aliases: [] },
      'ignored:no_supabase_user',
    ],
    [{ entitlement_ids: ['pro_plus'] }, 'ignored:other_entitlement'],
    [{ type: 'INVOICE_ISSUANCE' }, 'ignored:unsupported_type'],
    [{ type: 'TEST' }, 'ignored:test_event'],
    [{ app_user_id: USER2, original_app_user_id: USER2, aliases: [] }, 'ignored:user_not_found'],
  ];
  for (const [over, outcome] of cases) {
    const { status, data } = await send(h, event(over));
    assertEquals(status, 200);
    assertEquals(data.outcome, outcome);
  }
  assertFalse(repo.subs.has(USER));
});

Deno.test('resolveUserId / concernsEntitlement', () => {
  assertEquals(
    resolveUserId(
      event({
        app_user_id: '$RCAnonymousID:x',
        original_app_user_id: '$RCAnonymousID:x',
        aliases: ['$RCAnonymousID:x', USER.toUpperCase()],
      }),
    ),
    USER,
  );
  assertEquals(resolveUserId(event({ app_user_id: 'x', original_app_user_id: null, aliases: null })), null);
  assert(concernsEntitlement(event({ entitlement_ids: null, entitlement_id: null }), 'premium'));
  assert(concernsEntitlement(event({ entitlement_ids: null, entitlement_id: 'premium' }), 'premium'));
  assertFalse(concernsEntitlement(event({ entitlement_ids: ['other'] }), 'premium'));
});

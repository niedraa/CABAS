/**
 * revenuecat-webhook — synchronise l'abonnement Premium depuis RevenueCat.
 *
 * Sécurité : l'en-tête `Authorization` doit valoir REVENUECAT_WEBHOOK_SECRET
 * (valeur configurée dans le dashboard RevenueCat ; « Bearer <secret> » est
 * aussi accepté), comparaison en temps constant → 401 sinon.
 *
 * Idempotence : chaque `event.id` est enregistré dans revenuecat_events ; un
 * événement déjà TRAITÉ renvoie 200 sans rien refaire. Un événement reçu mais
 * dont le traitement a échoué (500) est retraité à la relivraison suivante.
 *
 * Ordre : un événement plus ancien (event_timestamp_ms) que le dernier
 * appliqué est ignoré (RevenueCat ne garantit pas l'ordre de livraison).
 *
 * `app_user_id` = id Supabase de l'utilisateur (Purchases.logIn(userId) côté
 * app). Les ids anonymes RevenueCat sont résolus via original_app_user_id /
 * aliases quand c'est possible.
 */
import { verifySharedSecret } from '../_shared/auth.ts';
import { HttpError, json, readJson, requireMethod, withHandler } from '../_shared/http.ts';
import type { Logger } from '../_shared/logger.ts';
import { isRecord } from '../_shared/validation.ts';

/** Événement RevenueCat (champs utilisés). */
export interface RevenueCatEvent {
  id: string;
  type: string;
  app_user_id?: string | null;
  original_app_user_id?: string | null;
  aliases?: string[] | null;
  transferred_from?: string[] | null;
  transferred_to?: string[] | null;
  entitlement_id?: string | null;
  entitlement_ids?: string[] | null;
  product_id?: string | null;
  new_product_id?: string | null;
  period_type?: string | null;
  purchased_at_ms?: number | null;
  expiration_at_ms?: number | null;
  grace_period_expiration_at_ms?: number | null;
  event_timestamp_ms?: number | null;
  environment?: string | null;
  store?: string | null;
  original_transaction_id?: string | null;
  cancel_reason?: string | null;
  expiration_reason?: string | null;
  subscriber_attributes?: unknown;
  [key: string]: unknown;
}

/** Colonnes de `subscriptions` mises à jour. */
export interface SubscriptionPatch {
  entitlement: 'free' | 'premium';
  is_trial: boolean;
  expires_at: string | null;
  product_id: string | null;
  will_renew: boolean;
  store: string | null;
  original_transaction_id: string | null;
  period_type: string | null;
  environment: string | null;
  billing_issue_at: string | null;
  updated_from_event_at: string;
  last_event_id: string;
}

export interface CurrentSubscription {
  updatedFromEventAt: string | null;
  billingIssueAt: string | null;
  willRenew: boolean;
}

export type RecordStatus = 'new' | 'pending' | 'processed';

export interface SubscriptionRepository {
  recordEvent(e: {
    id: string;
    type: string;
    appUserId: string | null;
    userId: string | null;
    eventAt: string | null;
    environment: string | null;
    payload: Record<string, unknown>;
  }): Promise<RecordStatus>;
  getSubscription(userId: string): Promise<CurrentSubscription | null>;
  /** 'user_not_found' si l'utilisateur n'existe pas (compte supprimé). */
  upsertSubscription(userId: string, patch: SubscriptionPatch): Promise<'ok' | 'user_not_found'>;
  markEventProcessed(id: string, outcome: string): Promise<void>;
}

export interface RevenueCatDeps {
  repo: SubscriptionRepository;
  webhookSecret: string;
  logger: Logger;
  now?: () => Date;
  /** Identifiant de l'entitlement Premium dans RevenueCat (défaut « premium »). */
  entitlementId?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GRANTING = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
  'REFUND_REVERSED',
]);
const SUPPORTED = new Set([
  ...GRANTING,
  'CANCELLATION',
  'EXPIRATION',
  'BILLING_ISSUE',
  'SUBSCRIPTION_PAUSED',
  'TRANSFER',
]);

const STORES = new Set([
  'app_store',
  'mac_app_store',
  'play_store',
  'amazon',
  'stripe',
  'rc_billing',
  'paddle',
  'promotional',
  'test_store',
]);

const iso = (ms: unknown): string | null =>
  typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;

/** Id Supabase (UUID) de l'abonné, parmi app_user_id / original_app_user_id / aliases. */
export function resolveUserId(e: RevenueCatEvent): string | null {
  const candidates = [e.app_user_id, e.original_app_user_id, ...(Array.isArray(e.aliases) ? e.aliases : [])];
  for (const c of candidates) if (typeof c === 'string' && UUID_RE.test(c)) return c.toLowerCase();
  return null;
}

function normalizeStore(store: unknown): string | null {
  if (typeof store !== 'string' || !store) return null;
  const s = store.toLowerCase();
  return STORES.has(s) ? s : 'unknown';
}

/** L'événement concerne-t-il notre entitlement ? (absence d'info = oui : app à un seul entitlement) */
export function concernsEntitlement(e: RevenueCatEvent, entitlementId: string): boolean {
  const ids = Array.isArray(e.entitlement_ids) ? e.entitlement_ids : e.entitlement_id ? [e.entitlement_id] : null;
  return ids === null || ids.includes(entitlementId);
}

export type Decision = { action: 'apply'; patch: SubscriptionPatch } | { action: 'ignore'; reason: string };

/**
 * Traduit un événement en mise à jour de l'abonnement d'UN utilisateur
 * (fonction pure). `role` distingue, pour TRANSFER, l'ancien et le nouveau
 * propriétaire.
 */
export function decideSubscription(
  e: RevenueCatEvent,
  current: CurrentSubscription | null,
  now: Date,
  role: 'subscriber' | 'transfer_from' | 'transfer_to' = 'subscriber',
): Decision {
  const eventAt = iso(e.event_timestamp_ms) ?? now.toISOString();
  if (current?.updatedFromEventAt && Date.parse(eventAt) < Date.parse(current.updatedFromEventAt)) {
    return { action: 'ignore', reason: 'stale_event' };
  }
  const expiration = iso(e.expiration_at_ms);
  const grace = iso(e.grace_period_expiration_at_ms);
  const effectiveExpiry = grace && (!expiration || grace > expiration) ? grace : expiration;
  const activeUntil = (exp: string | null) => exp === null || Date.parse(exp) > now.getTime();

  const base = {
    product_id: e.product_id ?? null,
    store: normalizeStore(e.store),
    original_transaction_id: e.original_transaction_id ?? null,
    period_type: e.period_type ?? null,
    environment: e.environment === 'SANDBOX' || e.environment === 'PRODUCTION' ? e.environment : null,
    updated_from_event_at: eventAt,
    last_event_id: e.id,
  };
  const revoked: SubscriptionPatch = {
    ...base,
    entitlement: 'free',
    is_trial: false,
    expires_at: expiration ?? now.toISOString(),
    will_renew: false,
    billing_issue_at: null,
  };

  if (e.type === 'TRANSFER') {
    if (role === 'transfer_from') return { action: 'apply', patch: revoked };
    if (role === 'transfer_to') {
      if (!expiration || !activeUntil(expiration)) {
        return { action: 'ignore', reason: 'transfer_without_active_expiration' };
      }
      return {
        action: 'apply',
        patch: {
          ...base,
          entitlement: 'premium',
          is_trial: e.period_type === 'TRIAL',
          expires_at: expiration,
          will_renew: true,
          billing_issue_at: null,
        },
      };
    }
    return { action: 'ignore', reason: 'transfer_role_missing' };
  }

  if (e.type === 'EXPIRATION') return { action: 'apply', patch: revoked };

  if (GRANTING.has(e.type)) {
    const active = activeUntil(effectiveExpiry);
    return {
      action: 'apply',
      patch: {
        ...base,
        product_id: (e.type === 'PRODUCT_CHANGE' ? e.new_product_id : null) ?? base.product_id,
        entitlement: active ? 'premium' : 'free',
        is_trial: active && e.period_type === 'TRIAL',
        expires_at: effectiveExpiry,
        will_renew: e.type !== 'NON_RENEWING_PURCHASE' && e.type !== 'TEMPORARY_ENTITLEMENT_GRANT',
        billing_issue_at: null,
      },
    };
  }

  // CANCELLATION / SUBSCRIPTION_PAUSED / BILLING_ISSUE : l'accès court jusqu'à l'échéance (ou fin de grâce).
  const active = activeUntil(effectiveExpiry);
  return {
    action: 'apply',
    patch: {
      ...base,
      entitlement: active ? 'premium' : 'free',
      is_trial: active && e.period_type === 'TRIAL',
      expires_at: effectiveExpiry,
      will_renew: e.type === 'BILLING_ISSUE' ? (current?.willRenew ?? true) : false,
      billing_issue_at: e.type === 'BILLING_ISSUE' ? eventAt : (current?.billingIssueAt ?? null),
    },
  };
}

function parseEvent(body: unknown): RevenueCatEvent {
  if (!isRecord(body) || !isRecord(body.event)) {
    throw new HttpError(400, 'invalid_request', 'Événement RevenueCat manquant.');
  }
  const e = body.event;
  if (typeof e.id !== 'string' || !e.id || e.id.length > 200 || typeof e.type !== 'string' || !e.type) {
    throw new HttpError(400, 'invalid_request', 'event.id et event.type sont obligatoires.');
  }
  return e as RevenueCatEvent;
}

/** Copie de l'événement sans les attributs d'abonné (e-mail, etc. : minimisation RGPD). */
function minimizedPayload(e: RevenueCatEvent): Record<string, unknown> {
  const { subscriber_attributes: _drop, ...rest } = e;
  return rest;
}

export function createRevenueCatWebhookHandler(deps: RevenueCatDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date());
  const entitlementId = deps.entitlementId ?? 'premium';

  return withHandler(deps.logger, async (req, log) => {
    requireMethod(req, 'POST');
    verifySharedSecret(req, 'authorization', deps.webhookSecret);
    const event = parseEvent(await readJson(req, 128 * 1024));
    const userId = resolveUserId(event);

    const status = await deps.repo.recordEvent({
      id: event.id,
      type: event.type,
      appUserId: typeof event.app_user_id === 'string' ? event.app_user_id : null,
      userId,
      eventAt: iso(event.event_timestamp_ms),
      environment: typeof event.environment === 'string' ? event.environment : null,
      payload: minimizedPayload(event),
    });
    if (status === 'processed') {
      log.info('duplicate event ignored', { eventId: event.id, type: event.type });
      return json({ status: 'duplicate' });
    }

    const nowDate = now();
    const outcomes: string[] = [];
    let updates = 0;

    const apply = async (uid: string, role: 'subscriber' | 'transfer_from' | 'transfer_to') => {
      const current = await deps.repo.getSubscription(uid);
      const decision = decideSubscription(event, current, nowDate, role);
      if (decision.action === 'ignore') {
        outcomes.push(`ignored:${decision.reason}`);
        return;
      }
      const res = await deps.repo.upsertSubscription(uid, decision.patch);
      if (res === 'user_not_found') outcomes.push('ignored:user_not_found');
      else {
        updates++;
        outcomes.push(`applied:${decision.patch.entitlement}`);
      }
    };

    if (event.type === 'TEST') {
      outcomes.push('ignored:test_event');
    } else if (!SUPPORTED.has(event.type)) {
      outcomes.push('ignored:unsupported_type');
    } else if (!concernsEntitlement(event, entitlementId)) {
      outcomes.push('ignored:other_entitlement');
    } else if (event.type === 'TRANSFER') {
      const ids = (
        xs: unknown,
      ) => (Array.isArray(xs) ? xs.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x)) : []);
      for (const uid of ids(event.transferred_from)) await apply(uid.toLowerCase(), 'transfer_from');
      for (const uid of ids(event.transferred_to)) await apply(uid.toLowerCase(), 'transfer_to');
      if (outcomes.length === 0) outcomes.push('ignored:no_known_user');
    } else if (!userId) {
      outcomes.push('ignored:no_supabase_user');
    } else {
      await apply(userId, 'subscriber');
    }

    const outcome = outcomes.join(',');
    await deps.repo.markEventProcessed(event.id, outcome);
    log.info('revenuecat event processed', { eventId: event.id, type: event.type, outcome });
    return json({ status: 'processed', outcome, updates });
  });
}

/**
 * Suivi des erreurs (Sentry) — sans effet sans DSN.
 *
 * Aucune donnée de santé ni donnée personnelle ne part : `sendDefaultPii`
 * désactivé, et `scrubSensitive` retire du contexte, des extras et des
 * breadcrumbs toute clé évoquant allergies / régimes / profil.
 *
 * API : `initMonitoring()`, `captureError(error, context?)`, `setMonitoringUser(id)`.
 */
import { env } from '@/lib/env';

type SentryModule = typeof import('@sentry/react-native');

const SENSITIVE_KEY = /(allerg|diet|regime|régime|health|sante|santé|profile|household|email|token|password|authorization|cookie)/i;

/** Copie d'un objet sans les clés sensibles (récursif, profondeur bornée). */
export function scrubSensitive<T>(value: T, depth = 0): T {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrubSensitive(v, depth + 1)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(k)) {
      out[k] = '[filtré]';
      continue;
    }
    out[k] = scrubSensitive(v, depth + 1);
  }
  return out as T;
}

let sentry: SentryModule | null = null;
let initialized = false;

export function initMonitoring(): void {
  if (initialized || !env.sentryDsn) return;
  initialized = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- module natif chargé à la demande (absent sur le web / en démo)
    sentry = require('@sentry/react-native') as SentryModule;
    sentry.init({
      dsn: env.sentryDsn,
      sendDefaultPii: false,
      tracesSampleRate: 0.1,
      environment: __DEV__ ? 'development' : 'production',
      beforeSend(event) {
        if (event.extra) event.extra = scrubSensitive(event.extra);
        if (event.contexts) event.contexts = scrubSensitive(event.contexts);
        if (event.request) delete event.request.cookies;
        if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map((b) => (b.data ? { ...b, data: scrubSensitive(b.data) } : b));
        }
        return event;
      },
    });
  } catch {
    sentry = null;
  }
}

export function isMonitoringActive(): boolean {
  return sentry !== null;
}

/** Signale une erreur (jamais bloquant). En développement, l'erreur est aussi journalisée. */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (__DEV__ && process.env.NODE_ENV !== 'test') {
    console.warn('[cabas]', error, context ?? '');
  }
  if (!sentry) return;
  try {
    sentry.captureException(error, context ? { extra: scrubSensitive(context) } : undefined);
  } catch {
    // ignoré
  }
}

/** Identifiant pseudonyme uniquement. */
export function setMonitoringUser(userId: string | null): void {
  if (!sentry) return;
  try {
    sentry.setUser(userId ? { id: userId } : null);
  } catch {
    // ignoré
  }
}

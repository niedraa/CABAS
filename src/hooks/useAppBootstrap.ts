/**
 * Démarrage de l'app — à appeler UNE fois dans `src/app/_layout.tsx`.
 *
 * `const { ready, session, error } = useAppBootstrap();`
 *  - `ready` : stores relus du disque ET session résolue (ou 2,5 s écoulées :
 *    on n'attend jamais le réseau pour afficher l'app, hors-ligne compris) ;
 *  - `session` : `{ userId, mode: 'demo' | 'remote', offline }` une fois connue.
 *
 * En arrière-plan (jamais bloquant, erreurs remontées à Sentry) :
 *  1. Sentry (si DSN) ; PostHog seulement si l'utilisateur a consenti (opt-in) ;
 *  2. session : anonyme Supabase (production) ou identifiant local (démo) ;
 *  3. RevenueCat configuré avec l'id utilisateur (+ écoute des changements de droits) ;
 *  4. notifications : gestionnaire d'affichage, rappels reprogrammés, jeton push ;
 *  5. catalogue distant (production) puis détection des baisses de prix ;
 *  6. récupération de l'état serveur + synchronisation automatique (production).
 * Au retour au premier plan : jour courant et abonnement rafraîchis.
 *
 * `bootstrapApp()` est exportée (idempotente) pour les tests et le seed de démo.
 */
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { identify, initAnalytics } from '@/services/analytics';
import { ensureSession, type SessionInfo } from '@/services/auth';
import { refreshCatalog } from '@/services/catalog';
import { captureError, initMonitoring, setMonitoringUser } from '@/services/monitoring';
import { applyNotificationPreferences, getPermissionStatus, registerPushToken, setupNotifications } from '@/services/notifications';
import { getPurchases } from '@/services/purchases';
import { pullAll } from '@/services/sync';
import {
  applyPulledData,
  checkPriceDrops,
  startAutoSync,
  useSettingsStore,
  useSubscriptionStore,
  useWeekStore,
  waitForHydration,
} from '@/stores';

import { useHydrated } from './useHydrated';

export const SESSION_WAIT_MS = 2500;

export interface BootstrapResult {
  session: SessionInfo | null;
  error: string | null;
}

let started: Promise<BootstrapResult> | null = null;
/** Résolue dès que la session est connue (bien avant la fin du démarrage complet). */
let sessionReady: Promise<SessionInfo | null> | null = null;
let resolveSession: (s: SessionInfo | null) => void = () => undefined;
let stopSync: (() => void) | null = null;
let stopPurchases: (() => void) | null = null;

async function step(name: string, fn: () => Promise<unknown> | unknown): Promise<void> {
  try {
    await fn();
  } catch (err) {
    captureError(err, { where: `bootstrap.${name}` });
  }
}

async function run(): Promise<BootstrapResult> {
  initMonitoring();
  await waitForHydration();
  const settings = useSettingsStore.getState();
  initAnalytics({ consent: settings.analyticsConsent });

  const session = await ensureSession().catch((err: unknown) => {
    captureError(err, { where: 'bootstrap.session' });
    return null;
  });
  resolveSession(session);
  if (session) {
    identify(session.userId);
    setMonitoringUser(session.userId);
  }

  // Abonnement : configuration RevenueCat (id = utilisateur Supabase) puis état réel.
  await step('purchases', async () => {
    const purchases = getPurchases();
    if (session && !session.offline) await purchases.configure(session.userId);
    stopPurchases?.();
    stopPurchases = purchases.addListener((state) => useSubscriptionStore.getState().applyState(state));
    await useSubscriptionStore.getState().refresh();
  });

  await step('notifications', async () => {
    await setupNotifications();
    const status = await getPermissionStatus();
    useSettingsStore.setState({ notificationPermission: status });
    if (status === 'granted') {
      await applyNotificationPreferences(useSettingsStore.getState().notificationPrefs);
      if (session && session.mode === 'remote' && !session.offline) await registerPushToken(session.userId);
    }
  });

  await step('catalog', async () => {
    await refreshCatalog();
    await checkPriceDrops();
  });

  await step('sync', async () => {
    if (!session || session.mode !== 'remote' || session.offline) return;
    applyPulledData(await pullAll());
    stopSync?.();
    stopSync = startAutoSync();
  });

  return { session, error: null };
}

/** Lance le démarrage (une seule fois ; les appels suivants renvoient la même promesse). */
export function bootstrapApp(): Promise<BootstrapResult> {
  if (!started) {
    sessionReady = new Promise((resolve) => {
      resolveSession = resolve;
    });
    started = run().catch((err: unknown) => {
      captureError(err, { where: 'bootstrap' });
      resolveSession(null);
      return { session: null, error: err instanceof Error ? err.message : String(err) };
    });
  }
  return started;
}

/** Session de l'utilisateur, dès qu'elle est connue (lance le démarrage si besoin). */
export function whenSessionReady(): Promise<SessionInfo | null> {
  void bootstrapApp();
  return sessionReady as Promise<SessionInfo | null>;
}

/** Remet le démarrage à zéro (tests, suppression de compte). */
export function __resetBootstrapForTests(): void {
  stopSync?.();
  stopPurchases?.();
  stopSync = null;
  stopPurchases = null;
  started = null;
  sessionReady = null;
  resolveSession = () => undefined;
}

export interface AppBootstrapState {
  ready: boolean;
  session: SessionInfo | null;
  error: string | null;
}

export function useAppBootstrap(): AppBootstrapState {
  const hydrated = useHydrated();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessionSettled, setSessionSettled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => alive && setSessionSettled(true), SESSION_WAIT_MS);
    const boot = bootstrapApp();
    void whenSessionReady().then((s) => {
      if (!alive) return;
      setSession(s);
      setSessionSettled(true);
    });
    void boot.then((res) => {
      if (!alive) return;
      if (res.error) setError(res.error);
      setSessionSettled(true);
    });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      useWeekStore.getState().refreshToday();
      void useSubscriptionStore.getState().refresh();
    });
    return () => sub.remove();
  }, []);

  return { ready: hydrated && sessionSettled, session, error };
}

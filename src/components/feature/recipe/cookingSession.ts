/**
 * Session du mode cuisine, gardée HORS des composants (en mémoire, non
 * persistée), une par recette : fermer le mode cuisine (X, retour Android) ou
 * repasser par la fiche ne remet ni l'étape ni les minuteurs à zéro.
 *
 * Les minuteurs stockent leur ÉCHÉANCE : fermé, le mode cuisine ne « tick »
 * plus, mais le temps restant reste juste à la réouverture. Pour prévenir
 * même app en arrière-plan ou écran verrouillé, l'écran fournit des
 * `TimerAlerts` (notification locale programmée à l'échéance).
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { createTimer, useTimerEngine, type CountdownApi, type TimerState } from './timer';

/** Alerte système à l'échéance d'un minuteur (fournie par l'écran : notifications locales). */
export interface TimerAlerts {
  schedule(key: string, endsAt: number, content: { title: string; body: string }): void;
  cancel(key: string): void;
}

export interface CookingSession {
  /** Étape affichée (index). */
  step: number;
  /** Minuteurs par index d'étape. */
  timers: Record<number, TimerState>;
}

interface SessionsState {
  sessions: Record<string, CookingSession>;
}

const useSessions = create<SessionsState>()(() => ({ sessions: {} }));

/**
 * En dessous de ce délai, mode cuisine ouvert et app au premier plan, la
 * notification programmée est annulée : le bandeau de l'app prend le relais
 * (pas de double alerte).
 */
export const ALERT_HANDOFF_MS = 1000;

function patch(key: string, fn: (s: CookingSession) => CookingSession): void {
  useSessions.setState((st) => ({ sessions: { ...st.sessions, [key]: fn(st.sessions[key] ?? { step: 0, timers: {} }) } }));
}

export function alertKey(sessionKey: string, step: number): string {
  return `${sessionKey}:${step}`;
}

export function getCookingSession(key: string): CookingSession | undefined {
  return useSessions.getState().sessions[key];
}

export function setCookingStep(key: string, step: number): void {
  if (getCookingSession(key)?.step === step) return;
  patch(key, (s) => ({ ...s, step }));
}

/** Minuteurs qui tournent encore dans une session. */
export function runningTimers(session: CookingSession | undefined): number {
  if (!session) return 0;
  return Object.values(session.timers).filter((t) => t.status === 'running').length;
}

/** Fin de la recette : session oubliée, alertes des minuteurs en cours annulées. */
export function clearCookingSession(key: string, alerts?: TimerAlerts): void {
  const session = getCookingSession(key);
  if (!session) return;
  for (const [step, timer] of Object.entries(session.timers)) {
    if (timer.status === 'running') alerts?.cancel(alertKey(key, Number(step)));
  }
  useSessions.setState((st) => {
    const sessions = { ...st.sessions };
    delete sessions[key];
    return { sessions };
  });
}

/** Oublie toutes les sessions (tests). */
export function resetCookingSessions(): void {
  useSessions.setState({ sessions: {} });
}

/** Session d'une recette (null si aucune), pour la fiche (« Reprendre »). */
export function useCookingSession(key: string | undefined): CookingSession | null {
  return useSessions((st) => (key ? (st.sessions[key] ?? null) : null));
}

export interface SessionTimerOptions {
  sessionKey: string;
  step: number;
  totalSec: number;
  onDone?: () => void;
  alerts?: TimerAlerts;
  /** Texte de la notification système. */
  alertContent?: { title: string; body: string };
  tickMs?: number;
}

/**
 * Minuteur d'une étape, rangé dans la session : il survit à la fermeture du
 * mode cuisine. Programme / annule la notification locale (`alerts`) au
 * lancement, à la pause, à la remise à zéro et à l'échéance au premier plan.
 */
export function useSessionTimer({ sessionKey, step, totalSec, onDone, alerts, alertContent, tickMs = 250 }: SessionTimerOptions): CountdownApi {
  const totalMs = Math.max(0, Math.round(totalSec * 1000));
  const stored = useSessions((st) => st.sessions[sessionKey]?.timers[step]);
  const fresh = useMemo(() => createTimer(totalSec), [totalSec]);
  // Durée changée (recette mise à jour) : l'ancien minuteur ne vaut plus.
  const state = stored && stored.totalMs === totalMs ? stored : fresh;
  const key = alertKey(sessionKey, step);

  const alertsRef = useRef(alerts);
  const contentRef = useRef(alertContent);
  useEffect(() => {
    alertsRef.current = alerts;
    contentRef.current = alertContent;
  }, [alerts, alertContent]);
  const handedOff = useRef(false);

  const update = useCallback(
    (fn: (s: TimerState) => TimerState) => {
      const current = useSessions.getState().sessions[sessionKey]?.timers[step];
      const prev = current && current.totalMs === totalMs ? current : createTimer(totalSec);
      const next = fn(prev);
      if (next === prev) return;
      const a = alertsRef.current;
      if (a && next.status === 'running' && next.endsAt !== null && prev.status !== 'running') {
        handedOff.current = false;
        a.schedule(key, next.endsAt, contentRef.current ?? { title: 'Minuteur terminé', body: `Étape ${step + 1}` });
      } else if (a && prev.status === 'running' && (next.status === 'paused' || next.status === 'idle')) {
        // Pause ou remise à zéro : plus d'alerte. À l'échéance, rien à annuler : le relais
        // a déjà été pris au premier plan, sinon le système vient de prévenir.
        a.cancel(key);
      }
      patch(sessionKey, (s) => ({ ...s, timers: { ...s.timers, [step]: next } }));
    },
    [sessionKey, step, totalMs, totalSec, key],
  );

  const api = useTimerEngine(state, update, onDone, tickMs);

  // Dernière seconde, mode cuisine ouvert et app au premier plan : le bandeau de
  // l'app prend le relais, la notification système est annulée (pas de double alerte).
  const handoff = state.status === 'running' && api.remainingMs <= ALERT_HANDOFF_MS;
  useEffect(() => {
    if (!handoff || handedOff.current || AppState.currentState !== 'active') return;
    handedOff.current = true;
    alertsRef.current?.cancel(key);
  }, [handoff, key]);

  return api;
}

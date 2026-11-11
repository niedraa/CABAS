/**
 * Minuteur d'étape du mode cuisine — logique pure + hook.
 *
 * L'état stocke une ÉCHÉANCE (horodatage) plutôt qu'un compteur : le temps
 * restant reste juste même si l'app est mise en pause ou si les ticks
 * arrivent en retard.
 */
import { useEffect, useRef, useState } from 'react';

export type TimerStatus = 'idle' | 'running' | 'paused' | 'done';

export interface TimerState {
  status: TimerStatus;
  totalMs: number;
  /** Temps restant quand le minuteur n'avance pas (idle / paused / done). */
  remainingMs: number;
  /** Échéance (ms, horloge `now`) quand il tourne. */
  endsAt: number | null;
}

export function createTimer(totalSec: number): TimerState {
  const totalMs = Math.max(0, Math.round(totalSec * 1000));
  return { status: 'idle', totalMs, remainingMs: totalMs, endsAt: null };
}

export function startTimer(s: TimerState, now: number): TimerState {
  if (s.status === 'running') return s;
  const remaining = s.status === 'done' ? s.totalMs : s.remainingMs;
  if (remaining <= 0) return { ...s, status: 'done', remainingMs: 0, endsAt: null };
  return { ...s, status: 'running', remainingMs: remaining, endsAt: now + remaining };
}

export function pauseTimer(s: TimerState, now: number): TimerState {
  if (s.status !== 'running' || s.endsAt === null) return s;
  return { ...s, status: 'paused', remainingMs: Math.max(0, s.endsAt - now), endsAt: null };
}

export function resetTimer(s: TimerState): TimerState {
  return createTimer(s.totalMs / 1000);
}

/** Avance le minuteur à l'instant `now` (passe à « done » à l'échéance). */
export function tickTimer(s: TimerState, now: number): TimerState {
  if (s.status !== 'running' || s.endsAt === null) return s;
  const remaining = s.endsAt - now;
  if (remaining <= 0) return { ...s, status: 'done', remainingMs: 0, endsAt: null };
  return { ...s, remainingMs: remaining };
}

/** Temps restant en ms à l'instant `now`. */
export function remainingAt(s: TimerState, now: number): number {
  if (s.status === 'running' && s.endsAt !== null) return Math.max(0, s.endsAt - now);
  return s.remainingMs;
}

/** Avancement 0 → 1 (1 = terminé). */
export function timerProgress(s: TimerState, now: number): number {
  if (s.totalMs <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - remainingAt(s, now) / s.totalMs));
}

/** « 9:05 », « 1:02:30 » (secondes arrondies au supérieur). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = s < 10 ? `0${s}` : String(s);
  if (h > 0) return `${h}:${m < 10 ? `0${m}` : m}:${ss}`;
  return `${m}:${ss}`;
}

/** « 9 minutes 5 secondes » pour les lecteurs d'écran. */
export function formatCountdownA11y(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (m > 0) parts.push(`${m} minute${m > 1 ? 's' : ''}`);
  if (s > 0 || m === 0) parts.push(`${s} seconde${s > 1 ? 's' : ''}`);
  return parts.join(' ');
}

export interface CountdownApi {
  state: TimerState;
  remainingMs: number;
  progress: number;
  start(): void;
  pause(): void;
  reset(): void;
}

/** Mise à jour d'un état de minuteur rangé ailleurs (useState, session du mode cuisine…). */
export type TimerUpdater = (fn: (s: TimerState) => TimerState) => void;

/**
 * Moteur commun des minuteurs React. Pendant qu'il tourne, seule l'horloge
 * locale avance (toutes les `tickMs` ms) : le temps restant se DÉDUIT de
 * l'échéance, l'état rangé n'est réécrit qu'aux transitions (lancement,
 * pause, remise à zéro, échéance). `onDone` est appelé UNE fois par passage
 * à « done » observé pendant que le composant est monté (pas au montage d'un
 * minuteur déjà fini).
 */
export function useTimerEngine(state: TimerState, update: TimerUpdater, onDone?: () => void, tickMs = 250): CountdownApi {
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  const [now, setNow] = useState(() => Date.now());
  const running = state.status === 'running';
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [running, tickMs]);

  // Échéance dépassée : on fige le minuteur sur « done » (hors du rappel d'horloge).
  const expired = running && state.endsAt !== null && state.endsAt <= now;
  useEffect(() => {
    if (expired) update((s) => tickTimer(s, Date.now()));
  }, [expired, update]);

  // Échéance atteinte : un seul signal par passage à « done ».
  const prevStatus = useRef(state.status);
  useEffect(() => {
    if (state.status === 'done' && prevStatus.current !== 'done') doneRef.current?.();
    prevStatus.current = state.status;
  }, [state.status]);

  const remainingMs = remainingAt(state, now);
  return {
    state,
    remainingMs,
    progress: state.totalMs > 0 ? Math.min(1, Math.max(0, 1 - remainingMs / state.totalMs)) : 1,
    start: () => {
      setNow(Date.now());
      update((s) => startTimer(s, Date.now()));
    },
    pause: () => update((s) => pauseTimer(s, Date.now())),
    reset: () => update((s) => resetTimer(s)),
  };
}

/**
 * Minuteur React à état local (perdu au démontage) ; pour le mode cuisine,
 * voir `useSessionTimer` (cookingSession.ts), qui survit à la fermeture.
 */
export function useCountdown(totalSec: number, onDone?: () => void, tickMs = 250): CountdownApi {
  const [state, setState] = useState(() => createTimer(totalSec));

  // Changement de durée (autre étape) : on repart de zéro.
  const [prevTotal, setPrevTotal] = useState(totalSec);
  if (prevTotal !== totalSec) {
    setPrevTotal(totalSec);
    setState(createTimer(totalSec));
  }

  return useTimerEngine(state, setState, onDone, tickMs);
}

/**
 * weekStore — semaine affichée (non persisté).
 *
 * État :
 *  - `today` (YYYY-MM-DD, local), `currentWeekStart` (lundi de la semaine en cours),
 *  - `activeWeekStart` : semaine que l'utilisateur consulte / planifie
 *    (semaine en cours ou suivante). C'est la semaine PAR DÉFAUT de toutes les
 *    actions des stores planning, liste et panier.
 * Actions :
 *  - `setActiveWeek(weekStart)` : bornée à [semaine en cours, semaine suivante] ;
 *  - `refreshToday(now?)` : à appeler au retour au premier plan (changement de jour).
 * Utilitaires : `nextWeekStartOf(ws)`, hook `useCurrentWeek()` (src/hooks).
 */
import { create } from 'zustand';

import { addDays, startOfWeek, todayISO } from '@/core';

export interface WeekState {
  today: string;
  currentWeekStart: string;
  activeWeekStart: string;
  setActiveWeek(weekStart: string): void;
  refreshToday(now?: string | Date): void;
}

export function nextWeekStartOf(weekStart: string): string {
  return addDays(weekStart, 7);
}

function initial(now?: string | Date) {
  const today = todayISO(now);
  const currentWeekStart = startOfWeek(today);
  return { today, currentWeekStart, activeWeekStart: currentWeekStart };
}

export const useWeekStore = create<WeekState>()((set, get) => ({
  ...initial(),
  setActiveWeek(weekStart) {
    const { currentWeekStart } = get();
    const ws = startOfWeek(weekStart);
    const clamped = ws < currentWeekStart ? currentWeekStart : ws > nextWeekStartOf(currentWeekStart) ? nextWeekStartOf(currentWeekStart) : ws;
    if (clamped !== get().activeWeekStart) set({ activeWeekStart: clamped });
  },
  refreshToday(now) {
    const next = initial(now);
    const { today, activeWeekStart } = get();
    if (next.today === today) return;
    // La semaine affichée reste celle choisie si elle est encore d'actualité.
    const keep = activeWeekStart >= next.currentWeekStart && activeWeekStart <= nextWeekStartOf(next.currentWeekStart);
    set({ ...next, activeWeekStart: keep ? activeWeekStart : next.currentWeekStart });
  },
}));

/** Semaine active (hors React). */
export function activeWeek(): string {
  return useWeekStore.getState().activeWeekStart;
}

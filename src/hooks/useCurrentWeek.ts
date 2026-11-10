/**
 * `useCurrentWeek()` : semaine affichée et navigation semaine en cours ⇄ suivante.
 *
 * Renvoie `{ today, currentWeekStart, nextWeekStart, activeWeekStart,
 * isNextWeek, rangeLabel (« 9 – 15 nov. »), setActiveWeek(ws), goToCurrentWeek(),
 * goToNextWeek() }`. Le jour courant est rafraîchi au retour au premier plan.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { formatWeekRange } from '@/core';
import { nextWeekStartOf, useWeekStore } from '@/stores';

export interface CurrentWeek {
  today: string;
  currentWeekStart: string;
  nextWeekStart: string;
  activeWeekStart: string;
  isNextWeek: boolean;
  rangeLabel: string;
  setActiveWeek(weekStart: string): void;
  goToCurrentWeek(): void;
  goToNextWeek(): void;
}

export function useCurrentWeek(): CurrentWeek {
  const { today, currentWeekStart, activeWeekStart, setActiveWeek, refreshToday } = useWeekStore(
    useShallow((s) => ({
      today: s.today,
      currentWeekStart: s.currentWeekStart,
      activeWeekStart: s.activeWeekStart,
      setActiveWeek: s.setActiveWeek,
      refreshToday: s.refreshToday,
    })),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshToday();
    });
    return () => sub.remove();
  }, [refreshToday]);

  const nextWeekStart = nextWeekStartOf(currentWeekStart);
  return {
    today,
    currentWeekStart,
    nextWeekStart,
    activeWeekStart,
    isNextWeek: activeWeekStart === nextWeekStart,
    rangeLabel: formatWeekRange(activeWeekStart),
    setActiveWeek,
    goToCurrentWeek: () => setActiveWeek(currentWeekStart),
    goToNextWeek: () => setActiveWeek(nextWeekStart),
  };
}

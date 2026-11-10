/**
 * Heure locale d'un fuseau IANA (ex. Europe/Paris), sans dépendance : utilise
 * Intl.DateTimeFormat (disponible dans Deno).
 */
import { addDays, startOfWeek } from './core/index.ts';

export interface ZonedParts {
  /** Jour local ISO `YYYY-MM-DD`. */
  date: string;
  /** 0 = lundi … 6 = dimanche (convention core). */
  weekday: number;
  hour: number;
  minute: number;
}

const WEEKDAYS: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** Décompose un instant dans un fuseau ; fuseau invalide → Europe/Paris. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    });
  } catch {
    return zonedParts(instant, 'Europe/Paris');
  }
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(instant)) parts[p.type] = p.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS[parts.weekday] ?? 0,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/** Lundi de la semaine SUIVANT le jour local donné. */
export function nextWeekStart(localDate: string): string {
  return addDays(startOfWeek(localDate), 7);
}

// GENERATED — do not edit.
// Copie générée de src/core par scripts/sync-shared.mjs (npm run sync:shared).
// Toute modification doit être faite dans src/core puis resynchronisée.
/**
 * Dates « jour » (`YYYY-MM-DD`, heure locale) et libellés français.
 *
 * Les calculs de calendrier se font sur des dates civiles en UTC
 * (Date.UTC) pour être insensibles aux changements d'heure (DST).
 * Les noms de jours/mois sont codés en dur : on ne dépend PAS des données
 * de locale d'Intl, qui diffèrent entre Hermes, V8 et Deno.
 */

export const WEEKDAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;
export const WEEKDAY_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'] as const;
export const MONTH_NAMES = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;
export const MONTH_SHORT = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
] as const;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})/;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Décompose `YYYY-MM-DD` (ou un horodatage ISO, seule la partie jour est lue). */
function parts(iso: string): { y: number; m: number; d: number } {
  const match = ISO_RE.exec(iso);
  if (!match) throw new Error(`Date ISO invalide : « ${iso} »`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** Date civile → `YYYY-MM-DD` via une date UTC (interne). */
function fromUTC(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Vrai si la chaîne est une date jour valide `YYYY-MM-DD`. */
export function isISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parts(s);
  return fromUTC(Date.UTC(y, m - 1, d)) === s;
}

/** Date JS → jour ISO dans le fuseau LOCAL de l'appareil. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Jour LOCAL d'un horodatage ISO : « 2026-11-11T23:30:00Z » donne
 * « 2026-11-12 » à Paris (et non le jour UTC). Une date jour `YYYY-MM-DD`
 * est renvoyée telle quelle ; un horodatage illisible, coupé au jour.
 */
export function localISODate(timestamp: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) return timestamp;
  const d = new Date(timestamp);
  return Number.isNaN(d.getTime()) ? timestamp.slice(0, 10) : toISODate(d);
}

/** Jour ISO → Date JS à minuit heure locale. */
export function parseISODate(s: string): Date {
  const { y, m, d } = parts(s);
  return new Date(y, m - 1, d);
}

/** Jour ISO du jour (local), ou de l'horodatage fourni. */
export function todayISO(now?: string | Date): string {
  if (typeof now === 'string') return now.slice(0, 10);
  return toISODate(now ?? new Date());
}

/** Ajoute n jours (n peut être négatif). */
export function addDays(iso: string, n: number): string {
  const { y, m, d } = parts(iso);
  return fromUTC(Date.UTC(y, m - 1, d + n));
}

/** Indice du jour de la semaine : 0 = lundi … 6 = dimanche. */
export function weekdayIndex(iso: string): number {
  const { y, m, d } = parts(iso);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Lundi de la semaine contenant la date (Date → jour local ; chaîne → jour ISO). */
export function startOfWeek(d: Date | string): string {
  const iso = typeof d === 'string' ? d.slice(0, 10) : toISODate(d);
  return addDays(iso, -weekdayIndex(iso));
}

/** Les 7 jours (lundi → dimanche) d'une semaine. */
export function weekDates(weekStart: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) out.push(addDays(weekStart, i));
  return out;
}

export function isWeekend(iso: string): boolean {
  return weekdayIndex(iso) >= 5;
}

/** Nombre de jours entre deux dates (b − a). */
export function daysBetween(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}

/** Vrai si `iso` appartient à la semaine qui commence le lundi `weekStart`. */
export function isInWeek(iso: string, weekStart: string): boolean {
  // Donnée persistée corrompue (date illisible) : simplement hors semaine.
  if (typeof iso !== 'string' || !ISO_RE.test(iso)) return false;
  const diff = daysBetween(weekStart, iso.slice(0, 10));
  return diff >= 0 && diff < 7;
}

/** Mois 1-12 d'un jour ISO. */
export function monthOf(iso: string): number {
  return parts(iso).m;
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

export type DayLabelStyle = 'short' | 'long' | 'weekday';

/**
 * Libellé d'un jour :
 * - 'short'   → « lun. 14 »
 * - 'long'    → « lundi 14 septembre » (« 1er » pour le premier du mois)
 * - 'weekday' → « Lundi »
 */
export function formatDayLabel(iso: string, style: DayLabelStyle = 'long'): string {
  const { m, d } = parts(iso);
  const wd = weekdayIndex(iso);
  switch (style) {
    case 'short':
      return `${WEEKDAY_SHORT[wd]} ${d}`;
    case 'weekday':
      return capitalize(WEEKDAY_NAMES[wd]);
    case 'long':
    default:
      return `${WEEKDAY_NAMES[wd]} ${d === 1 ? '1er' : d} ${MONTH_NAMES[m - 1]}`;
  }
}

/**
 * Plage d'une semaine : « 8 – 14 sept. », « 29 sept. – 5 oct. »,
 * « 29 déc. 2025 – 4 janv. 2026 » lorsque l'année change.
 */
export function formatWeekRange(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const a = parts(weekStart);
  const b = parts(end);
  if (a.y !== b.y) {
    return `${a.d} ${MONTH_SHORT[a.m - 1]} ${a.y} – ${b.d} ${MONTH_SHORT[b.m - 1]} ${b.y}`;
  }
  if (a.m !== b.m) {
    return `${a.d} ${MONTH_SHORT[a.m - 1]} – ${b.d} ${MONTH_SHORT[b.m - 1]}`;
  }
  return `${a.d} – ${b.d} ${MONTH_SHORT[b.m - 1]}`;
}

/** « Aujourd'hui », « Demain », « Hier » ou le libellé du jour. */
export function relativeDayLabel(iso: string, todayIso: string, style: DayLabelStyle = 'long'): string {
  const diff = daysBetween(todayIso.slice(0, 10), iso.slice(0, 10));
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Demain';
  if (diff === -1) return 'Hier';
  return formatDayLabel(iso, style);
}

/** « septembre 2026 » à partir d'une clé `YYYY-MM` ou d'un jour ISO. */
export function formatMonthLabel(isoOrMonth: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(isoOrMonth);
  if (!match) throw new Error(`Mois invalide : « ${isoOrMonth} »`);
  return `${MONTH_NAMES[Number(match[2]) - 1]} ${match[1]}`;
}

/**
 * Suivi du budget — logique pure d'affichage : barres des dernières semaines
 * et des derniers mois (périodes vides comprises), message bienveillant sur
 * la semaine (jamais culpabilisant), saisie d'un montant, jours proposés pour
 * une dépense, libellés des lignes.
 */
import type { SpendingEntry, Store } from '@/core';
import {
  addDays,
  formatDayLabel,
  formatMonthLabel,
  formatPrice,
  formatWeekRange,
  MONTH_SHORT,
  parsePriceToCents,
  relativeDayLabel,
  spendingByMonth,
  spendingByWeek,
  STORE_CHAIN_LABELS,
  startOfWeek,
  WEEKDAY_SHORT,
  weekdayIndex,
} from '@/core';

// ─── Graphique ───────────────────────────────────────────────────────────────

export type ChartPeriod = 'week' | 'month';

export interface ChartBar {
  /** Lundi (`YYYY-MM-DD`) ou mois (`YYYY-MM`). */
  key: string;
  /** Libellé sous la barre : « 3 nov. », « nov. ». */
  shortLabel: string;
  /** Libellé complet (accessibilité) : « 3 – 9 nov. », « novembre 2026 ». */
  label: string;
  totalCents: number;
  savingsCents: number;
  count: number;
  current: boolean;
}

/** Les `count` dernières semaines (la semaine en cours en dernier), vides comprises. */
export function weeklyBars(entries: readonly SpendingEntry[], currentWeekStart: string, count = 6): ChartBar[] {
  const ws = startOfWeek(currentWeekStart);
  const byKey = new Map(spendingByWeek(entries).map((p) => [p.key, p]));
  const out: ChartBar[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const key = addDays(ws, -7 * i);
    const p = byKey.get(key);
    const [, m, d] = key.split('-').map(Number);
    out.push({
      key,
      shortLabel: `${d} ${MONTH_SHORT[m - 1]}`,
      label: formatWeekRange(key),
      totalCents: p?.totalCents ?? 0,
      savingsCents: p?.savingsCents ?? 0,
      count: p?.count ?? 0,
      current: i === 0,
    });
  }
  return out;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${nm < 10 ? '0' : ''}${nm}`;
}

/** Les `count` derniers mois (le mois en cours en dernier), vides compris. */
export function monthlyBars(entries: readonly SpendingEntry[], today: string, count = 6): ChartBar[] {
  const current = today.slice(0, 7);
  const byKey = new Map(spendingByMonth(entries).map((p) => [p.key, p]));
  const out: ChartBar[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const key = shiftMonth(current, -i);
    const p = byKey.get(key);
    out.push({
      key,
      shortLabel: MONTH_SHORT[Number(key.slice(5, 7)) - 1],
      label: formatMonthLabel(key),
      totalCents: p?.totalCents ?? 0,
      savingsCents: p?.savingsCents ?? 0,
      count: p?.count ?? 0,
      current: i === 0,
    });
  }
  return out;
}

/** Échelle du graphique : le plus grand total (et le budget de référence), arrondi à 10 € au-dessus. */
export function chartMaxCents(bars: readonly ChartBar[], referenceCents = 0): number {
  const max = Math.max(0, referenceCents || 0, ...bars.map((b) => b.totalCents));
  if (max <= 0) return 1000;
  return Math.ceil(max / 1000) * 1000;
}

/** Moyenne des périodes passées qui ont au moins une dépense (null si aucune). */
export function averageCents(bars: readonly ChartBar[]): number | null {
  const filled = bars.filter((b) => !b.current && b.count > 0);
  if (filled.length === 0) return null;
  return Math.round(filled.reduce((s, b) => s + b.totalCents, 0) / filled.length);
}

// ─── Semaine en cours ────────────────────────────────────────────────────────

export interface BudgetStatusLike {
  spentCents: number;
  remainingCents: number;
  ratio: number;
  over: boolean;
  budgetCents: number;
}

export type BudgetTone = 'neutral' | 'success' | 'accent';

export interface BudgetMessage {
  tone: BudgetTone;
  title: string;
  body: string;
}

/** Message de la semaine : chiffres d'abord, ton bienveillant, aucune culpabilisation. */
export function budgetMessage(s: BudgetStatusLike): BudgetMessage {
  if (s.budgetCents <= 0) {
    return { tone: 'neutral', title: 'Pas encore de budget', body: 'Fixe un budget dans ton profil : Cabas composera tes menus avec.' };
  }
  if (s.spentCents <= 0) {
    return { tone: 'success', title: `${formatPrice(s.budgetCents)} devant toi`, body: 'Rien de dépensé pour l’instant cette semaine.' };
  }
  if (s.over) {
    return {
      tone: 'accent',
      title: `${formatPrice(s.spentCents - s.budgetCents)} au-dessus`,
      body: 'Ça arrive ! Tu peux ajuster ton budget dans ton profil.',
    };
  }
  if (s.ratio >= 0.85) {
    return { tone: 'accent', title: `Il te reste ${formatPrice(s.remainingCents)}`, body: 'Presque pile dans ton budget : bien joué.' };
  }
  return { tone: 'success', title: `Il te reste ${formatPrice(s.remainingCents)}`, body: 'Tu gardes une belle marge cette semaine.' };
}

/** Phrase courte pour le raccourci « Budget » du profil. */
export function budgetShortcutSubtitle(s: BudgetStatusLike, premium: boolean): string {
  if (!premium) return 'Dépenses et économies';
  if (s.budgetCents <= 0) return 'Suis tes dépenses de courses';
  if (s.spentCents <= 0) return `${formatPrice(s.budgetCents, { compact: true })} de budget cette semaine`;
  if (s.over) return `${formatPrice(s.spentCents - s.budgetCents)} au-dessus cette semaine`;
  return `Il te reste ${formatPrice(s.remainingCents)}`;
}

// ─── Saisie d'une dépense ────────────────────────────────────────────────────

/** Plafond d'une dépense saisie à la main (garde-fou de frappe). */
export const MAX_MANUAL_SPENDING_CENTS = 200_000;

export type AmountParse = { ok: true; cents: number } | { ok: false; message: string | null };

/** « 42,50 » → 4250. `message` null tant que le champ est vide (pas d'erreur affichée). */
export function parseAmountInput(input: string): AmountParse {
  const raw = input.trim();
  if (!raw) return { ok: false, message: null };
  const cents = parsePriceToCents(raw);
  if (cents === null) return { ok: false, message: 'Écris un montant, par exemple 42,50.' };
  if (cents <= 0) return { ok: false, message: 'Le montant doit être supérieur à 0 €.' };
  if (cents > MAX_MANUAL_SPENDING_CENTS) return { ok: false, message: `Au-delà de ${formatPrice(MAX_MANUAL_SPENDING_CENTS, { compact: true })}, vérifie le montant.` };
  return { ok: true, cents };
}

/**
 * Message du toast après l'ajout : la dépense compte dans la semaine en cours,
 * ou dans une semaine passée si le jour choisi tombe avant lundi.
 */
export function spendingAddedMessage(totalCents: number, date: string, currentWeekStart: string): string {
  const week = startOfWeek(date);
  if (week === startOfWeek(currentWeekStart)) return `${formatPrice(totalCents)} comptés dans ta semaine.`;
  const range = formatWeekRange(week);
  // « nov. » porte déjà le point final ; « mai », « juin »… non.
  return `${formatPrice(totalCents)} ajoutés à la semaine du ${range}${range.endsWith('.') ? '' : '.'}`;
}

/** Jours proposés pour une dépense (aujourd'hui en premier). */
export function recentDayChoices(today: string, count = 7): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const iso = addDays(today, -i);
    const rel = relativeDayLabel(iso, today, 'short');
    out.push({ value: iso, label: rel === "Aujourd'hui" ? 'Aujourd’hui' : rel });
  }
  return out;
}

// ─── Lignes de dépenses ──────────────────────────────────────────────────────

/** Nom de l'enseigne (« Leclerc »), sinon l'identifiant. */
export function storeLabel(storeId: string, storesById: Record<string, Store | undefined>): string {
  const store = storesById[storeId];
  if (!store) return storeId.charAt(0).toUpperCase() + storeId.slice(1);
  return STORE_CHAIN_LABELS[store.chain] ?? store.name;
}

/** « Sam. 7 nov. » (ou « Aujourd’hui », « Hier »). */
export function shortDayLabel(iso: string, today: string): string {
  const rel = relativeDayLabel(iso, today, 'long');
  if (rel === "Aujourd'hui") return 'Aujourd’hui';
  if (rel === 'Hier' || rel === 'Demain') return rel;
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  const wd = WEEKDAY_SHORT[weekdayIndex(iso)];
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${d === 1 ? '1er' : d} ${MONTH_SHORT[m - 1]}`;
}

/** Titre (libellé, sinon enseigne), jour et origine d'une ligne de dépense. */
export function entryTexts(
  entry: SpendingEntry,
  storesById: Record<string, Store | undefined>,
  today: string,
): { title: string; day: string; source: string; store: string } {
  const store = storeLabel(entry.storeId, storesById);
  const label = entry.label?.trim();
  return {
    title: label ? label : store,
    day: shortDayLabel(entry.date, today),
    source: entry.source === 'order' ? 'Commande' : 'Ajout manuel',
    store,
  };
}

/** Date longue d'une dépense pour l'accessibilité. */
export function entryDayLabel(entry: SpendingEntry): string {
  return formatDayLabel(entry.date, 'long');
}

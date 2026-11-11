// GENERATED — do not edit.
// Copie générée de src/core par scripts/sync-shared.mjs (npm run sync:shared).
// Toute modification doit être faite dans src/core puis resynchronisée.
/**
 * (V2) Suivi du budget : dépenses par semaine et par mois, reste à dépenser,
 * économies réalisées grâce au comparateur.
 */
import type { OrderHandoff, SpendingEntry } from './types.ts';
import { addDays, formatMonthLabel, formatWeekRange, localISODate, startOfWeek } from './dates.ts';
import { createId } from './ids.ts';

export interface SpendingPeriod {
  /** Lundi de la semaine (`YYYY-MM-DD`) ou mois (`YYYY-MM`). */
  key: string;
  /** « 8 – 14 sept. » ou « septembre 2026 ». */
  label: string;
  totalCents: number;
  savingsCents: number;
  count: number;
}

function groupBy(entries: readonly SpendingEntry[], keyOf: (e: SpendingEntry) => string, labelOf: (k: string) => string) {
  const map = new Map<string, SpendingPeriod>();
  for (const e of entries) {
    const key = keyOf(e);
    const p = map.get(key) ?? { key, label: labelOf(key), totalCents: 0, savingsCents: 0, count: 0 };
    p.totalCents += e.totalCents;
    p.savingsCents += e.savingsCents || 0;
    p.count += 1;
    map.set(key, p);
  }
  return Array.from(map.values()).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Dépenses par semaine (lundi), ordre chronologique. */
export function spendingByWeek(entries: readonly SpendingEntry[]): SpendingPeriod[] {
  return groupBy(entries, (e) => startOfWeek(e.date), formatWeekRange);
}

/** Dépenses par mois, ordre chronologique, libellés « septembre 2026 ». */
export function spendingByMonth(entries: readonly SpendingEntry[]): SpendingPeriod[] {
  return groupBy(entries, (e) => e.date.slice(0, 7), formatMonthLabel);
}

/** Situation de la semaine par rapport au budget. */
export function budgetStatus(
  entries: readonly SpendingEntry[],
  weeklyBudgetCents: number,
  weekStart: string,
): { spentCents: number; remainingCents: number; ratio: number; over: boolean } {
  const end = addDays(weekStart, 6);
  let spent = 0;
  for (const e of entries) {
    const d = e.date.slice(0, 10);
    if (d >= weekStart && d <= end) spent += e.totalCents;
  }
  const budget = Math.max(0, weeklyBudgetCents || 0);
  return {
    spentCents: spent,
    remainingCents: Math.max(0, budget - spent),
    ratio: budget > 0 ? spent / budget : 0,
    over: spent > budget,
  };
}

/** Total des économies réalisées. */
export function totalSavings(entries: readonly SpendingEntry[]): number {
  return entries.reduce((s, e) => s + (e.savingsCents || 0), 0);
}

/** Dépense issue d'une commande transmise, datée du jour LOCAL de `createdAt`. */
export function spendingFromHandoff(handoff: OrderHandoff, savingsCents = 0, label?: string): SpendingEntry {
  const entry: SpendingEntry = {
    id: `spend_${handoff.id}`,
    date: localISODate(handoff.createdAt),
    storeId: handoff.storeId,
    totalCents: handoff.totalCents,
    savingsCents: Math.max(0, savingsCents),
    source: 'order',
  };
  if (label) entry.label = label;
  return entry;
}

/** Dépense saisie à la main. */
export function createManualSpending(
  date: string,
  storeId: string,
  totalCents: number,
  opts: { label?: string; id?: string } = {},
): SpendingEntry {
  const entry: SpendingEntry = {
    id: opts.id ?? createId('spend'),
    date: date.slice(0, 10),
    storeId,
    totalCents: Math.max(0, Math.round(totalCents)),
    savingsCents: 0,
    source: 'manual',
  };
  if (opts.label) entry.label = opts.label;
  return entry;
}

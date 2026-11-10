/**
 * budgetStore — (V2) suivi des dépenses (persisté : `cabas/budget`).
 *
 * État : `entries: SpendingEntry[]` (plus récentes d'abord).
 * Actions :
 *  - `addEntry(entry)` (idempotent par id : une commande confirmée deux fois ne compte qu'une fois) ;
 *  - `addManualEntry({ date, storeId, totalCents, label? })` → SpendingEntry ;
 *  - `removeEntry(id)`, `setEntries(entries)` (sync), `reset()`.
 * Sélecteurs purs (core › budget) : `weekBudgetStatus(entries, budgetCents, weekStart)`,
 * `spendingWeeks(entries)`, `spendingMonths(entries)`, `savingsTotal(entries)`.
 * Hooks mémoïsés : `useBudgetStatus(weekStart?)`, `useSpendingByWeek()`,
 * `useSpendingByMonth()`, `useTotalSavings()`.
 */
import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { SpendingEntry } from '@/core';
import { budgetStatus, createManualSpending, spendingByMonth, spendingByWeek, totalSavings } from '@/core';
import { track } from '@/services/analytics';

import { useProfileStore } from './profileStore';
import { basePersistOptions, registerPersistedStore } from './registry';
import { useWeekStore } from './weekStore';

export interface BudgetState {
  hydrated: boolean;
  entries: SpendingEntry[];
  addEntry(entry: SpendingEntry): void;
  addManualEntry(input: { date: string; storeId: string; totalCents: number; label?: string }): SpendingEntry;
  removeEntry(id: string): void;
  setEntries(entries: SpendingEntry[]): void;
  reset(): void;
}

function sortEntries(entries: SpendingEntry[]): SpendingEntry[] {
  return entries.sort((a, b) => (a.date === b.date ? (a.id < b.id ? 1 : -1) : a.date < b.date ? 1 : -1));
}

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      entries: [],
      addEntry(entry) {
        const others = get().entries.filter((e) => e.id !== entry.id);
        set({ entries: sortEntries([...others, entry]) });
      },
      addManualEntry(input) {
        const entry = createManualSpending(input.date, input.storeId, input.totalCents, { label: input.label });
        get().addEntry(entry);
        track('budget_entry_added', { source: 'manual', totalCents: entry.totalCents });
        return entry;
      },
      removeEntry(id) {
        set({ entries: get().entries.filter((e) => e.id !== id) });
      },
      setEntries(entries) {
        set({ entries: sortEntries(entries.slice()) });
      },
      reset() {
        set({ entries: [] });
      },
    }),
    {
      ...basePersistOptions<Partial<BudgetState>>('budget'),
      partialize: (s) => ({ entries: s.entries }),
    },
  ),
);

registerPersistedStore('budget', useBudgetStore);

// ─── Sélecteurs purs ─────────────────────────────────────────────────────────

export const weekBudgetStatus = budgetStatus;
export const spendingWeeks = spendingByWeek;
export const spendingMonths = spendingByMonth;
export const savingsTotal = totalSavings;

// ─── Hooks ───────────────────────────────────────────────────────────────────

/** Situation de la semaine (défaut : semaine active) par rapport au budget du profil. */
export function useBudgetStatus(weekStart?: string) {
  const entries = useBudgetStore((s) => s.entries);
  const budget = useProfileStore((s) => s.profile?.weeklyBudgetCents ?? 0);
  const active = useWeekStore((s) => s.activeWeekStart);
  const ws = weekStart ?? active;
  return useMemo(() => ({ ...budgetStatus(entries, budget, ws), budgetCents: budget, weekStart: ws }), [entries, budget, ws]);
}

export function useSpendingByWeek() {
  const entries = useBudgetStore((s) => s.entries);
  return useMemo(() => spendingByWeek(entries), [entries]);
}

export function useSpendingByMonth() {
  const entries = useBudgetStore((s) => s.entries);
  return useMemo(() => spendingByMonth(entries), [entries]);
}

export function useTotalSavings(): number {
  const entries = useBudgetStore((s) => s.entries);
  return useMemo(() => totalSavings(entries), [entries]);
}

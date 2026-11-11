/**
 * Suivi du budget (Premium `budget_tracking`) : briques de `src/app/budget.tsx`
 * et du raccourci « Budget » du profil.
 *
 * ```tsx
 * const ws = useWeekStore((s) => s.currentWeekStart);       // semaine EN COURS
 * <BudgetWeekCard status={useBudgetStatus(ws)} weekStart={ws} />
 * <SpendingChart bars={weeklyBars(entries, ws)} maxCents={chartMaxCents(bars, budget)} referenceCents={budget} />
 * <SavingsCard savingsCents={useTotalSavings()} orders={n} />
 * <AddSpendingSheet visible onSubmit={(i) => useBudgetStore.getState().addManualEntry(i)} … />
 * ```
 */
export { BudgetWeekCard, type BudgetWeekCardProps } from './BudgetWeekCard';
export { SpendingChart, type SpendingChartProps } from './SpendingChart';
export { SavingsCard, type SavingsCardProps } from './SavingsCard';
export { SpendingEntryRow, type SpendingEntryRowProps } from './SpendingEntryRow';
export { AddSpendingSheet, type AddSpendingSheetProps, type AddSpendingInput } from './AddSpendingSheet';
export { BudgetTeaser, SAMPLE_BARS, type BudgetTeaserProps } from './BudgetTeaser';
export * from './budgetView';

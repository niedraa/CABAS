import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import type { SpendingEntry } from '@/core';
import { stores as catalogStores, storesById } from '@/data';

import { AddSpendingSheet } from '../AddSpendingSheet';
import { BudgetTeaser } from '../BudgetTeaser';
import {
  averageCents,
  budgetMessage,
  budgetShortcutSubtitle,
  chartMaxCents,
  entryTexts,
  MAX_MANUAL_SPENDING_CENTS,
  monthlyBars,
  parseAmountInput,
  recentDayChoices,
  shortDayLabel,
  spendingAddedMessage,
  storeLabel,
  weeklyBars,
} from '../budgetView';
import { BudgetWeekCard } from '../BudgetWeekCard';
import { SavingsCard } from '../SavingsCard';
import { SpendingChart } from '../SpendingChart';
import { SpendingEntryRow } from '../SpendingEntryRow';

const NNBSP = ' ';

const entry = (over: Partial<SpendingEntry> = {}): SpendingEntry => ({
  id: 'spend_1',
  date: '2026-11-07',
  storeId: 'leclerc',
  totalCents: 10475,
  savingsCents: 1230,
  source: 'order',
  ...over,
});

const ENTRIES: SpendingEntry[] = [
  entry({ id: 'a', date: '2026-11-10', totalCents: 4250, savingsCents: 0, source: 'manual' }),
  entry({ id: 'b', date: '2026-11-07', totalCents: 10475, savingsCents: 1230 }),
  entry({ id: 'c', date: '2026-10-30', storeId: 'carrefour', totalCents: 12890, savingsCents: 540 }),
  entry({ id: 'd', date: '2026-09-02', totalCents: 5000, savingsCents: 0 }),
];

// ─── Graphique ───────────────────────────────────────────────────────────────

describe('barres du graphique', () => {
  it('6 dernières semaines, vides comprises, semaine en cours en dernier', () => {
    const bars = weeklyBars(ENTRIES, '2026-11-09');
    expect(bars.map((b) => b.key)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09']);
    expect(bars.map((b) => b.totalCents)).toEqual([0, 0, 0, 12890, 10475, 4250]);
    expect(bars[5]).toMatchObject({ current: true, shortLabel: '9 nov.', label: '9 – 15 nov.' });
    expect(bars[4].savingsCents).toBe(1230);
    expect(bars.filter((b) => b.current)).toHaveLength(1);
  });

  it('mois : vides compris, passage d’année', () => {
    const bars = monthlyBars(ENTRIES, '2026-11-10');
    expect(bars.map((b) => b.key)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    expect(bars.map((b) => b.totalCents)).toEqual([0, 0, 0, 5000, 12890, 14725]);
    expect(bars[5]).toMatchObject({ current: true, shortLabel: 'nov.', label: 'novembre 2026' });
    expect(monthlyBars([], '2027-02-01', 3).map((b) => b.key)).toEqual(['2026-12', '2027-01', '2027-02']);
  });

  it('échelle arrondie (budget compris) et moyenne des périodes passées', () => {
    const bars = weeklyBars(ENTRIES, '2026-11-09');
    expect(chartMaxCents(bars)).toBe(13000);
    expect(chartMaxCents(bars, 15000)).toBe(15000);
    expect(chartMaxCents([])).toBe(1000);
    // Moyenne : semaines passées non vides uniquement (la semaine en cours est incomplète).
    expect(averageCents(bars)).toBe(Math.round((12890 + 10475) / 2));
    expect(averageCents(weeklyBars([], '2026-11-09'))).toBeNull();
  });
});

// ─── Messages (bienveillants) ────────────────────────────────────────────────

describe('message de la semaine', () => {
  const s = (spent: number, budget = 12000) => ({
    spentCents: spent,
    remainingCents: Math.max(0, budget - spent),
    ratio: budget > 0 ? spent / budget : 0,
    over: spent > budget,
    budgetCents: budget,
  });

  it('chiffres d’abord, jamais de reproche', () => {
    expect(budgetMessage(s(0))).toMatchObject({ tone: 'success', title: `120,00${NNBSP}€ devant toi` });
    expect(budgetMessage(s(5000))).toMatchObject({ tone: 'success', title: `Il te reste 70,00${NNBSP}€` });
    expect(budgetMessage(s(11380))).toMatchObject({ tone: 'accent', title: `Il te reste 6,20${NNBSP}€` });
    const over = budgetMessage(s(12420));
    expect(over).toMatchObject({ tone: 'accent', title: `4,20${NNBSP}€ au-dessus` });
    for (const m of [budgetMessage(s(0)), budgetMessage(s(11380)), over, budgetMessage(s(0, 0))]) {
      expect(`${m.title} ${m.body}`).not.toMatch(/attention|dépassé|trop|!!!|erreur/i);
    }
    expect(budgetMessage(s(3000, 0)).title).toBe('Pas encore de budget');
    // Aucune promesse que le planificateur ne tient pas (il ne lit pas les dépenses).
    expect(over.body).toBe('Ça arrive ! Tu peux ajuster ton budget dans ton profil.');
  });

  it('phrase du raccourci « Budget »', () => {
    expect(budgetShortcutSubtitle(s(0), false)).toBe('Dépenses et économies');
    expect(budgetShortcutSubtitle(s(0), true)).toBe(`120${NNBSP}€ de budget cette semaine`);
    expect(budgetShortcutSubtitle(s(11380), true)).toBe(`Il te reste 6,20${NNBSP}€`);
    expect(budgetShortcutSubtitle(s(12420), true)).toBe(`4,20${NNBSP}€ au-dessus cette semaine`);
    expect(budgetShortcutSubtitle(s(10, 0), true)).toBe('Suis tes dépenses de courses');
  });
});

// ─── Saisie ──────────────────────────────────────────────────────────────────

describe('saisie d’une dépense', () => {
  it('lit les montants à la française', () => {
    expect(parseAmountInput('42,50')).toEqual({ ok: true, cents: 4250 });
    expect(parseAmountInput(' 12 € ')).toEqual({ ok: true, cents: 1200 });
    expect(parseAmountInput('')).toEqual({ ok: false, message: null });
    expect(parseAmountInput('abc')).toMatchObject({ ok: false, message: expect.stringMatching(/42,50/) });
    expect(parseAmountInput('0')).toMatchObject({ ok: false });
    expect(parseAmountInput(String(MAX_MANUAL_SPENDING_CENTS / 100 + 1))).toMatchObject({ ok: false });
  });

  it('toast d’ajout : semaine en cours, ou la semaine passée concernée', () => {
    // Mercredi 11 novembre : semaine du 9 au 15.
    expect(spendingAddedMessage(4250, '2026-11-11', '2026-11-09')).toBe(`42,50${NNBSP}€ comptés dans ta semaine.`);
    expect(spendingAddedMessage(4250, '2026-11-09', '2026-11-09')).toBe(`42,50${NNBSP}€ comptés dans ta semaine.`);
    // Dimanche 8 : semaine précédente, la carte « Cette semaine » ne bouge pas.
    expect(spendingAddedMessage(4250, '2026-11-08', '2026-11-09')).toBe(`42,50${NNBSP}€ ajoutés à la semaine du 2 – 8 nov.`);
    expect(spendingAddedMessage(1200, '2026-06-07', '2026-06-08')).toBe(`12,00${NNBSP}€ ajoutés à la semaine du 1 – 7 juin.`);
  });

  it('propose les 7 derniers jours', () => {
    const days = recentDayChoices('2026-11-10');
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ value: '2026-11-10', label: 'Aujourd’hui' });
    expect(days[1]).toEqual({ value: '2026-11-09', label: 'Hier' });
    expect(days[2]).toEqual({ value: '2026-11-08', label: 'dim. 8' });
  });

  it('libellés des lignes', () => {
    expect(storeLabel('leclerc', storesById)).toBe('E.Leclerc');
    expect(storeLabel('marche', storesById)).toBe('Marche');
    expect(shortDayLabel('2026-11-07', '2026-11-10')).toBe('Sam. 7 nov.');
    expect(shortDayLabel('2026-11-10', '2026-11-10')).toBe('Aujourd’hui');
    expect(entryTexts(entry(), storesById, '2026-11-10')).toEqual({ title: 'E.Leclerc', day: 'Sam. 7 nov.', source: 'Commande', store: 'E.Leclerc' });
    expect(entryTexts(entry({ label: ' Marché ', source: 'manual' }), storesById, '2026-11-10')).toMatchObject({
      title: 'Marché',
      source: 'Ajout manuel',
    });
  });
});

// ─── Composants ──────────────────────────────────────────────────────────────

describe('composants du budget', () => {
  it('SpendingChart : chaque barre est lue en clair, légende du budget', async () => {
    const bars = weeklyBars(ENTRIES, '2026-11-09');
    await render(<SpendingChart bars={bars} maxCents={chartMaxCents(bars, 12000)} referenceCents={12000} />);
    expect(screen.getByTestId('bar-2026-10-26').props.accessibilityLabel).toBe(
      '26 oct. – 1 nov. : 128 euros 90, dont 5 euros 40 économisés',
    );
    expect(screen.getByTestId('bar-2026-10-05').props.accessibilityLabel).toMatch(/aucune dépense/);
    expect(screen.getByText(`Budget hebdo : 120${NNBSP}€`)).toBeTruthy();
  });

  it('SpendingEntryRow : montant, économie, suppression', async () => {
    const onRemove = jest.fn();
    await render(<SpendingEntryRow entry={entry()} storesById={storesById} today="2026-11-10" onRemove={onRemove} testID="row" />);
    expect(screen.getByText(`104,75${NNBSP}€`)).toBeTruthy();
    expect(screen.getByText(`−12,30${NNBSP}€`)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Supprimer la dépense E.Leclerc' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('BudgetWeekCard : pourcentage et message', async () => {
    await render(
      <BudgetWeekCard status={{ spentCents: 6000, remainingCents: 6000, ratio: 0.5, over: false, budgetCents: 12000 }} weekStart="2026-11-09" />,
    );
    expect(screen.getByText(`50${NNBSP}%`)).toBeTruthy();
    expect(screen.getByTestId('budget-week-title').props.children).toBe(`Il te reste 60,00${NNBSP}€`);
    expect(screen.getByText(/9 – 15 nov\./)).toBeTruthy();
  });

  it('SavingsCard : chiffres ou promesse', async () => {
    const { rerender } = await render(<SavingsCard savingsCents={2630} orders={3} />);
    expect(screen.getByText(/économisés grâce au comparateur · 3 commandes/)).toBeTruthy();
    await rerender(<SavingsCard savingsCents={0} orders={0} />);
    expect(screen.getByText('Tes économies, bientôt ici')).toBeTruthy();
  });

  it('BudgetTeaser : invitation Premium et économies déjà faites', async () => {
    const onUpgrade = jest.fn();
    await render(<BudgetTeaser savingsCents={2630} trialDays={7} onUpgrade={onUpgrade} />);
    expect(screen.getByText(`26,30${NNBSP}€ déjà économisés avec Cabas`)).toBeTruthy();
    // Graphique d'exemple sans montants (même là où le flou retombe sur un simple voile).
    expect(screen.queryByText(`98${NNBSP}€`)).toBeNull();
    expect(screen.queryByText(/Budget hebdo/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Essayer 7 jours gratuits' }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('AddSpendingSheet : bouton actif dès que le montant est lisible, envoie la saisie', async () => {
    const onSubmit = jest.fn();
    await render(
      <AddSpendingSheet visible onClose={jest.fn()} onSubmit={onSubmit} stores={catalogStores} today="2026-11-10" />,
      { wrapper: GestureHandlerRootView },
    );
    const submit = screen.getByTestId('add-spending-submit');
    expect(submit).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('add-spending-amount'), '42,5');
    await fireEvent.press(screen.getByTestId(`add-spending-store-${catalogStores[1].id}`));
    await fireEvent.press(screen.getByTestId('add-spending-day-2026-11-09'));
    await fireEvent.changeText(screen.getByTestId('add-spending-label'), '  Marché  ');
    expect(screen.getByTestId('add-spending-submit')).not.toBeDisabled();
    await fireEvent.press(screen.getByTestId('add-spending-submit'));
    expect(onSubmit).toHaveBeenCalledWith({ date: '2026-11-09', storeId: catalogStores[1].id, totalCents: 4250, label: 'Marché' });
  });

  it('AddSpendingSheet : montant illisible → message, pas d’envoi', async () => {
    const onSubmit = jest.fn();
    await render(
      <AddSpendingSheet visible onClose={jest.fn()} onSubmit={onSubmit} stores={catalogStores} today="2026-11-10" />,
      { wrapper: GestureHandlerRootView },
    );
    await fireEvent.changeText(screen.getByTestId('add-spending-amount'), 'douze');
    expect(screen.getByText('Écris un montant, par exemple 42,50.')).toBeTruthy();
    expect(screen.getByTestId('add-spending-submit')).toBeDisabled();
  });
});

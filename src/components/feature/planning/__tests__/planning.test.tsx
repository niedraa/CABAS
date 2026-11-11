import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as RN from 'react-native';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import type { PlannedMeal, Recipe } from '@/core';
import { recipes } from '@/data';

import { DayStrip, type DayStripDay } from '../DayStrip';
import { GENERATING_STEPS, GeneratingBanner } from '../GeneratingBanner';
import { listReadyCopy } from '../ListReadyCard';
import { MealCard } from '../MealCard';
import {
  dampenSwipe,
  shouldSwapOnRelease,
  swipeProgress,
  swipeThreshold,
  SWIPE_MAX_THRESHOLD,
  SWIPE_MIN_THRESHOLD,
} from '../swipe';
import { computeWeekStats, estimateMealCostCents, firstNameOf, greetingFor, listEstimateCents, openSlotsOf } from '../weekStats';

// ─── Glisser pour remplacer (logique pure) ───────────────────────────────────

describe('swipe', () => {
  it('borne le seuil entre le minimum et le maximum', () => {
    expect(swipeThreshold(0)).toBe(SWIPE_MIN_THRESHOLD);
    expect(swipeThreshold(NaN)).toBe(SWIPE_MIN_THRESHOLD);
    expect(swipeThreshold(350)).toBeCloseTo(126);
    expect(swipeThreshold(2000)).toBe(SWIPE_MAX_THRESHOLD);
  });

  it('remplace seulement vers la gauche, au-delà du seuil', () => {
    const w = 350; // seuil 126
    expect(shouldSwapOnRelease(-130, 0, w)).toBe(true);
    expect(shouldSwapOnRelease(-126, 0, w)).toBe(true);
    expect(shouldSwapOnRelease(-100, 0, w)).toBe(false);
    expect(shouldSwapOnRelease(200, 0, w)).toBe(false);
    expect(shouldSwapOnRelease(0, -3000, w)).toBe(false);
  });

  it('accepte un coup sec rapide à mi-course, pas un effleurement', () => {
    const w = 350;
    expect(shouldSwapOnRelease(-60, -1200, w)).toBe(true);
    expect(shouldSwapOnRelease(-30, -1200, w)).toBe(false); // < 40 % du seuil
    expect(shouldSwapOnRelease(-60, -300, w)).toBe(false); // trop lent
  });

  it('calcule l’avancement et freine le déplacement', () => {
    expect(swipeProgress(-63, 350)).toBeCloseTo(0.5);
    expect(swipeProgress(-500, 350)).toBe(1);
    expect(swipeProgress(40, 350)).toBe(0);
    expect(dampenSwipe(-50, 350)).toBe(-50);
    // Vers la droite : quasi immobile.
    expect(dampenSwipe(100, 350)).toBeLessThanOrEqual(24);
    // Au-delà du seuil : la carte avance moins vite que le doigt.
    const far = dampenSwipe(-300, 350);
    expect(far).toBeLessThan(-126);
    expect(far).toBeGreaterThan(-300);
    expect(dampenSwipe(NaN, 350)).toBe(0);
  });
});

// ─── Statistiques de la semaine ──────────────────────────────────────────────

const byId = Object.fromEntries(recipes.map((r) => [r.id, r])) as Record<string, Recipe>;
const r1 = recipes[0];
const r2 = recipes[1];
const meal = (over: Partial<PlannedMeal> = {}): PlannedMeal => ({
  id: 'm1',
  date: '2026-11-09',
  type: 'diner',
  recipeId: r1.id,
  servings: 3,
  reason: 'Rapide : 30 min · Petit budget',
  ...over,
});

describe('weekStats', () => {
  it('estime le coût d’un repas selon le niveau de prix et les portions', () => {
    expect(estimateMealCostCents({ costLevel: 1 }, 3)).toBe(540);
    expect(estimateMealCostCents({ costLevel: 3 }, 0)).toBe(430);
    expect(estimateMealCostCents(undefined, 3)).toBe(0);
  });

  it('additionne le budget, la moyenne de temps, et préfère le vrai panier', () => {
    const meals = [meal(), meal({ id: 'm2', recipeId: r2.id, servings: 2 })];
    const s = computeWeekStats(meals, byId);
    expect(s.meals).toBe(2);
    expect(s.budgetIsEstimate).toBe(true);
    expect(s.budgetCents).toBe(estimateMealCostCents(r1, 3) + estimateMealCostCents(r2, 2));
    expect(s.avgMinutes).toBe(Math.round((r1.prepTimeMin + r1.cookTimeMin + r2.prepTimeMin + r2.cookTimeMin) / 2));
    const withBasket = computeWeekStats(meals, byId, { cents: 4321, exact: true });
    expect(withBasket.budgetCents).toBe(4321);
    expect(withBasket.budgetIsEstimate).toBe(false);
    expect(computeWeekStats([], byId, { cents: 4321, exact: true }).budgetIsEstimate).toBe(true);
    const fromList = computeWeekStats(meals, byId, { cents: 5000, exact: false });
    expect(fromList).toMatchObject({ budgetCents: 5000, budgetIsEstimate: true });
    expect(listEstimateCents([{ best: { totalCents: 120 } }, {}, { best: { totalCents: 80 } }])).toBe(200);
    expect(listEstimateCents([{}])).toBeNull();
  });

  it('liste les créneaux encore libres du profil', () => {
    const profile = { mealSlots: [{ weekday: 0 as const, type: 'diner' as const }, { weekday: 1 as const, type: 'diner' as const }] };
    const open = openSlotsOf(profile, '2026-11-09', [meal()]);
    expect(open).toEqual([{ date: '2026-11-10', type: 'diner' }]);
    expect(openSlotsOf(null, '2026-11-09', [])).toEqual([]);
  });

  it('ignore les créneaux des jours passés (ni « Ajouter » ni « Débloquer » pour hier)', () => {
    const profile = { mealSlots: [0, 1, 2, 3].map((weekday) => ({ weekday: weekday as 0 | 1 | 2 | 3, type: 'diner' as const })) };
    // Mercredi 11 : lundi et mardi sont passés, mercredi (aujourd'hui) reste ouvert.
    expect(openSlotsOf(profile, '2026-11-09', [], '2026-11-11')).toEqual([
      { date: '2026-11-11', type: 'diner' },
      { date: '2026-11-12', type: 'diner' },
    ]);
  });

  it('carte « liste » : prête, terminée (tout coché) ou à préparer', () => {
    expect(listReadyCopy(3, 12)).toEqual({ title: 'Ma liste est prête', subtitle: '3 articles' });
    expect(listReadyCopy(0, 12)).toEqual({ title: 'Courses terminées', subtitle: 'Tout est coché' });
    expect(listReadyCopy(0, 0)).toEqual({ title: 'Préparer ma liste', subtitle: 'Générée depuis tes repas' });
    expect(listReadyCopy(0)).toEqual({ title: 'Préparer ma liste', subtitle: 'Générée depuis tes repas' });
  });

  it('salue par le prénom', () => {
    expect(firstNameOf('  Camille Martin ')).toBe('Camille');
    expect(greetingFor('Camille')).toBe('Salut Camille');
    expect(greetingFor('')).toBe('Salut !');
  });
});

// ─── MealCard ────────────────────────────────────────────────────────────────

async function renderCard(over: Partial<PlannedMeal> = {}) {
  const handlers = {
    onOpen: jest.fn(),
    onToggleLock: jest.fn(),
    onSwipeSwap: jest.fn(),
    onOpenSwap: jest.fn(),
    onOpenMenu: jest.fn(),
  };
  const utils = await render(<MealCard meal={meal(over)} recipe={r1} testID="card" {...handlers} />, { wrapper: GestureHandlerRootView });
  return { ...handlers, utils };
}

describe('MealCard', () => {
  it('affiche le type de repas, le titre, le temps et les portions', async () => {
    await renderCard();
    expect(screen.getByText('Soir')).toBeTruthy();
    expect(screen.getByText(r1.title)).toBeTruthy();
    expect(screen.getByText(`${r1.prepTimeMin + r1.cookTimeMin} min`)).toBeTruthy();
    expect(screen.getByText('3 pers.')).toBeTruthy();
  });

  it('accorde « portion » au singulier pour un foyer d’une personne', async () => {
    await renderCard({ servings: 1 });
    expect(screen.getByTestId('card-open').props.accessibilityLabel).toMatch(/, 1 portion$/);
    expect(screen.getByLabelText('1 portion')).toBeTruthy();
  });

  it('ouvre la recette au toucher', async () => {
    const h = await renderCard();
    await fireEvent.press(screen.getByTestId('card-open'));
    expect(h.onOpen).toHaveBeenCalledTimes(1);
  });

  it('bascule le verrou (libellé et état accessibles)', async () => {
    const h = await renderCard();
    const lock = screen.getByRole('button', { name: 'Verrouiller ce plat' });
    await fireEvent.press(lock);
    expect(h.onToggleLock).toHaveBeenCalledTimes(1);
    await h.utils.rerender(<MealCard meal={meal({ locked: true })} recipe={r1} testID="card" {...h} />);
    expect(screen.getByRole('button', { name: 'Déverrouiller ce plat' })).toBeTruthy();
  });

  it('déplie la raison avec « Pourquoi ? »', async () => {
    await renderCard();
    expect(screen.queryByText('Rapide : 30 min · Petit budget')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Pourquoi ce plat ?' }));
    expect(screen.getByText('Rapide : 30 min · Petit budget')).toBeTruthy();
  });

  it('propose le remplacement (icône, options, action d’accessibilité)', async () => {
    const h = await renderCard();
    await fireEvent.press(screen.getByTestId('card-swap'));
    expect(h.onOpenSwap).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('card-menu'));
    expect(h.onOpenMenu).toHaveBeenCalledTimes(1);
    await fireEvent(screen.getByTestId('card-open'), 'accessibilityAction', { nativeEvent: { actionName: 'swap' } });
    expect(h.onSwipeSwap).toHaveBeenCalledTimes(1);
  });
});

// ─── Bandeau de génération ───────────────────────────────────────────────────

describe('GeneratingBanner', () => {
  it('la ligne qui défile suit la taille du texte du téléphone (plafonnée à 1,6×)', async () => {
    // Environnement de test React Native : fontScale = 2.
    expect(RN.Dimensions.get('window').fontScale).toBe(2);
    await render(<GeneratingBanner testID="gen" />);
    expect(StyleSheet.flatten(screen.getByTestId('gen-line').props.style).height).toBe(29); // 18 × 1,6
    expect(screen.getByText(GENERATING_STEPS[0]).props.maxFontSizeMultiplier).toBe(1.6);
  });
});

// ─── DayStrip ────────────────────────────────────────────────────────────────

const DAYS: DayStripDay[] = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'].map(
  (date, i) => ({ date, meals: i === 0 ? 2 : i === 3 ? 1 : 0, locked: i === 5 ? 1 : 0, isToday: i === 1, isPast: i === 0, label: date }),
);

describe('DayStrip', () => {
  it('affiche 7 jours, signale aujourd’hui et le jour choisi', async () => {
    await render(<DayStrip days={DAYS} selectedIndex={3} onSelect={() => undefined} testID="strip" />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(7);
    expect(screen.getByText('auj.')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(tabs[3]).toBeSelected();
    expect(tabs[0]).not.toBeSelected();
    expect(tabs[1].props.accessibilityLabel).toMatch(/^Aujourd’hui/);
    expect(tabs[0].props.accessibilityLabel).toMatch(/2 repas/);
  });

  it('appelle onSelect avec l’index touché', async () => {
    const onSelect = jest.fn();
    await render(<DayStrip days={DAYS} selectedIndex={0} onSelect={onSelect} testID="strip" />);
    await fireEvent.press(screen.getByTestId('strip-4'));
    expect(onSelect).toHaveBeenCalledWith(4);
  });
});

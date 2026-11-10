import React, { useState } from 'react';
import { Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { Ingredient, Recipe } from '@/core';
import { ingredients, recipes } from '@/data';

import { alternativeReasons } from '../AlternativeRow';
import { clampStep, CookingModeContent } from '../CookingMode';
import { IngredientChecklist } from '../IngredientChecklist';
import { allergenBadges, compatibleDiets, formatMinutes, scaledIngredientLines } from '../recipeInfo';
import {
  createTimer,
  formatCountdown,
  formatCountdownA11y,
  pauseTimer,
  remainingAt,
  startTimer,
  tickTimer,
  timerProgress,
} from '../timer';

const ingredientsById = Object.fromEntries(ingredients.map((i) => [i.id, i])) as Record<string, Ingredient>;
const curry = recipes.find((r) => r.id === 'rec_curry_pois_chiches') as Recipe;

// ─── Portions & informations ─────────────────────────────────────────────────

describe('scaledIngredientLines', () => {
  it('met les quantités à l’échelle des portions, en français naturel', () => {
    const base = scaledIngredientLines(curry, curry.servings, ingredientsById);
    const double = scaledIngredientLines(curry, curry.servings * 2, ingredientsById);
    expect(base[0].text).toMatch(/^530 g de pois chiches/);
    expect(double[0].text).toMatch(/^1,1 kg de pois chiches/);
    expect(base[1].text).toMatch(/^40 cl de lait de coco/);
    expect(double[1].text).toMatch(/^80 cl de lait de coco/);
    // Les pièces sont arrondies à la demi-unité supérieure.
    const onion = scaledIngredientLines(curry, 3, ingredientsById).find((l) => l.ingredientId === 'oignon_jaune');
    expect(onion?.text).toBe('1 oignon jaune');
    // Portions illisibles : on garde celles de la recette.
    expect(scaledIngredientLines(curry, NaN, ingredientsById)[0].text).toBe(base[0].text);
  });

  it('déduit allergènes et régimes des ingrédients', () => {
    const omelette = recipes.find((r) => r.ingredients.some((i) => i.ingredientId === 'oeuf')) as Recipe;
    const badges = allergenBadges(omelette, ingredientsById, ['oeufs']);
    expect(badges[0]).toMatchObject({ allergen: 'oeufs', conflict: true });
    expect(compatibleDiets(omelette, ingredientsById)).not.toContain('vegan');
    expect(compatibleDiets(curry, ingredientsById)).toEqual(expect.arrayContaining(['vegetarien', 'vegan']));
  });

  it('formate les durées', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(75)).toBe('1 h 15');
    expect(formatMinutes(65)).toBe('1 h 05');
  });

  it('explique une alternative et rappelle la garantie allergènes', () => {
    const r = alternativeReasons(curry, { favoriteCuisines: ['indienne'], allergens: ['arachides'], maxCookTimeWeekdayMin: 30 }, null);
    expect(r.why[0]).toBe('Cuisine indienne, ta préférée');
    expect(r.safety).toBe('Sans arachides');
    expect(alternativeReasons(curry, null).safety).toBeNull();
  });
});

function ChecklistHarness() {
  const [servings, setServings] = useState(4);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const lines = scaledIngredientLines(curry, servings, ingredientsById);
  return (
    <>
      <IngredientChecklist lines={lines} checked={checked} onToggle={(k, v) => setChecked((s) => ({ ...s, [k]: v }))} testID="ing" />
      <Text onPress={() => setServings(8)}>8 portions</Text>
    </>
  );
}
describe('IngredientChecklist', () => {
  it('affiche les quantités recalculées quand les portions changent, et garde les coches', async () => {
    await render(<ChecklistHarness />);
    expect(screen.getByText(/^530 g de pois chiches/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('ing-0'));
    expect(screen.getByTestId('ing-0')).toBeChecked();
    await fireEvent.press(screen.getByText('8 portions'));
    expect(screen.queryByText(/^530 g de pois chiches/)).toBeNull();
    expect(screen.getByText(/^1,1 kg de pois chiches/)).toBeTruthy();
    expect(screen.getByTestId('ing-0')).toBeChecked();
  });
});

// ─── Minuteur (logique pure) ─────────────────────────────────────────────────

describe('timer', () => {
  it('démarre, avance, se met en pause et se termine', () => {
    let s = createTimer(60);
    expect(s).toMatchObject({ status: 'idle', remainingMs: 60_000 });
    s = startTimer(s, 1_000);
    expect(s).toMatchObject({ status: 'running', endsAt: 61_000 });
    s = tickTimer(s, 31_000);
    expect(s.remainingMs).toBe(30_000);
    expect(timerProgress(s, 31_000)).toBeCloseTo(0.5);
    s = pauseTimer(s, 41_000);
    expect(s).toMatchObject({ status: 'paused', remainingMs: 20_000, endsAt: null });
    expect(remainingAt(s, 999_999)).toBe(20_000);
    s = startTimer(s, 100_000);
    s = tickTimer(s, 120_000);
    expect(s).toMatchObject({ status: 'done', remainingMs: 0 });
    // Relancer après la fin repart de la durée totale.
    expect(startTimer(s, 0).remainingMs).toBe(60_000);
  });

  it('formate le compte à rebours', () => {
    expect(formatCountdown(65_000)).toBe('1:05');
    expect(formatCountdown(64_200)).toBe('1:05');
    expect(formatCountdown(3_725_000)).toBe('1:02:05');
    expect(formatCountdown(-5)).toBe('0:00');
    expect(formatCountdownA11y(65_000)).toBe('1 minute 5 secondes');
    expect(formatCountdownA11y(0)).toBe('0 seconde');
  });
});

// ─── Mode cuisine ────────────────────────────────────────────────────────────

const STEPS = [
  { text: 'Émince l’oignon.' },
  { text: 'Fais revenir 2 minutes.', timerMin: 2 },
  { text: 'Sers bien chaud.' },
];

describe('CookingMode', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('borne l’index d’étape', () => {
    expect(clampStep(-3, 4)).toBe(0);
    expect(clampStep(9, 4)).toBe(4);
    expect(clampStep(NaN, 4)).toBe(0);
  });

  it('navigue entre les étapes (boutons et pastilles) jusqu’à « C’est prêt »', async () => {
    const onClose = jest.fn();
    await render(
      <GestureHandlerRootView>
        <CookingModeContent title="Curry" emoji="🍛" steps={STEPS} onClose={onClose} />
      </GestureHandlerRootView>,
    );
    const tabs = () => screen.getAllByRole('tab');
    expect(tabs()[0]).toBeSelected();
    expect(screen.getByTestId('cooking-mode-prev')).toBeDisabled();

    await fireEvent.press(screen.getByTestId('cooking-mode-next'));
    expect(tabs()[1]).toBeSelected();
    await fireEvent.press(screen.getByTestId('cooking-mode-prev'));
    expect(tabs()[0]).toBeSelected();

    await fireEvent.press(screen.getByTestId('cooking-mode-dot-2'));
    expect(tabs()[2]).toBeSelected();
    expect(screen.getByRole('button', { name: 'Terminer la recette' })).toBeTruthy();
    await fireEvent.press(screen.getByTestId('cooking-mode-next'));
    expect(screen.getByText('C’est prêt !')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('cooking-mode-finish'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lance le minuteur d’une étape et prévient à l’échéance', async () => {
    jest.setSystemTime(new Date('2026-11-10T18:00:00Z'));
    await render(
      <GestureHandlerRootView>
        <CookingModeContent title="Curry" steps={STEPS} initialStep={1} onClose={() => undefined} />
      </GestureHandlerRootView>,
    );
    const value = () => screen.getByTestId('cooking-mode-step-1-timer-value');
    expect(value()).toHaveTextContent('2:00');

    await fireEvent.press(screen.getByTestId('cooking-mode-step-1-timer-toggle'));
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(value()).toHaveTextContent('1:30');

    // Pause : le temps ne bouge plus.
    await fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
    await act(async () => {
      jest.advanceTimersByTime(20_000);
    });
    expect(value()).toHaveTextContent('1:30');

    await fireEvent.press(screen.getByRole('button', { name: 'Reprendre' }));
    expect(screen.queryByTestId('cooking-mode-notice')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(91_000);
    });
    expect(value()).toHaveTextContent('0:00');
    expect(screen.getByText('Minuteur terminé')).toBeTruthy();
    expect(screen.getByTestId('cooking-mode-notice')).toBeTruthy();
  });
});

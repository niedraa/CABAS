/**
 * Sections du profil : temps de cuisine cohérents avec le moteur, texte
 * « rien de coché » aligné sur `core/constraints`, accessibilité (foyer,
 * cibles de 44 pt) et recherche « je n'aime pas » ramenée en vue.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DEFAULT_DRAFT } from '@/stores';
import { DEFAULT_MEAL_SLOTS, generateMealPlan, type Household } from '@/core';
import { ingredients, ingredientsById, recipes, recipesById } from '@/data';
import { ThemeProvider } from '@/theme';

import { BudgetTimeSection } from '../BudgetTimeSection';
import { DietAllergySection, type DietAllergyValue } from '../DietAllergySection';
import { EquipmentCuisineSection } from '../EquipmentCuisineSection';
import { HouseholdSection } from '../HouseholdSection';
import { MealSlotsSection } from '../MealSlotsSection';
import {
  equipmentSummary,
  householdA11yLabel,
  nearestCookTime,
  NO_EQUIPMENT_HINT,
  NO_EQUIPMENT_SUMMARY,
  normalizeCookTimes,
} from '../profileOptions';

function wrap(node: React.ReactNode) {
  return (
    <GestureHandlerRootView>
      <ThemeProvider preference="light">{node}</ThemeProvider>
    </GestureHandlerRootView>
  );
}

// ─── Temps de cuisine ────────────────────────────────────────────────────────

describe('temps de cuisine', () => {
  it('normalise sur les tuiles affichées : 60 min (ancien défaut) devient « 60+ » = 120', () => {
    expect(nearestCookTime(60)).toBe(120);
    expect(normalizeCookTimes({ maxCookTimeWeekdayMin: 30, maxCookTimeWeekendMin: 60 })).toEqual({
      maxCookTimeWeekdayMin: 30,
      maxCookTimeWeekendMin: 120,
    });
    expect(normalizeCookTimes({ maxCookTimeWeekdayMin: 20, maxCookTimeWeekendMin: 90 })).toEqual({
      maxCookTimeWeekdayMin: 15,
      maxCookTimeWeekendMin: 120,
    });
    // Déjà sur une tuile : même objet (aucune écriture inutile).
    const ok = { maxCookTimeWeekdayMin: 45, maxCookTimeWeekendMin: 120, weeklyBudgetCents: 8000 };
    expect(normalizeCookTimes(ok)).toBe(ok);
  });

  it('toucher « 60+ » quand 60 est stocké enregistre bien 120', async () => {
    const onChange = jest.fn();
    await render(
      wrap(<BudgetTimeSection value={{ weeklyBudgetCents: 8000, maxCookTimeWeekdayMin: 30, maxCookTimeWeekendMin: 60 }} onChange={onChange} />),
    );
    expect(screen.getByTestId('budget-time-weekend-120')).toBeChecked();
    await fireEvent.press(screen.getByTestId('budget-time-weekend-120'));
    expect(onChange).toHaveBeenLastCalledWith({ weeklyBudgetCents: 8000, maxCookTimeWeekdayMin: 30, maxCookTimeWeekendMin: 120 });
    // Toute modification de la section émet aussi les temps normalisés.
    await fireEvent.press(screen.getByTestId('budget-time-weekday-45'));
    expect(onChange).toHaveBeenLastCalledWith({ weeklyBudgetCents: 8000, maxCookTimeWeekdayMin: 45, maxCookTimeWeekendMin: 120 });
  });

  it('valeur déjà sur la tuile : rien n’est émis', async () => {
    const onChange = jest.fn();
    await render(
      wrap(<BudgetTimeSection value={{ weeklyBudgetCents: 8000, maxCookTimeWeekdayMin: 30, maxCookTimeWeekendMin: 120 }} onChange={onChange} />),
    );
    await fireEvent.press(screen.getByTestId('budget-time-weekend-120'));
    await fireEvent.press(screen.getByTestId('budget-time-weekday-30'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

// ─── Ustensiles ──────────────────────────────────────────────────────────────

describe('ustensiles', () => {
  it('rien de coché : le texte dit ce que le moteur applique (des plaques)', async () => {
    await render(wrap(<EquipmentCuisineSection value={{ equipment: [], favoriteCuisines: [] }} onChange={jest.fn()} />));
    expect(screen.getByText(NO_EQUIPMENT_HINT)).toBeTruthy();
    expect(screen.queryByText(/sans cuisson/)).toBeNull();
    expect(equipmentSummary([])).toBe(NO_EQUIPMENT_SUMMARY);
    expect(equipmentSummary(['four', 'plaques'])).toBe('Four et Plaques de cuisson');

    // Garde-fou : si le moteur change de règle, ce texte doit changer aussi.
    const profile = { ...DEFAULT_DRAFT, id: 'u', createdAt: '', updatedAt: '', equipment: [] };
    const plan = generateMealPlan({ profile, recipes, ingredientsById, weekStart: '2026-11-16', seed: 'eq' });
    const used = new Set(plan.meals.flatMap((m) => recipesById[m.recipeId].equipment ?? []));
    expect(used.has('plaques')).toBe(true);
  });
});

// ─── Foyer ───────────────────────────────────────────────────────────────────

describe('foyer', () => {
  it('le libellé lu inclut les portions, les emoji des compteurs sont masqués', async () => {
    const household: Household = { adults: 2, children: 1 };
    expect(householdA11yLabel(household)).toMatch(/^Ton foyer : 2 adultes, 1 enfant\. Cabas cuisinera pour environ \d+(,\d)? portions$/);
    await render(wrap(<HouseholdSection value={household} onChange={jest.fn()} testID="household" />));
    expect(screen.getByTestId('household-family').props.accessibilityLabel).toBe(householdA11yLabel(household));
    // L'emoji de chaque compteur est masqué ; ceux de l'illustration restent dans la vue groupée.
    for (const emoji of ['🧑', '🧒']) {
      const all = screen.getAllByText(emoji, { includeHiddenElements: true }).length;
      expect(screen.queryAllByText(emoji)).toHaveLength(all - 1);
    }
  });
});

// ─── Cibles tactiles ─────────────────────────────────────────────────────────

describe('cibles de 44 pt', () => {
  it('préréglages des créneaux et puces « je n’aime pas »', async () => {
    await render(wrap(<MealSlotsSection value={DEFAULT_MEAL_SLOTS} onChange={jest.fn()} />));
    for (const id of ['evenings', 'evenings_weekend', 'weekdays']) {
      expect(StyleSheet.flatten(screen.getByTestId(`slots-preset-${id}`).props.style).height).toBeGreaterThanOrEqual(44);
    }
    const value: DietAllergyValue = { diets: [], allergens: [], dislikedIngredientIds: [ingredients[0].id], healthDataConsentAt: null };
    await render(wrap(<DietAllergySection value={value} onChange={jest.fn()} ingredients={ingredients} />));
    expect(StyleSheet.flatten(screen.getByTestId(`diet-allergy-disliked-${ingredients[0].id}`).props.style).height).toBeGreaterThanOrEqual(44);
  });
});

// ─── Recherche « je n'aime pas » ─────────────────────────────────────────────

describe('recherche « je n’aime pas »', () => {
  const value: DietAllergyValue = { diets: [], allergens: [], dislikedIngredientIds: [], healthDataConsentAt: null };

  it('prévient l’écran au focus et quand « aucun résultat » apparaît', async () => {
    const onSearchFocus = jest.fn();
    const onSearchResults = jest.fn();
    await render(
      wrap(
        <DietAllergySection
          value={value}
          onChange={jest.fn()}
          ingredients={ingredients}
          onSearchFocus={onSearchFocus}
          onSearchResults={onSearchResults}
        />,
      ),
    );
    const field = screen.getByLabelText('Rechercher un ingrédient que tu n’aimes pas');
    await fireEvent(field, 'focus');
    expect(onSearchFocus).toHaveBeenCalledTimes(1);
    await fireEvent.changeText(field, 'zzzz');
    expect(screen.getByTestId('diet-allergy-no-match')).toBeTruthy();
    expect(onSearchResults).toHaveBeenCalledTimes(1);
    await fireEvent.changeText(field, 'tom');
    expect(onSearchResults).toHaveBeenCalledTimes(2);
  });
});

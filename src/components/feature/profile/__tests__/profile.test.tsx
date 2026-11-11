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
import { DEFAULT_MEAL_SLOTS, generateMealPlan, NNBSP, STORE_CHAIN_GROUPS, STORE_CHAINS, storeDisplayName, type Household } from '@/core';
import { ingredients, ingredientsById, recipes, recipesById, stores } from '@/data';
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
  STORES_MAX,
} from '../profileOptions';
import { groupStores, storeServiceLabels, StoresSection } from '../StoresSection';

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

// ─── Magasins (10 enseignes) ─────────────────────────────────────────────────

describe('StoresSection', () => {
  it('groupe les 10 enseignes : Hypers & supers, Discount, Proximité', () => {
    const groups = groupStores(stores);
    expect(groups.map((g) => g.label)).toEqual(['Hypers & supers', 'Discount', 'Proximité']);
    expect(groups.map((g) => g.stores.map((s) => s.id))).toEqual(STORE_CHAIN_GROUPS.map((g) => [...g.chains]));
    expect(groups.flatMap((g) => g.stores)).toHaveLength(STORE_CHAINS.length);
    // Enseigne inconnue (ancien cache) : « Autres enseignes », jamais perdue.
    const extra = { ...stores[0], id: 'biocoop', chain: 'biocoop' as never, name: 'Biocoop' };
    expect(groupStores([...stores, extra]).at(-1)).toMatchObject({ label: 'Autres enseignes', stores: [extra] });
  });

  it('dit le service depuis le mode de retrait et les frais (indicatifs)', () => {
    const base = stores.find((s) => s.id === 'leclerc') as (typeof stores)[number];
    expect(storeServiceLabels({ ...base, pickup: 'drive', driveFeeCents: 0, deliveryFeeCents: 690, minOrderCents: 0 })).toEqual({
      pickup: 'Drive gratuit',
      delivery: `Livraison ≈ 6,90${NNBSP}€`,
    });
    expect(storeServiceLabels({ ...base, pickup: 'click_collect', driveFeeCents: 0, deliveryFeeCents: null, minOrderCents: 6000 })).toEqual({
      pickup: `Click & collect · dès 60${NNBSP}€`,
      delivery: 'Pas de livraison',
    });
    expect(storeServiceLabels({ ...base, pickup: 'none', driveFeeCents: 0, deliveryFeeCents: null, minOrderCents: 0 }).pickup).toBe('Courses en magasin');
    expect(storeServiceLabels({ ...base, pickup: 'drive', driveFeeCents: 300, deliveryFeeCents: 0, minOrderCents: 0 })).toEqual({
      pickup: `Drive ≈ 3,00${NNBSP}€`,
      delivery: 'Livraison gratuite',
    });
    // Les vraies enseignes : chacune a un libellé de retrait et de livraison.
    for (const s of stores) {
      const l = storeServiceLabels(s);
      expect(l.pickup.length).toBeGreaterThan(0);
      expect(l.delivery).toEqual(s.deliveryFeeCents === null ? 'Pas de livraison' : s.deliveryFeeCents === 0 ? 'Livraison gratuite' : expect.stringMatching(/^Livraison ≈ /));
    }
  });

  it('sélectionne jusqu’à 5 enseignes, cartes de 44 pt au moins, libellés lisibles', async () => {
    const onChange = jest.fn();
    const view = await render(wrap(<StoresSection value={[]} onChange={onChange} stores={stores} />));
    for (const g of ['hyper', 'discount', 'proximite']) expect(screen.getByTestId(`stores-group-${g}`)).toBeTruthy();
    for (const s of stores) {
      const card = screen.getByTestId(`stores-${s.id}`);
      expect(StyleSheet.flatten(card.props.style).minHeight).toBeGreaterThanOrEqual(44);
      const { pickup, delivery } = storeServiceLabels(s);
      expect(card.props.accessibilityLabel).toBe(`${storeDisplayName(s)}. ${pickup}. ${delivery}.`);
    }
    await fireEvent.press(screen.getByTestId('stores-aldi'));
    expect(onChange).toHaveBeenLastCalledWith(['aldi']);
    // 5 enseignes : les autres sont désactivées.
    const five = ['leclerc', 'carrefour', 'auchan', 'lidl', 'aldi'];
    await view.rerender(wrap(<StoresSection value={five} onChange={onChange} stores={stores} />));
    expect(screen.getByTestId('stores-netto')).toBeDisabled();
    expect(screen.getByText('C’est le maximum : retire une enseigne pour en choisir une autre.')).toBeTruthy();
    expect(screen.getByLabelText('Enseignes : E.Leclerc, Carrefour, Auchan, Lidl et Aldi')).toBeTruthy();
    onChange.mockClear();
    await fireEvent.press(screen.getByTestId('stores-netto'));
    expect(onChange).not.toHaveBeenCalled();
    expect(STORES_MAX).toBe(5);
  });
});

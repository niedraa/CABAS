/**
 * Onboarding : semaine du premier planning (jamais de repas passé), reprise
 * (pile reconstruite étape par étape), récapitulatif lisible au lecteur
 * d'écran, bandeau d'erreurs recalculé et génération de fin d'onboarding.
 *
 * expo-router est simulé : les écrans sont rendus directement dans les
 * providers de l'app.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ToastProvider } from '@/components/ui';
import {
  DEFAULT_MEAL_SLOTS,
  generateMealPlan,
  maxMealsPerWeek,
  type MealEngineInput,
  type MealPlan,
  type MealSlotPreference,
  type UserProfile,
} from '@/core';
import { ingredientsById, recipes, stores } from '@/data';
import { DEFAULT_DRAFT, resetAllStores, usePlanStore, useProfileStore, useWeekStore, type ProfileDraft } from '@/stores';
import { ThemeProvider } from '@/theme';

import Recap from '../../../../app/(onboarding)/recap';
import { PlanGenerationView } from '../PlanGenerationView';
import { ProfileSummary } from '../ProfileSummary';
import { firstPlanWeekStart, MIN_FIRST_WEEK_MEALS, resumePaths } from '../steps';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'undetermined', canAskAgain: true })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  SchedulableTriggerInputTypes: { WEEKLY: 'weekly', DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {}, PURCHASES_ERROR_CODE: {} }));
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => ({}),
}));

function wrap(node: React.ReactNode) {
  return (
    <GestureHandlerRootView>
      <ThemeProvider preference="light">
        <ToastProvider>{node}</ToastProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

// ─── Semaine du premier planning ─────────────────────────────────────────────

describe('firstPlanWeekStart', () => {
  const FREE = maxMealsPerWeek('free');
  const PREMIUM = maxMealsPerWeek('premium');
  const weekendOnly: MealSlotPreference[] = [
    { weekday: 5, type: 'dejeuner' },
    { weekday: 5, type: 'diner' },
    { weekday: 6, type: 'dejeuner' },
    { weekday: 6, type: 'diner' },
  ];
  const profileWith = (mealSlots: MealSlotPreference[] = DEFAULT_MEAL_SLOTS): UserProfile => ({
    ...DEFAULT_DRAFT,
    id: 'u',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    preferredStoreIds: ['leclerc'],
    mealSlots,
  });

  it('lundi : la semaine en cours', () => {
    expect(firstPlanWeekStart(profileWith(), FREE, '2026-11-09')).toBe('2026-11-09');
    expect(firstPlanWeekStart(profileWith(), PREMIUM, '2026-11-09')).toBe('2026-11-09');
  });

  it('dimanche : trop peu de repas encore planifiables, on démarre lundi prochain', () => {
    expect(firstPlanWeekStart(profileWith(), FREE, '2026-11-15')).toBe('2026-11-16');
    expect(firstPlanWeekStart(profileWith(), PREMIUM, '2026-11-15')).toBe('2026-11-16');
    expect(firstPlanWeekStart(profileWith(weekendOnly), PREMIUM, '2026-11-15')).toBe('2026-11-16');
  });

  it('garde la semaine en cours quand ses créneaux sont tous à venir', () => {
    expect(firstPlanWeekStart(profileWith(weekendOnly), FREE, '2026-11-12')).toBe('2026-11-09');
    // Le jour même compte comme « à venir ».
    expect(firstPlanWeekStart(profileWith(weekendOnly), PREMIUM, '2026-11-14')).toBe('2026-11-09');
  });

  it('quel que soit le jour : aucun repas passé, et assez de repas planifiés', () => {
    // Jeudi 12/11 en gratuit : le cas qui planifiait les dîners du 9, 10 et 11.
    for (const today of ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']) {
      for (const max of [FREE, PREMIUM]) {
        for (const slots of [DEFAULT_MEAL_SLOTS, weekendOnly]) {
          const profile = profileWith(slots);
          const weekStart = firstPlanWeekStart(profile, max, today);
          expect(['2026-11-09', '2026-11-16']).toContain(weekStart);
          // Comme planStore.generate : le moteur reçoit aujourd'hui en `fromDate`.
          const input: MealEngineInput & { fromDate?: string } = {
            profile,
            recipes,
            ingredientsById,
            weekStart,
            maxMeals: max,
            seed: 't',
            fromDate: today,
          };
          const plan = generateMealPlan(input);
          expect(plan.meals.filter((m) => m.date < today)).toEqual([]);
          expect(plan.meals.length).toBeGreaterThanOrEqual(Math.min(MIN_FIRST_WEEK_MEALS, slots.length));
        }
      }
    }
  });
});

// ─── Reprise ─────────────────────────────────────────────────────────────────

describe('resumePaths', () => {
  it('empile chaque étape jusqu’à celle sauvegardée', () => {
    expect(resumePaths('magasins')).toEqual(['/foyer', '/regime', '/budget-temps', '/cuisine', '/magasins']);
    expect(resumePaths('foyer')).toEqual(['/foyer']);
    expect(resumePaths('bienvenue')).toEqual([]);
  });
});

// ─── Récapitulatif ───────────────────────────────────────────────────────────

describe('ProfileSummary', () => {
  const draft: Required<ProfileDraft> = {
    ...DEFAULT_DRAFT,
    allergens: ['arachides', 'lait'],
    healthDataConsentAt: '2026-11-01T10:00:00.000Z',
    favoriteCuisines: ['italienne', 'asiatique'],
    preferredStoreIds: ['leclerc'],
  };

  it('le lecteur d’écran lit aussi les allergies, les temps et les cuisines', async () => {
    await render(wrap(<ProfileSummary draft={draft} stores={stores} onEdit={jest.fn()} />));
    expect(screen.getByTestId('summary-regime').props.accessibilityLabel).toBe(
      'Régimes & allergies : Aucun régime particulier. Allergies : arachides et lait. Modifier',
    );
    expect(screen.getByTestId('summary-budget-temps').props.accessibilityLabel).toMatch(
      /^Budget & temps : 80\s?€ par semaine\. 30 min en semaine, 60\+ min le week-end\. Modifier$/,
    );
    expect(screen.getByTestId('summary-cuisine').props.accessibilityLabel).toBe(
      'Cuisine : Plaques de cuisson et Four. Envie de : italienne et asiatique. Modifier',
    );
    expect(screen.getByTestId('summary-foyer').props.accessibilityLabel).toMatch(/^Foyer : 2 adultes · 2 portions\. Modifier$/);
  });

  it('sans allergie ni ustensile : le dit, comme le moteur l’applique', async () => {
    await render(wrap(<ProfileSummary draft={{ ...draft, allergens: [], equipment: [], favoriteCuisines: [] }} stores={stores} onEdit={jest.fn()} />));
    expect(screen.getByTestId('summary-regime').props.accessibilityLabel).toBe(
      'Régimes & allergies : Aucun régime particulier. Aucune allergie déclarée. Modifier',
    );
    expect(screen.getByTestId('summary-cuisine').props.accessibilityLabel).toBe('Cuisine : Plaques de cuisson (par défaut). Modifier');
  });
});

describe('PlanGenerationView', () => {
  it('annonce le premier jour quand le planning démarre la semaine suivante', async () => {
    await render(wrap(<PlanGenerationView phase="done" mealsCount={3} startsOn="lundi 16 novembre" />));
    expect(screen.getByTestId('generation-summary')).toHaveTextContent(
      '3 repas planifiés, pensés pour ton foyer. On démarre lundi 16 novembre.',
    );
  });
});

// ─── Écran récap : erreurs et génération ─────────────────────────────────────

describe('écran Récapitulatif', () => {
  const realGenerate = usePlanStore.getState().generate;
  const realRefresh = useWeekStore.getState().refreshToday;

  beforeEach(async () => {
    await resetAllStores({ resetSimulatedPurchases: true });
    // Dimanche 15 novembre 2026.
    useWeekStore.setState({
      today: '2026-11-15',
      currentWeekStart: '2026-11-09',
      activeWeekStart: '2026-11-09',
      refreshToday: () => undefined,
    });
  });

  afterEach(() => {
    usePlanStore.setState({ generate: realGenerate });
    useWeekStore.setState({ refreshToday: realRefresh });
    jest.useRealTimers();
  });

  it('le bandeau « Il manque une petite chose » disparaît dès la correction', async () => {
    useProfileStore.getState().updateDraft({ preferredStoreIds: [] });
    await render(wrap(<Recap />));
    expect(screen.queryByText('Il manque une petite chose')).toBeNull();
    await fireEvent.press(screen.getByTestId('onboarding-cta'));
    expect(screen.getByText('Il manque une petite chose')).toBeTruthy();
    expect(screen.getByText('Choisis au moins un magasin.')).toBeTruthy();
    await act(async () => {
      useProfileStore.getState().updateDraft({ preferredStoreIds: ['leclerc'] });
    });
    expect(screen.queryByText('Il manque une petite chose')).toBeNull();
  });

  it('dimanche, offre gratuite : planifie la semaine suivante et le dit', async () => {
    jest.useFakeTimers();
    const generate = jest.fn(async (weekStart?: string) => {
      const plan: MealPlan = {
        id: 'plan_test',
        weekStart: weekStart ?? '',
        generatedAt: '2026-11-15T10:00:00.000Z',
        source: 'rules',
        meals: ['2026-11-16', '2026-11-17', '2026-11-18'].map((date, i) => ({ id: `m${i}`, date, type: 'diner', recipeId: recipes[i].id, servings: 2 })),
      };
      return { ok: true as const, plan };
    });
    usePlanStore.setState({ generate });
    useProfileStore.getState().updateDraft({ preferredStoreIds: ['leclerc'] });

    await render(wrap(<Recap />));
    await fireEvent.press(screen.getByTestId('onboarding-cta'));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });

    expect(generate).toHaveBeenCalledWith('2026-11-16');
    expect(useWeekStore.getState().activeWeekStart).toBe('2026-11-16');
    expect(screen.getByTestId('generation-summary')).toHaveTextContent(/On démarre lundi 16 novembre\./);
    // « 60+ min » affiché au récap : c'est bien ce qui est enregistré.
    expect(useProfileStore.getState().profile?.maxCookTimeWeekendMin).toBe(120);
  });
});

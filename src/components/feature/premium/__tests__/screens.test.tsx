/**
 * Parcours d'écran : paywall → achat de l'essai (magasin simulé) → « Tu es
 * Premium » ; restauration ; budget gratuit (aperçu) vs Premium (ajout +
 * suppression annulable) ; édition d'une section du profil (Enregistrer
 * désactivé tant que rien ne change, consentement RGPD exigé).
 *
 * expo-router est simulé (paramètres de route + navigation espionnée) : les
 * écrans sont rendus directement dans les providers de l'app.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ToastProvider } from '@/components/ui';
import { DEFAULT_MEAL_SLOTS, type UserProfile } from '@/core';
import { __setPurchasesForTests, createSimulatedPurchases, createSimulatedStore } from '@/services/purchases';
import { resetAllStores, useBudgetStore, useProfileStore, useSubscriptionStore } from '@/stores';
import { ThemeProvider } from '@/theme';

import BudgetScreen from '../../../../app/budget';
import EditProfileSection from '../../../../app/parametres/profil/[section]';
import PremiumScreen from '../../../../app/premium';

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

const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: {
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      canGoBack: jest.fn(() => true),
      canDismiss: jest.fn(() => false),
      dismissAll: jest.fn(),
    },
    useLocalSearchParams: () => mockParams.current,
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

function renderScreen(Screen: React.ComponentType, params: Record<string, string> = {}) {
  mockParams.current = params;
  return render(
    <GestureHandlerRootView>
      <ThemeProvider preference="light">
        <ToastProvider>
          <Screen />
        </ToastProvider>
      </ThemeProvider>
    </GestureHandlerRootView>,
  );
}

const PROFILE: UserProfile = {
  id: 'user_test',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  displayName: 'Camille',
  household: { adults: 2, children: 1 },
  diets: [],
  allergens: [],
  dislikedIngredientIds: [],
  favoriteCuisines: [],
  weeklyBudgetCents: 12000,
  maxCookTimeWeekdayMin: 30,
  maxCookTimeWeekendMin: 60,
  equipment: ['plaques', 'four'],
  preferredStoreIds: ['leclerc', 'carrefour'],
  mealSlots: DEFAULT_MEAL_SLOTS,
  healthDataConsentAt: null,
};

beforeEach(async () => {
  __setPurchasesForTests(createSimulatedPurchases(createSimulatedStore()));
  await resetAllStores({ resetSimulatedPurchases: true });
  useProfileStore.getState().setProfile(PROFILE, true);
});

afterEach(() => {
  __setPurchasesForTests(null);
});

describe('paywall', () => {
  it('affiche les offres puis achète l’essai (magasin simulé)', async () => {
    await renderScreen(PremiumScreen, { feature: 'optimized_basket' });
    expect(screen.getByText('Paie tes courses moins cher')).toBeTruthy();
    expect(screen.getByText('Ce que tu cherchais')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(2));
    expect(screen.getByText('−33 %')).toBeTruthy();
    expect(screen.getByTestId('premium-legal').props.children).toMatch(/Renouvellement automatique, résiliable à tout moment/);

    await fireEvent.press(screen.getByTestId('plan-picker-monthly'));
    expect(screen.getByRole('radio', { name: /^Mensuel/ })).toBeChecked();
    await act(async () => {
      fireEvent.press(screen.getByTestId('premium-cta'));
    });
    await waitFor(() => expect(screen.getByTestId('premium-done')).toBeTruthy());
    expect(screen.getByText('Ton essai est lancé')).toBeTruthy();
    expect(screen.getByText('Ton essai commence !')).toBeTruthy();
    const sub = useSubscriptionStore.getState().state;
    expect(sub).toMatchObject({ entitlement: 'premium', isTrial: true, productId: 'cabas_premium_monthly' });
  });

  it('restaurer sans achat : message neutre, toujours gratuit', async () => {
    await renderScreen(PremiumScreen);
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(2));
    await act(async () => {
      fireEvent.press(screen.getByTestId('premium-restore'));
    });
    await waitFor(() => expect(screen.getByText('Aucun abonnement trouvé')).toBeTruthy());
    expect(useSubscriptionStore.getState().state.entitlement).toBe('free');
  });
});

describe('budget', () => {
  it('gratuit : aperçu flouté et invitation', async () => {
    await renderScreen(BudgetScreen);
    expect(screen.getByTestId('budget-teaser')).toBeTruthy();
    expect(screen.queryByTestId('budget-week')).toBeNull();
  });

  it('Premium : ajout d’une dépense puis suppression annulée', async () => {
    useSubscriptionStore.getState().applyState({
      entitlement: 'premium',
      isTrial: true,
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      productId: 'cabas_premium_annual',
      willRenew: true,
    });
    await renderScreen(BudgetScreen);
    expect(screen.getByTestId('budget-week')).toBeTruthy();
    expect(screen.getByText('Aucune dépense pour l’instant')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('budget-add'));
    await fireEvent.changeText(screen.getByTestId('add-spending-amount'), '42,50');
    await fireEvent.press(screen.getByTestId('add-spending-submit'));
    expect(useBudgetStore.getState().entries).toHaveLength(1);
    expect(useBudgetStore.getState().entries[0]).toMatchObject({ totalCents: 4250, source: 'manual', storeId: 'leclerc' });
    expect(screen.getByText('Dépense ajoutée')).toBeTruthy();

    const id = useBudgetStore.getState().entries[0].id;
    await fireEvent.press(screen.getByTestId(`spending-${id}-remove`));
    expect(useBudgetStore.getState().entries).toHaveLength(0);
    await fireEvent.press(screen.getByRole('button', { name: 'Annuler' }));
    expect(useBudgetStore.getState().entries.map((e) => e.id)).toEqual([id]);
  });
});

describe('édition du profil', () => {
  it('Enregistrer reste désactivé tant que rien ne change, puis enregistre', async () => {
    await renderScreen(EditProfileSection, { section: 'foyer' });
    const save = screen.getByTestId('edit-save');
    expect(save).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Augmenter Enfants' }));
    expect(screen.getByTestId('edit-save')).not.toBeDisabled();
    await fireEvent.press(screen.getByTestId('edit-save'));
    expect(useProfileStore.getState().profile?.household).toEqual({ adults: 2, children: 2 });
    expect(screen.getByText('Profil mis à jour')).toBeTruthy();
  });

  it('régime : sans consentement, l’enregistrement est refusé avec une explication', async () => {
    await renderScreen(EditProfileSection, { section: 'regime' });
    await fireEvent.press(screen.getByTestId('diet-allergy-allergens-lait'));
    await fireEvent.press(screen.getByTestId('edit-save'));
    expect(screen.getByText(/on a besoin de ton accord explicite/)).toBeTruthy();
    expect(useProfileStore.getState().profile?.allergens).toEqual([]);
    await fireEvent.press(screen.getByTestId('diet-allergy-consent'));
    await fireEvent.press(screen.getByTestId('edit-save'));
    expect(useProfileStore.getState().profile?.allergens).toEqual(['lait']);
    expect(useProfileStore.getState().profile?.healthDataConsentAt).toBeTruthy();
  });

  it('section inconnue : état vide bienveillant', async () => {
    await renderScreen(EditProfileSection, { section: 'inconnue' });
    expect(screen.getByText('Section introuvable')).toBeTruthy();
  });
});

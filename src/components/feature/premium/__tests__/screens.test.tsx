/**
 * Parcours d'écran : paywall → achat de l'essai (magasin simulé) → « Tu es
 * Premium » ; restauration ; offres partielles ou absentes ; budget gratuit
 * (aperçu) vs Premium (ajout + suppression annulable) ; édition d'une section
 * du profil (Enregistrer désactivé tant que rien ne change, consentement RGPD
 * exigé, sortie protégée) ; notifications ; raccourci Budget du profil.
 *
 * expo-router est simulé (paramètres de route + navigation espionnée) : les
 * écrans sont rendus directement dans les providers de l'app.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';

import { ToastProvider } from '@/components/ui';
import { addDays, DEFAULT_MEAL_SLOTS, type UserProfile } from '@/core';
import {
  __setPurchasesForTests,
  createSimulatedPurchases,
  createSimulatedStore,
  type NormalizedOfferings,
  type PurchasesService,
} from '@/services/purchases';
import { resetAllStores, useBudgetStore, useProfileStore, useSettingsStore, useSubscriptionStore, useWeekStore } from '@/stores';
import { ThemeProvider } from '@/theme';

import ProfileTab from '../../../../app/(tabs)/profil';
import BudgetScreen from '../../../../app/budget';
import NotificationSettings from '../../../../app/parametres/notifications';
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

type MockAction = { type: string };
/**
 * Pile simulée : une sortie (`router.back()`, ou le balayage iOS / la touche
 * retour Android via `tryRemove`) retire l'écran, sauf si `usePreventRemove`
 * la bloque ; `repeat()` la rejoue alors.
 */
const mockNav = {
  prevented: false,
  onPrevented: null as null | ((e: { data: { action: MockAction }; repeat: () => void }) => void),
  removed: jest.fn<void, [MockAction]>(),
  tryRemove(action: MockAction) {
    if (mockNav.prevented && mockNav.onPrevented) {
      mockNav.onPrevented({
        data: { action },
        repeat: () => {
          mockNav.prevented = false;
          mockNav.removed(action);
        },
      });
      return;
    }
    mockNav.removed(action);
  },
};

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: {
      push: jest.fn(),
      replace: jest.fn(() => mockNav.tryRemove({ type: 'REPLACE' })),
      back: jest.fn(() => mockNav.tryRemove({ type: 'GO_BACK' })),
      canGoBack: jest.fn(() => true),
      canDismiss: jest.fn(() => false),
      dismissAll: jest.fn(),
    },
    useLocalSearchParams: () => mockParams.current,
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
    usePreventRemove: (prevent: boolean, callback?: typeof mockNav.onPrevented) => {
      mockNav.prevented = prevent;
      mockNav.onPrevented = callback ?? null;
      return () => {
        mockNav.prevented = false;
      };
    },
  };
});

function renderScreen(Screen: React.ComponentType, params: Record<string, string> = {}, opts: { rootToasts?: boolean } = {}) {
  mockParams.current = params;
  const content = <Screen />;
  return render(
    <GestureHandlerRootView>
      <ThemeProvider preference="light">{opts.rootToasts === false ? content : <ToastProvider>{content}</ToastProvider>}</ThemeProvider>
    </GestureHandlerRootView>,
  );
}

/** Magasin simulé dont on retouche les offres (offre unique, aucune offre, essai déjà servi…). */
function useOfferings(transform: (o: NormalizedOfferings) => NormalizedOfferings) {
  const base = createSimulatedPurchases(createSimulatedStore());
  const service: PurchasesService = { ...base, getOfferings: async () => transform(await base.getOfferings()) };
  __setPurchasesForTests(service);
}

function applyPremium() {
  useSubscriptionStore.getState().applyState({
    entitlement: 'premium',
    isTrial: true,
    expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    productId: 'cabas_premium_annual',
    willRenew: true,
  });
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
  mockNav.prevented = false;
  mockNav.onPrevented = null;
  mockNav.removed.mockClear();
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

  it('affiche ses toasts dans la modale (sur iOS, la feuille native couvre le viewport racine)', async () => {
    await renderScreen(PremiumScreen, {}, { rootToasts: false });
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(2));
    await act(async () => {
      fireEvent.press(screen.getByTestId('premium-restore'));
    });
    await waitFor(() => expect(screen.getByText('Aucun abonnement trouvé')).toBeTruthy());
  });

  it('feuille iOS : pas de marge de barre d’état en plus', async () => {
    mockParams.current = {};
    await render(
      <GestureHandlerRootView>
        <SafeAreaInsetsContext.Provider value={{ top: 59, bottom: 34, left: 0, right: 0 }}>
          <ThemeProvider preference="light">
            <PremiumScreen />
          </ThemeProvider>
        </SafeAreaInsetsContext.Provider>
      </GestureHandlerRootView>,
    );
    const style = StyleSheet.flatten(screen.getByTestId('premium-scroll').props.contentContainerStyle);
    expect(style.paddingTop).toBeLessThan(59);
  });

  it('offre unique : une seule carte, et l’achat porte sur elle', async () => {
    useOfferings((o) => ({ ...o, annual: null }));
    await renderScreen(PremiumScreen);
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(1));
    expect(screen.getByRole('radio', { name: /^Mensuel/ })).toBeChecked();
    expect(screen.queryByText('−33 %')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId('premium-cta'));
    });
    await waitFor(() => expect(screen.getByTestId('premium-done')).toBeTruthy());
    expect(useSubscriptionStore.getState().state.productId).toBe('cabas_premium_monthly');
  });

  it('aucune offre « current » : bandeau Réessayer, achat impossible', async () => {
    useOfferings((o) => ({ ...o, annual: null, monthly: null }));
    await renderScreen(PremiumScreen);
    await waitFor(() => expect(screen.getByText('Les offres ne se chargent pas')).toBeTruthy());
    expect(screen.getByTestId('premium-cta')).toBeDisabled();
  });

  it('essai déjà utilisé : le héros ne promet plus d’essai', async () => {
    useOfferings((o) => ({
      ...o,
      annual: o.annual && { ...o.annual, trial: null },
      monthly: o.monthly && { ...o.monthly, trial: null },
    }));
    await renderScreen(PremiumScreen);
    await waitFor(() => expect(screen.getByTestId('premium-cta')).not.toBeDisabled());
    expect(screen.getByText(/Résiliable à tout moment\.$/)).toBeTruthy();
    expect(screen.queryByText(/pour essayer/)).toBeNull();
    expect(screen.getByTestId('premium-legal').props.children).toMatch(/débité à la confirmation/);
  });
});

describe('budget', () => {
  it('gratuit : aperçu flouté et invitation', async () => {
    await renderScreen(BudgetScreen);
    expect(screen.getByTestId('budget-teaser')).toBeTruthy();
    expect(screen.queryByTestId('budget-week')).toBeNull();
  });

  it('Premium : ajout d’une dépense puis suppression annulée', async () => {
    applyPremium();
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

  it('sortie avec des changements (geste retour, flèche) : confirmation, puis sortie rejouée', async () => {
    await renderScreen(EditProfileSection, { section: 'foyer' });
    await fireEvent.press(screen.getByRole('button', { name: 'Augmenter Enfants' }));
    // Balayage retour d'iOS / touche retour d'Android : la pile tente de retirer l'écran.
    await act(async () => mockNav.tryRemove({ type: 'POP' }));
    expect(mockNav.removed).not.toHaveBeenCalled();
    expect(screen.getByText('Quitter sans enregistrer ?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Continuer l’édition' }));
    // Flèche de la barre : même protection.
    await fireEvent.press(screen.getByRole('button', { name: 'Retour' }));
    expect(mockNav.removed).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Quitter sans enregistrer' }));
    expect(mockNav.removed).toHaveBeenCalledWith({ type: 'GO_BACK' });
    expect(useProfileStore.getState().profile?.household).toEqual({ adults: 2, children: 1 });
  });

  it('enregistrer puis sortir : aucune confirmation', async () => {
    await renderScreen(EditProfileSection, { section: 'foyer' });
    await fireEvent.press(screen.getByRole('button', { name: 'Augmenter Enfants' }));
    await fireEvent.press(screen.getByTestId('edit-save'));
    expect(mockNav.removed).toHaveBeenCalledWith({ type: 'GO_BACK' });
    expect(screen.queryByText('Quitter sans enregistrer ?')).toBeNull();
  });

  it('section inconnue : état vide bienveillant', async () => {
    await renderScreen(EditProfileSection, { section: 'inconnue' });
    expect(screen.getByText('Section introuvable')).toBeTruthy();
  });
});

describe('notifications', () => {
  it('relit l’autorisation au retour des réglages du téléphone et programme le rappel', async () => {
    const perms = Notifications.getPermissionsAsync as jest.Mock;
    const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
    const initial = perms.getMockImplementation();
    try {
      perms.mockImplementation(async () => ({ granted: false, status: 'denied', canAskAgain: false }));
      useSettingsStore.setState({ notificationPermission: 'denied' });
      await renderScreen(NotificationSettings);
      await waitFor(() => expect(screen.getByTestId('notif-open-settings')).toBeTruthy());
      schedule.mockClear();

      // Autorisées dans les réglages du téléphone, puis retour dans Cabas.
      perms.mockImplementation(async () => ({ granted: true, status: 'granted', canAskAgain: true }));
      const changes = (AppState.addEventListener as jest.Mock).mock.calls.filter(([type]) => type === 'change');
      const onAppState = changes[changes.length - 1][1] as (state: string) => void;
      await act(async () => onAppState('active'));

      await waitFor(() => expect(useSettingsStore.getState().notificationPermission).toBe('granted'));
      expect(screen.queryByTestId('notif-open-settings')).toBeNull();
      expect(screen.getByText('Notifications activées')).toBeTruthy();
      await waitFor(() => expect(schedule).toHaveBeenCalledWith(expect.objectContaining({ identifier: 'cabas-planning-reminder' })));
    } finally {
      perms.mockImplementation(initial);
    }
  });
});

describe('onglet Profil', () => {
  it('la tuile Budget suit la semaine en cours, même quand « Ma semaine » prépare la suivante', async () => {
    applyPremium();
    const { today, currentWeekStart } = useWeekStore.getState();
    useBudgetStore.getState().addManualEntry({ date: today, storeId: 'leclerc', totalCents: 5000 });
    useWeekStore.getState().setActiveWeek(addDays(currentWeekStart, 7));
    await renderScreen(ProfileTab);
    expect(screen.getByText('Il te reste 70,00 €')).toBeTruthy();
  });
});

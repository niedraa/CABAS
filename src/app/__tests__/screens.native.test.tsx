/* eslint-disable @typescript-eslint/no-require-imports -- écrans chargés à la demande, après les mocks */
/**
 * Rendu des écrans avec le preset iOS (React Native, pas le web) : détecte les
 * erreurs qui n'existent que sur téléphone (texte hors <Text>, styles invalides…).
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ToastProvider } from '@/components/ui';
import { ThemeProvider } from '@/theme';
import {
  useBasketStore,
  usePlanStore,
  useProfileStore,
  useWeekStore,
  waitForHydration,
  getList,
} from '@/stores';

jest.setTimeout(20000);

const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
    useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (cb: () => void) => React.useEffect(() => cb(), [cb]),
    Stack: { Screen: () => null },
    Link: ({ children }: { children: React.ReactNode }) => children,
  };
});
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'undetermined' })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  SchedulableTriggerInputTypes: { WEEKLY: 'weekly', DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'opened' })) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {}, PURCHASES_ERROR_CODE: {} }));

function wrap(el: React.ReactElement) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
        <ThemeProvider>
          <ToastProvider>{el}</ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

beforeAll(async () => {
  await waitForHydration();
  const s = useProfileStore.getState();
  s.updateDraft({ displayName: 'Camille', household: { adults: 2, children: 1 }, preferredStoreIds: ['leclerc', 'carrefour', 'lidl'] });
  const res = s.completeOnboarding();
  if (!res.ok) throw new Error('profil');
  await usePlanStore.getState().generate(useWeekStore.getState().activeWeekStart);
  await useBasketStore.getState().compute();
});

const SCREENS: [string, () => React.ComponentType, Record<string, string>][] = [
  ['Semaine', () => require('../(tabs)/index').default, {}],
  ['Liste', () => require('../(tabs)/liste').default, {}],
  ['Prix', () => require('../(tabs)/panier').default, {}],
  ['Profil', () => require('../(tabs)/profil').default, {}],
  ['Premium', () => require('../premium').default, {}],
  ['Placard', () => require('../placard').default, {}],
  ['Budget', () => require('../budget').default, {}],
  ['Notifications', () => require('../parametres/notifications').default, {}],
  ['Compte', () => require('../parametres/compte').default, {}],
  ['Crédits', () => require('../parametres/credits').default, {}],
  ['Magasins', () => require('../parametres/[section]').default, { section: 'magasins' }],
  ['Recette', () => require('../recette/[id]').default, { id: 'rec_ratatouille' }],
];

describe('écrans (rendu natif iOS)', () => {
  it.each(SCREENS)('%s s’affiche sans erreur', async (_name, load, params) => {
    Object.keys(mockParams).forEach((k) => delete mockParams[k]);
    Object.assign(mockParams, params ?? {});
    const Screen = load();
    await act(async () => {
      render(wrap(<Screen />));
    });
    expect(screen.toJSON()).toBeTruthy();
  });

  it('Prix affiche le ticket du panier avec un total en euros', async () => {
    const Screen = require('../(tabs)/panier').default;
    await act(async () => {
      render(wrap(<Screen />));
    });
    expect(screen.getByTestId('basket-receipt')).toBeTruthy();
    expect(screen.getAllByText(/€/).length).toBeGreaterThan(3);
  });

  it('Détail d’un article et commande s’affichent', async () => {
    const item = getList().items.find((i) => i.ingredientId)!;
    Object.assign(mockParams, { itemId: item.id });
    const Detail = require('../comparateur/[itemId]').default;
    await act(async () => {
      render(wrap(<Detail />));
    });
    expect(screen.getByText(/Prix par enseigne/i)).toBeTruthy();
    const storeId = useBasketStore.getState().plan!.parts[0].storeId;
    Object.assign(mockParams, { storeId });
    const Order = require('../commande/[storeId]').default;
    await act(async () => {
      render(wrap(<Order />));
    });
    expect(screen.getByTestId('order-lines')).toBeTruthy();
  });
});

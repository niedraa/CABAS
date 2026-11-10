/**
 * Parcours des écrans « Prix » → détail d'un article → commande, branchés
 * sur les vrais stores (mode démo : catalogue embarqué, calcul local).
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';

import { ToastProvider } from '@/components/ui';
import type { ShoppingListItem } from '@/core';
import { __setBasketServiceForTests, createBasketService } from '@/services/basket';
import {
  resetAllStores,
  useBasketStore,
  useBudgetStore,
  useListStore,
  useOrderStore,
  useSubscriptionStore,
  useWeekStore,
  waitForHydration,
} from '@/stores';

import ComparatorScreen from '@/app/comparateur/[itemId]';
import OrderScreen from '@/app/commande/[storeId]';
import PriceScreen from '@/app/(tabs)/panier';

const mockRouter = { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
  useIsFocused: () => true,
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'undetermined', canAskAgain: true })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  SchedulableTriggerInputTypes: { WEEKLY: 'weekly', DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'opened' })) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {}, PURCHASES_ERROR_CODE: {} }));

function item(id: string, ingredientId: string | undefined, label: string, quantity: number): ShoppingListItem {
  return {
    id,
    ...(ingredientId ? { ingredientId } : {}),
    label,
    quantity,
    unit: ingredientId ? 'g' : 'piece',
    aisle: 'fruits_legumes',
    checked: false,
    source: ingredientId ? 'plan' : 'manual',
    recipeIds: ingredientId ? ['rec_a'] : [],
  };
}

const ITEMS = [
  item('i-champi', 'champignons_paris', 'Champignons de Paris', 190),
  item('i-gingembre', 'gingembre', 'Gingembre frais', 40),
  item('i-escalope', 'escalope_dinde', 'Escalope de dinde', 400),
  item('i-carotte', 'carotte', 'Carotte', 600),
  item('i-eau', undefined, 'Eau gazeuse', 1),
];

function setList(items: ShoppingListItem[]) {
  const ws = useWeekStore.getState().activeWeekStart;
  useListStore.setState({ lists: { [ws]: { id: 'list_test', mealPlanId: null, items, updatedAt: new Date().toISOString() } } });
}

function setPremium() {
  useSubscriptionStore.getState().applyState({
    entitlement: 'premium',
    isTrial: true,
    expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    productId: 'cabas_premium_annual',
    willRenew: true,
  });
}

const wrapper = ({ children }: { children: React.ReactNode }) => <ToastProvider>{children}</ToastProvider>;

beforeEach(async () => {
  await waitForHydration();
  await resetAllStores();
  __setBasketServiceForTests(null);
  mockParams = {};
  jest.clearAllMocks();
});

describe('Onglet Prix', () => {
  it('calcule le panier à l’arrivée (squelettes), puis affiche ticket, magasin, comparaison et introuvables', async () => {
    // Service « lent » (comme l'Edge Function) : on libère le calcul à la main.
    const local = createBasketService({ remote: null });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    __setBasketServiceForTests({
      computeBasket: async (req) => {
        await gate;
        return local.computeBasket(req);
      },
    });
    setList(ITEMS);
    await render(<PriceScreen />, { wrapper });
    expect(screen.getByTestId('basket-skeleton')).toBeTruthy();
    expect(useBasketStore.getState().status).toBe('computing');
    await act(async () => release());
    await waitFor(() => expect(screen.getByTestId('price-ready')).toBeTruthy());
    const plan = useBasketStore.getState().plan;
    expect(plan?.parts).toHaveLength(1);
    expect(screen.getByText('Ticket · Un seul magasin')).toBeTruthy();
    expect(screen.getByText('4 articles comparés dans 5 enseignes')).toBeTruthy();
    expect(screen.getByTestId('comparison-list')).toBeTruthy();
    expect(screen.getByText('Eau gazeuse')).toBeTruthy();
    // Un article → son détail ; un magasin → sa commande.
    await fireEvent.press(screen.getByTestId('compare-0'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/comparateur/[itemId]', params: { itemId: 'i-champi' } });
    const storeId = plan?.parts[0].storeId as string;
    await fireEvent.press(screen.getByTestId(`store-part-${storeId}-order`));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/commande/[storeId]', params: { storeId } });
  });

  it('compte gratuit + « le moins cher » : panier un seul magasin et invitation Premium chiffrée', async () => {
    setList(ITEMS);
    await render(<PriceScreen />, { wrapper });
    await waitFor(() => expect(screen.getByTestId('price-ready')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('basket-controls-mode-cheapest'));
    await waitFor(() => expect(useBasketStore.getState().downgraded).toBe(true));
    expect(useBasketStore.getState().plan?.mode).toBe('single_store');
    expect(screen.getByText('Le moins cher, c’est Premium')).toBeTruthy();
    expect(screen.getByText(/^−\d+,\d{2} € cette semaine en répartissant tes courses sur 2 magasins/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Essayer Premium 7 jours' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/premium');
  });

  it('Premium : panier multi-magasins, recalcul au changement de canal', async () => {
    setPremium();
    setList(ITEMS);
    await render(<PriceScreen />, { wrapper });
    await waitFor(() => expect(screen.getByTestId('price-ready')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('basket-controls-mode-cheapest'));
    await waitFor(() => expect(useBasketStore.getState().plan?.mode).toBe('cheapest'));
    expect(screen.queryByText('Le moins cher, c’est Premium')).toBeNull();
    expect(screen.getByText('Ticket · Panier le moins cher')).toBeTruthy();
    expect(useBasketStore.getState().plan?.parts.length).toBeGreaterThanOrEqual(1);
    await fireEvent.press(screen.getByRole('radio', { name: 'Livraison' }));
    await waitFor(() => expect(useBasketStore.getState().channel).toBe('delivery'));
    await waitFor(() => expect(screen.getAllByText('Frais de livraison').length).toBeGreaterThanOrEqual(1));
  });

  it('erreur de calcul : message et « Réessayer »', async () => {
    let fail = true;
    const local = createBasketService({ remote: null });
    __setBasketServiceForTests({
      computeBasket: async (req) => {
        if (fail) throw new Error('réseau');
        return local.computeBasket(req);
      },
    });
    setList(ITEMS);
    await render(<PriceScreen />, { wrapper });
    await waitFor(() => expect(screen.getByText('Les prix se font attendre')).toBeTruthy());
    fail = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(screen.getByTestId('price-ready')).toBeTruthy());
  });

  it('liste vide, puis tout coché', async () => {
    setList([]);
    const view = await render(<PriceScreen />, { wrapper });
    expect(screen.getByText('Rien à comparer')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Planifier ma semaine' }));
    expect(mockRouter.navigate).toHaveBeenCalledWith('/');
    await act(() => setList(ITEMS.map((i) => ({ ...i, checked: true }))));
    await view.rerender(<PriceScreen />);
    expect(screen.getByText('Tout est dans ton cabas')).toBeTruthy();
    expect(useBasketStore.getState().status).toBe('idle');
  });
});

describe('Détail d’un article', () => {
  it('montre les offres par enseigne et choisit un autre produit', async () => {
    setList(ITEMS);
    await act(async () => {
      await useBasketStore.getState().compute();
    });
    mockParams = { itemId: 'i-champi' };
    await render(<ComparatorScreen />, { wrapper });
    expect(screen.getByText('Champignons de Paris')).toBeTruthy();
    expect(screen.getByText('Besoin : 190 g · 1 recette')).toBeTruthy();
    expect(screen.getByText('Par enseigne')).toBeTruthy();
    expect(screen.getAllByText('Meilleur prix').length).toBeGreaterThanOrEqual(1);
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBeGreaterThanOrEqual(2);
    expect(radios[0]).toBeChecked();
    await fireEvent.press(radios[1]);
    await waitFor(() => expect(Object.keys(useBasketStore.getState().selectedAlternatives)).toEqual(['i-champi']));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Revenir au moins cher' })).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Revenir au moins cher' }));
    await waitFor(() => expect(useBasketStore.getState().selectedAlternatives).toEqual({}));
    await fireEvent.press(screen.getByRole('button', { name: 'Fermer' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('article disparu : état vide honnête', async () => {
    mockParams = { itemId: 'inconnu' };
    await render(<ComparatorScreen />, { wrapper });
    expect(screen.getByText('Article introuvable')).toBeTruthy();
  });
});

describe('Commande', () => {
  async function openOrderScreen() {
    setList(ITEMS);
    await act(async () => {
      await useBasketStore.getState().compute();
    });
    const storeId = useBasketStore.getState().plan?.parts[0].storeId as string;
    mockParams = { storeId };
    await render(<OrderScreen />, { wrapper });
    return storeId;
  }

  it('gratuit : copier la liste, ouvrir le site, valider → célébration et budget', async () => {
    const storeId = await openOrderScreen();
    expect(screen.getByText('Ta commande en 2 étapes')).toBeTruthy();
    expect(useOrderStore.getState().orders).toHaveLength(0);
    await fireEvent.press(screen.getByRole('button', { name: 'Copier la liste' }));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1));
    expect((Clipboard.setStringAsync as jest.Mock).mock.calls[0][0]).toMatch(/^Ma commande Cabas — /);
    expect(useOrderStore.getState().orders).toHaveLength(1);
    expect(await screen.findByText('Liste copiée')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('order-open'));
    await waitFor(() => expect(WebBrowser.openBrowserAsync).toHaveBeenCalledTimes(1));
    expect((WebBrowser.openBrowserAsync as jest.Mock).mock.calls[0][0]).toMatch(/utm_source=cabas/);
    // La commande préparée est réutilisée, pas dupliquée.
    expect(useOrderStore.getState().orders).toHaveLength(1);
    await waitFor(() => expect(screen.getByText(/^De retour de chez /)).toBeTruthy());

    await fireEvent.press(screen.getByTestId('order-confirm'));
    expect(await screen.findByText('Commande validée !')).toBeTruthy();
    expect(screen.getByLabelText('Commande validée')).toBeTruthy();
    const order = useOrderStore.getState().orders[0];
    expect(order).toMatchObject({ storeId, status: 'confirmed' });
    expect(useBudgetStore.getState().entries.some((e) => e.id === `spend_${order.id}`)).toBe(true);
    await fireEvent.press(screen.getByTestId('order-done'));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('Premium : commande en un clic (liste copiée en filet), pas d’invitation', async () => {
    setPremium();
    await openOrderScreen();
    expect(screen.getByText('Commande en un clic')).toBeTruthy();
    expect(screen.queryByText('Découvrir Premium')).toBeNull();
    await fireEvent.press(screen.getByTestId('order-open'));
    await waitFor(() => expect(WebBrowser.openBrowserAsync).toHaveBeenCalledTimes(1));
    expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('order-confirm')).toBeTruthy());
  });

  it('magasin hors panier : rien à commander', async () => {
    mockParams = { storeId: 'lidl' };
    await render(<OrderScreen />, { wrapper });
    expect(screen.getByText('Rien à commander chez Lidl')).toBeTruthy();
  });
});

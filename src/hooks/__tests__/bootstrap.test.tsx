/**
 * Démarrage : jamais bloqué par une relecture du disque qui échoue, et relancé
 * après la suppression du compte.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { persistStorage } from '@/lib/storage';
import { createSimulatedPurchases, FREE_SUBSCRIPTION, __setPurchasesForTests, type PurchasesService } from '@/services/purchases';
import { deleteAccount } from '@/stores';

import { useAppBootstrap } from '..';
import { __resetBootstrapForTests } from '../useAppBootstrap';

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

// Pour le test « store jamais relu » : `useHydrated()` peut être forcé à faux.
const mockHydrated = { value: null as boolean | null };
jest.mock('../useHydrated', () => {
  const actual = jest.requireActual('../useHydrated');
  return { useHydrated: () => mockHydrated.value ?? actual.useHydrated() };
});

afterEach(() => {
  mockHydrated.value = null;
  __resetBootstrapForTests();
  __setPurchasesForTests(null);
});

describe('relecture du disque en échec', () => {
  it('valeur illisible ou AsyncStorage en erreur : le store démarre à vide au lieu de rester « non relu »', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage = persistStorage<{ a: number }>();
    await AsyncStorage.setItem('cabas/test-corrompu', '{"state": {"a": 1'); // écriture interrompue
    await expect(storage.getItem('cabas/test-corrompu')).resolves.toBeNull();

    const getItem = jest.mocked(AsyncStorage.getItem);
    getItem.mockClear();
    getItem.mockRejectedValueOnce(new Error('SQLITE_IOERR')).mockRejectedValueOnce(new Error('SQLITE_IOERR'));
    await expect(storage.getItem('cabas/plan')).resolves.toBeNull();
    expect(getItem).toHaveBeenCalledTimes(2); // une nouvelle tentative avant d'abandonner

    // Erreur passagère : la seconde lecture réussit.
    getItem.mockRejectedValueOnce(new Error('busy')).mockResolvedValueOnce(JSON.stringify({ state: { a: 2 }, version: 1 }));
    await expect(storage.getItem('cabas/plan')).resolves.toEqual({ state: { a: 2 }, version: 1 });
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('un store qui ne finit jamais sa relecture ne bloque pas l’écran de lancement', async () => {
    mockHydrated.value = false;
    const { result } = await renderHook(() => useAppBootstrap());
    // `waitForHydration()` (borné à 5 s) a rendu la main : l'app s'affiche quand même.
    await waitFor(() => expect(result.current.ready).toBe(true));
  });
});

describe('suppression du compte', () => {
  it('relance le démarrage : nouvelle session, achats ré-identifiés, ancienne écoute retirée', async () => {
    const base = createSimulatedPurchases();
    const configured: string[] = [];
    const removed: number[] = [];
    let listeners = 0;
    const purchases: PurchasesService = {
      ...base,
      simulated: null,
      configure: async (userId) => {
        configured.push(userId);
      },
      getSubscriptionState: async () => FREE_SUBSCRIPTION,
      addListener: () => {
        const n = ++listeners;
        return () => removed.push(n);
      },
    };
    __setPurchasesForTests(purchases);

    const { result } = await renderHook(() => useAppBootstrap());
    await waitFor(() => expect(result.current.session).not.toBeNull());
    const first = result.current.session!.userId;
    await waitFor(() => expect(configured).toEqual([first]));

    await act(() => deleteAccount());

    await waitFor(() => expect(result.current.session?.userId).toBeDefined());
    await waitFor(() => expect(result.current.session!.userId).not.toBe(first));
    const second = result.current.session!.userId;
    await waitFor(() => expect(configured).toEqual([first, second]));
    expect(removed).toContain(1); // écoute liée à l'ancien utilisateur retirée
    await waitFor(() => expect(listeners).toBe(2));
    expect(result.current.ready).toBe(true);
  });
});

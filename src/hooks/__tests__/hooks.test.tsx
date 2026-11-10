import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useSubscriptionStore, useWeekStore } from '@/stores';

import { bootstrapApp, useAppBootstrap, useCurrentWeek, useEntitlement, useHydrated, useSubscription } from '..';
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

afterEach(() => {
  __resetBootstrapForTests();
});

describe('hooks', () => {
  it('useHydrated devient vrai', async () => {
    const { result } = await renderHook(() => useHydrated());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('useEntitlement / useSubscription suivent le store (Premium expiré = gratuit)', async () => {
    const { result } = await renderHook(() => ({ e: useEntitlement(), s: useSubscription() }));
    expect(result.current.e).toBe('free');
    expect(result.current.s.maxMealsPerWeek).toBe(3);
    expect(result.current.s.canUse('optimized_basket')).toBe(false);
    await act(() => {
      useSubscriptionStore.getState().applyState({
        entitlement: 'premium',
        isTrial: true,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        productId: 'cabas_premium_monthly',
        willRenew: true,
      });
    });
    expect(result.current.e).toBe('premium');
    expect(result.current.s).toMatchObject({ isPremium: true, isTrial: true, maxMealsPerWeek: 14 });
    expect(result.current.s.canUse('optimized_basket')).toBe(true);
    await act(() => {
      useSubscriptionStore.getState().applyState({
        entitlement: 'premium',
        isTrial: false,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        productId: 'cabas_premium_monthly',
        willRenew: false,
      });
    });
    expect(result.current.e).toBe('free');
  });

  it('useCurrentWeek : semaine en cours ⇄ suivante (bornée)', async () => {
    const { result } = await renderHook(() => useCurrentWeek());
    const current = result.current.currentWeekStart;
    expect(result.current.activeWeekStart).toBe(current);
    expect(result.current.rangeLabel).toMatch(/–/);
    await act(() => result.current.goToNextWeek());
    expect(result.current.isNextWeek).toBe(true);
    await act(() => result.current.setActiveWeek('2099-01-05'));
    expect(result.current.activeWeekStart).toBe(result.current.nextWeekStart);
    await act(() => result.current.setActiveWeek('2000-01-03'));
    expect(useWeekStore.getState().activeWeekStart).toBe(current);
  });

  it('useAppBootstrap (démo) : prêt avec une session locale', async () => {
    const { result } = await renderHook(() => useAppBootstrap());
    await waitFor(() => expect(result.current.ready).toBe(true));
    await waitFor(() => expect(result.current.session).not.toBeNull());
    expect(result.current.session).toMatchObject({ mode: 'demo', offline: false });
    // Idempotent.
    expect(bootstrapApp()).toBe(bootstrapApp());
    const res = await bootstrapApp();
    expect(res.error).toBeNull();
  });
});

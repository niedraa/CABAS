/* Tests des utilitaires src/lib utilisés par le kit UI (haptique, a11y). */
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

import {
  countLabel,
  formatDurationForA11y,
  formatPercentForA11y,
  formatPriceChangeForA11y,
  formatPriceForA11y,
} from '@/lib/a11y';
import { error, haptics, isHapticsEnabled, select, setHapticsEnabled, success, tap, warning } from '@/lib/haptics';

// Les appels `jest.mock` sont hissés avant les imports par babel-jest.
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

describe('haptics', () => {
  const originalOS = Platform.OS;
  beforeEach(() => {
    jest.clearAllMocks();
    setHapticsEnabled(true);
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  });
  afterAll(() => Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true }));

  it('mappe chaque geste sur l’API expo-haptics', () => {
    tap();
    select();
    success();
    warning();
    error();
    haptics.impact();
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
    expect(Haptics.impactAsync).toHaveBeenCalledWith('medium');
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenNthCalledWith(1, 'success');
    expect(Haptics.notificationAsync).toHaveBeenNthCalledWith(2, 'warning');
    expect(Haptics.notificationAsync).toHaveBeenNthCalledWith(3, 'error');
  });

  it('ne fait rien quand désactivé', () => {
    setHapticsEnabled(false);
    expect(isHapticsEnabled()).toBe(false);
    tap();
    success();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('ne fait rien sur le web', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    tap();
    select();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it('avale les erreurs du module natif', () => {
    (Haptics.impactAsync as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('pas de moteur')));
    (Haptics.selectionAsync as jest.Mock).mockImplementationOnce(() => {
      throw new Error('module absent');
    });
    expect(() => tap()).not.toThrow();
    expect(() => select()).not.toThrow();
  });
});

describe('a11y', () => {
  it('lit les prix comme on les dit', () => {
    expect(formatPriceForA11y(499)).toBe('4 euros 99');
    expect(formatPriceForA11y(100)).toBe('1 euro');
    expect(formatPriceForA11y(105)).toBe('1 euro 5');
    expect(formatPriceForA11y(500)).toBe('5 euros');
    expect(formatPriceForA11y(45)).toBe('45 centimes');
    expect(formatPriceForA11y(1)).toBe('1 centime');
    expect(formatPriceForA11y(0)).toBe('0 centime');
    expect(formatPriceForA11y(-120)).toBe('moins 1 euro 20');
    expect(formatPriceForA11y(Number.NaN)).toBe('0 centime');
  });

  it('annonce les baisses de prix', () => {
    expect(formatPriceChangeForA11y(349, 399)).toBe('3 euros 49 au lieu de 3 euros 99');
    expect(formatPriceChangeForA11y(349, null)).toBe('3 euros 49');
    expect(formatPriceChangeForA11y(349, 349)).toBe('3 euros 49');
  });

  it('formate durées, comptes et pourcentages', () => {
    expect(formatDurationForA11y(45)).toBe('45 minutes');
    expect(formatDurationForA11y(60)).toBe('1 heure');
    expect(formatDurationForA11y(75)).toBe('1 heure 15 minutes');
    expect(formatDurationForA11y(150)).toBe('2 heures 30 minutes');
    expect(countLabel(1, 'portion')).toBe('1 portion');
    expect(countLabel(3, 'portion')).toBe('3 portions');
    expect(countLabel(2, 'œil', 'yeux')).toBe('2 yeux');
    expect(formatPercentForA11y(0.426)).toBe('43 pour cent');
    expect(formatPercentForA11y(3)).toBe('100 pour cent');
  });
});

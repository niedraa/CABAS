/**
 * settingsStore — réglages de l'appareil (persisté : `cabas/settings`).
 *
 * État :
 *  - `themePreference` : 'system' | 'light' | 'dark' (à passer à `<ThemeProvider preference>`) ;
 *  - `hapticsEnabled` : appliqué à `src/lib/haptics` (au réglage et à l'hydratation) ;
 *  - `notificationPrefs` : NotificationPreferences (défaut : rappel de planification
 *    le dimanche à 18 h, rappel de commande et baisses de prix activés) ;
 *  - `notificationPermission` : dernier statut connu ('granted' | 'denied' | …) ;
 *  - `analyticsConsent` (+ `analyticsConsentAt`) : OPT-IN, faux par défaut (RGPD) ;
 *  - `notifiedPriceDrops` : baisses déjà notifiées (clé produit|magasin → prix).
 * Actions :
 *  - `setThemePreference(p)`, `setHapticsEnabled(b)`, `setAnalyticsConsent(b)` ;
 *  - `updateNotificationPrefs(patch)` → reprogramme les rappels (async) ;
 *  - `requestNotificationPermission()` → statut (à déclencher par un geste explicite) ;
 *  - `reset()`.
 * Les « produits surveillés » (alertes prix) sont dérivés de l'historique de
 * commandes : voir `usePriceWatches()` / `checkPriceDrops()` (stores/priceWatch.ts).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { NotificationPreferences } from '@/core';
import { setHapticsEnabled as applyHaptics } from '@/lib/haptics';
import { setAnalyticsConsent as applyAnalyticsConsent, track } from '@/services/analytics';
import {
  applyNotificationPreferences,
  requestPermission,
  type PermissionStatus,
} from '@/services/notifications';

import { basePersistOptions, registerPersistedStore } from './registry';

export type ThemePreference = 'system' | 'light' | 'dark';

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  planningReminder: true,
  planningReminderWeekday: 6, // dimanche
  planningReminderHour: 18,
  orderReminder: true,
  priceDrops: true,
};

export interface SettingsState {
  hydrated: boolean;
  themePreference: ThemePreference;
  hapticsEnabled: boolean;
  notificationPrefs: NotificationPreferences;
  notificationPermission: PermissionStatus | null;
  analyticsConsent: boolean;
  analyticsConsentAt: string | null;
  notifiedPriceDrops: Record<string, number>;
  setThemePreference(pref: ThemePreference): void;
  setHapticsEnabled(enabled: boolean): void;
  updateNotificationPrefs(patch: Partial<NotificationPreferences>): Promise<void>;
  requestNotificationPermission(): Promise<PermissionStatus>;
  setAnalyticsConsent(granted: boolean): void;
  markPriceDropNotified(key: string, cents: number): void;
  reset(): void;
}

function sanitizePrefs(p: NotificationPreferences): NotificationPreferences {
  const weekday = Number.isFinite(p.planningReminderWeekday) ? Math.round(p.planningReminderWeekday) : 6;
  const hour = Number.isFinite(p.planningReminderHour) ? Math.round(p.planningReminderHour) : 18;
  return {
    planningReminder: !!p.planningReminder,
    planningReminderWeekday: Math.min(6, Math.max(0, weekday)),
    planningReminderHour: Math.min(23, Math.max(0, hour)),
    orderReminder: !!p.orderReminder,
    priceDrops: !!p.priceDrops,
  };
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      themePreference: 'system',
      hapticsEnabled: true,
      notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS },
      notificationPermission: null,
      analyticsConsent: false,
      analyticsConsentAt: null,
      notifiedPriceDrops: {},

      setThemePreference(pref) {
        set({ themePreference: pref });
      },
      setHapticsEnabled(enabled) {
        applyHaptics(enabled);
        set({ hapticsEnabled: enabled });
      },
      async updateNotificationPrefs(patch) {
        const next = sanitizePrefs({ ...get().notificationPrefs, ...patch });
        set({ notificationPrefs: next });
        await applyNotificationPreferences(next);
      },
      async requestNotificationPermission() {
        const status = await requestPermission();
        set({ notificationPermission: status });
        track('notification_permission', { status });
        if (status === 'granted') await applyNotificationPreferences(get().notificationPrefs);
        return status;
      },
      setAnalyticsConsent(granted) {
        set({ analyticsConsent: granted, analyticsConsentAt: new Date().toISOString() });
        applyAnalyticsConsent(granted);
      },
      markPriceDropNotified(key, cents) {
        set({ notifiedPriceDrops: { ...get().notifiedPriceDrops, [key]: cents } });
      },
      reset() {
        applyHaptics(true);
        applyAnalyticsConsent(false);
        set({
          themePreference: 'system',
          hapticsEnabled: true,
          notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS },
          notificationPermission: null,
          analyticsConsent: false,
          analyticsConsentAt: null,
          notifiedPriceDrops: {},
        });
      },
    }),
    {
      ...basePersistOptions<Partial<SettingsState>>('settings'),
      partialize: (s) => ({
        themePreference: s.themePreference,
        hapticsEnabled: s.hapticsEnabled,
        notificationPrefs: s.notificationPrefs,
        notificationPermission: s.notificationPermission,
        analyticsConsent: s.analyticsConsent,
        analyticsConsentAt: s.analyticsConsentAt,
        notifiedPriceDrops: s.notifiedPriceDrops,
      }),
      onRehydrateStorage: () => (state) => {
        // Le réglage haptique vit dans src/lib/haptics : on le réapplique.
        if (state) applyHaptics(state.hapticsEnabled !== false);
      },
    },
  ),
);

registerPersistedStore('settings', useSettingsStore);

/**
 * Réglages — options et libellés purs (notifications, apparence, compte).
 */
import type { NotificationPreferences } from '@/core';
import { MONTH_NAMES, WEEKDAY_NAMES } from '@/core';
import type { PermissionStatus } from '@/services/notifications';
import type { ThemePreference } from '@/stores';

import { localDayOf } from '../premium/paywall';

// ─── Notifications ───────────────────────────────────────────────────────────

/** Jours du rappel de planification (0 = lundi … 6 = dimanche). */
export const REMINDER_WEEKDAYS: readonly { value: number; short: string; name: string }[] = WEEKDAY_NAMES.map((name, value) => ({
  value,
  short: `${name.charAt(0).toUpperCase()}${name.charAt(1)}`,
  name,
}));

export const REMINDER_HOUR_RANGE = { min: 6, max: 22 } as const;

/** 18 → « 18 h » (espace insécable). */
export function formatHour(hour: number): string {
  const h = Math.min(23, Math.max(0, Math.round(Number.isFinite(hour) ? hour : 0)));
  return `${h} h`;
}

/** « Le dimanche à 18 h ». */
export function planningReminderSentence(prefs: Pick<NotificationPreferences, 'planningReminderWeekday' | 'planningReminderHour'>): string {
  const day = WEEKDAY_NAMES[Math.min(6, Math.max(0, Math.round(prefs.planningReminderWeekday)))] ?? 'dimanche';
  return `Le ${day} à ${formatHour(prefs.planningReminderHour)}`;
}

export interface PermissionView {
  tone: 'success' | 'warning' | 'neutral' | 'tip';
  title: string;
  message: string;
  /** Geste proposé : demander, ouvrir les réglages du téléphone, ou rien. */
  action: 'request' | 'settings' | null;
}

/** Bandeau d'état de l'autorisation des notifications. */
export function permissionView(status: PermissionStatus | null): PermissionView {
  switch (status) {
    case 'granted':
      return { tone: 'success', title: 'Notifications activées', message: 'Cabas te prévient au bon moment, jamais plus.', action: null };
    case 'denied':
      return {
        tone: 'warning',
        title: 'Notifications bloquées',
        message: 'Tu peux les réactiver dans les réglages de ton téléphone.',
        action: 'settings',
      };
    case 'unavailable':
      return {
        tone: 'neutral',
        title: 'Pas de notifications ici',
        message: 'Cet appareil ne les prend pas en charge. Tes réglages sont gardés pour ton téléphone.',
        action: null,
      };
    case 'undetermined':
    case null:
    default:
      return {
        tone: 'tip',
        title: 'Active les rappels',
        message: 'Un petit mot le jour où tu planifies, et quand ton panier attend. Rien d’autre.',
        action: 'request',
      };
  }
}

// ─── Apparence ───────────────────────────────────────────────────────────────

export const THEME_CHOICES: readonly { value: ThemePreference; label: string; hint: string }[] = [
  { value: 'system', label: 'Auto', hint: 'Suit ton téléphone' },
  { value: 'light', label: 'Clair', hint: 'Crème & papier' },
  { value: 'dark', label: 'Sombre', hint: 'Nuit au marché' },
];

// ─── Compte ──────────────────────────────────────────────────────────────────

/** Horodatage ISO → « 10 novembre 2026 » (jour local), ou null. */
export function formatLongDate(iso: string | null | undefined): string | null {
  const day = localDayOf(iso);
  if (!day) return null;
  const [y, m, d] = day.split('-').map(Number);
  return `${d === 1 ? '1er' : d} ${MONTH_NAMES[m - 1]} ${y}`;
}

/** « Cabas 1.0.0 · mode démo ». */
export function appVersionLabel(version: string | null | undefined, demo: boolean): string {
  const v = version && version.trim() ? `Cabas ${version.trim()}` : 'Cabas';
  return demo ? `${v} · mode démo` : v;
}

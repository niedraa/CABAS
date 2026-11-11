/**
 * Notifications (expo-notifications) — sans effet sur le web.
 *
 * - `setupNotifications()` : gestionnaire d'affichage au premier plan + canal Android.
 * - `getPermissionStatus()` / `requestPermission()` : jamais de demande implicite.
 * - `scheduleWeeklyPlanningReminder(weekday, hour)` : rappel hebdo « planifie ta
 *   semaine » (weekday 0 = lundi … 6 = dimanche), remplace le précédent.
 * - `scheduleOrderReminder(date)` : rappel ponctuel « pense à commander ».
 * - `notifyPriceDrop(drop)` : notification locale immédiate (baisse de prix).
 * - `scheduleCookingTimerAlert(key, date, content)` / `cancelCookingTimerAlert(key)` :
 *   échéance d'un minuteur du mode cuisine (sonne app fermée / écran verrouillé ;
 *   l'autorisation est demandée au premier minuteur lancé, geste explicite).
 * - `applyNotificationPreferences(prefs)` : (dé)programme selon les réglages.
 * - `registerPushToken(userId)` : jeton Expo enregistré dans `push_tokens` (production).
 * - `subscribeNotificationOpens(fn)` : toucher une notification → `fn(data.url)`
 *   (chemin interne, ex. « /panier »), démarrage à froid compris.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { NotificationPreferences } from '@/core';
import { formatPrice } from '@/core';

import { getSupabase } from './supabase';

type NotificationsModule = typeof import('expo-notifications');
type NotificationResponse = import('expo-notifications').NotificationResponse;

export const PLANNING_REMINDER_ID = 'cabas-planning-reminder';
export const ORDER_REMINDER_ID = 'cabas-order-reminder';
export const COOKING_TIMER_PREFIX = 'cabas-cooking-timer-';
export const ANDROID_CHANNEL_ID = 'cabas-rappels';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export interface PriceDropNotice {
  productId: string;
  storeId: string;
  oldCents: number;
  newCents: number;
  dropPct: number;
  productName?: string;
  storeName?: string;
}

let mod: NotificationsModule | null | undefined;

/** Module natif (null sur le web ou s'il est indisponible). */
function notifications(): NotificationsModule | null {
  if (mod !== undefined) return mod;
  if (Platform.OS === 'web') {
    mod = null;
    return mod;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- module natif chargé à la demande (absent sur le web / en démo)
    mod = require('expo-notifications') as NotificationsModule;
  } catch {
    mod = null;
  }
  return mod;
}

export function notificationsSupported(): boolean {
  return notifications() !== null;
}

/** Jour Cabas (0 = lundi) → jour expo-notifications (1 = dimanche … 7 = samedi). */
export function toExpoWeekday(weekday: number): number {
  const w = ((Math.round(weekday) % 7) + 7) % 7;
  return ((w + 1) % 7) + 1;
}

let setupDone = false;

/** Affichage des notifications au premier plan + canal Android. Idempotent. */
export async function setupNotifications(): Promise<void> {
  const N = notifications();
  if (!N || setupDone) return;
  setupDone = true;
  try {
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Rappels et bons plans',
        importance: N.AndroidImportance.DEFAULT,
        lightColor: '#E8A33D',
      });
    }
  } catch {
    // Module natif absent (Expo Go ancien, tests) : pas de notifications.
  }
}

export async function getPermissionStatus(): Promise<PermissionStatus> {
  const N = notifications();
  if (!N) return 'unavailable';
  try {
    const res = await N.getPermissionsAsync();
    if (res.granted) return 'granted';
    return res.status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'unavailable';
  }
}

/** Demande l'autorisation (à appeler après un geste explicite de l'utilisateur). */
export async function requestPermission(): Promise<PermissionStatus> {
  const N = notifications();
  if (!N) return 'unavailable';
  try {
    const current = await N.getPermissionsAsync();
    if (current.granted) return 'granted';
    if (current.status === 'denied' && !current.canAskAgain) return 'denied';
    const res = await N.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    });
    return res.granted ? 'granted' : res.status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'unavailable';
  }
}

async function cancel(id: string): Promise<void> {
  const N = notifications();
  if (!N) return;
  try {
    await N.cancelScheduledNotificationAsync(id);
  } catch {
    // pas programmée
  }
}

/** Rappel hebdomadaire de planification (remplace le précédent). Renvoie l'id, ou null. */
export async function scheduleWeeklyPlanningReminder(weekday: number, hour: number, minute = 0): Promise<string | null> {
  const N = notifications();
  if (!N) return null;
  await cancel(PLANNING_REMINDER_ID);
  try {
    return await N.scheduleNotificationAsync({
      identifier: PLANNING_REMINDER_ID,
      content: {
        title: 'Ta semaine t’attend 🧺',
        body: 'Deux minutes pour planifier tes repas : ta liste se fait toute seule.',
        data: { url: '/' },
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.WEEKLY,
        weekday: toExpoWeekday(weekday),
        hour: Math.min(23, Math.max(0, Math.round(hour))),
        minute: Math.min(59, Math.max(0, Math.round(minute))),
        channelId: ANDROID_CHANNEL_ID,
      },
    });
  } catch {
    return null;
  }
}

export async function cancelPlanningReminder(): Promise<void> {
  await cancel(PLANNING_REMINDER_ID);
}

/** Rappel ponctuel de commande (remplace le précédent ; ignoré si la date est passée). */
export async function scheduleOrderReminder(date: Date): Promise<string | null> {
  const N = notifications();
  if (!N || !(date instanceof Date) || !Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) return null;
  await cancel(ORDER_REMINDER_ID);
  try {
    return await N.scheduleNotificationAsync({
      identifier: ORDER_REMINDER_ID,
      content: {
        title: 'Ton panier est prêt 🛒',
        body: 'Pense à valider ta commande drive pour être livré à temps.',
        data: { url: '/panier' },
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date, channelId: ANDROID_CHANNEL_ID },
    });
  } catch {
    return null;
  }
}

export async function cancelOrderReminder(): Promise<void> {
  await cancel(ORDER_REMINDER_ID);
}

/** Texte de la notification de baisse de prix. */
export function priceDropContent(drop: PriceDropNotice): { title: string; body: string } {
  const name = drop.productName ?? 'Un de tes produits';
  const where = drop.storeName ? ` chez ${drop.storeName}` : '';
  return {
    title: `Baisse de prix : −${Math.round(drop.dropPct)} %`,
    body: `${name} passe à ${formatPrice(drop.newCents)}${where} (au lieu de ${formatPrice(drop.oldCents)}).`,
  };
}

/** Notification locale immédiate de baisse de prix. */
export async function notifyPriceDrop(drop: PriceDropNotice): Promise<string | null> {
  const N = notifications();
  if (!N) return null;
  try {
    return await N.scheduleNotificationAsync({
      identifier: `cabas-price-drop-${drop.productId}-${drop.storeId}`,
      content: { ...priceDropContent(drop), data: { url: `/panier`, productId: drop.productId, storeId: drop.storeId } },
      trigger: null,
    });
  } catch {
    return null;
  }
}

// Jeton par minuteur : une annulation pendant la demande d'autorisation l'emporte.
const cookingTimerTokens = new Map<string, number>();

function bumpCookingTimer(key: string): number {
  const token = (cookingTimerTokens.get(key) ?? 0) + 1;
  cookingTimerTokens.set(key, token);
  return token;
}

/**
 * Notification locale à l'échéance d'un minuteur du mode cuisine (remplace la
 * précédente du même minuteur). À appeler quand l'utilisateur lance le
 * minuteur : l'autorisation est demandée à ce moment-là si besoin.
 */
export async function scheduleCookingTimerAlert(
  key: string,
  date: Date,
  content: { title: string; body: string; url?: string },
): Promise<string | null> {
  const N = notifications();
  if (!N || !(date instanceof Date) || !Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) return null;
  const token = bumpCookingTimer(key);
  const id = `${COOKING_TIMER_PREFIX}${key}`;
  await cancel(id);
  let status = await getPermissionStatus();
  if (status === 'undetermined') status = await requestPermission();
  // Refusé, ou minuteur mis en pause / remis à zéro entre-temps.
  if (status !== 'granted' || cookingTimerTokens.get(key) !== token) return null;
  try {
    return await N.scheduleNotificationAsync({
      identifier: id,
      content: {
        title: content.title,
        body: content.body.slice(0, 180),
        sound: 'default',
        data: { url: content.url ?? '/', kind: 'cooking-timer' },
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date, channelId: ANDROID_CHANNEL_ID },
    });
  } catch {
    return null;
  }
}

/** Annule l'alerte d'un minuteur (pause, remise à zéro, échéance vue dans l'app). */
export async function cancelCookingTimerAlert(key: string): Promise<void> {
  bumpCookingTimer(key);
  await cancel(`${COOKING_TIMER_PREFIX}${key}`);
}

/** Applique les réglages : rappel de planification programmé ou annulé. */
export async function applyNotificationPreferences(prefs: NotificationPreferences): Promise<void> {
  if (!notificationsSupported()) return;
  if ((await getPermissionStatus()) !== 'granted') return;
  if (prefs.planningReminder) {
    await scheduleWeeklyPlanningReminder(prefs.planningReminderWeekday, prefs.planningReminderHour);
  } else {
    await cancelPlanningReminder();
  }
  if (!prefs.orderReminder) await cancelOrderReminder();
}

/** Enregistre le jeton push Expo de l'appareil (production, autorisation accordée). */
export async function registerPushToken(userId: string): Promise<string | null> {
  const N = notifications();
  const supabase = getSupabase();
  if (!N || !supabase) return null;
  if ((await getPermissionStatus()) !== 'granted') return null;
  try {
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const { data: token } = await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const { error } = await supabase.from('push_tokens').upsert(
      {
        user_id: userId,
        token,
        platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
        device_name: (Constants.deviceName ?? '').slice(0, 120) || null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'token' },
    );
    if (error) throw error;
    return token;
  } catch {
    return null;
  }
}

/**
 * Chemin interne porté par une notification (`data.url`, ex. « /panier »), ou
 * null : seules les routes de l'app (« /… ») sont suivies, jamais une URL externe.
 */
export function notificationUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const url = (data as { url?: unknown }).url;
  if (typeof url !== 'string') return null;
  return url.startsWith('/') && !url.startsWith('//') ? url : null;
}

/**
 * Toucher une notification (action par défaut) : `listener(url)` reçoit son
 * `data.url`. La notification qui a lancé l'app (démarrage à froid) est traitée
 * une fois puis oubliée. Renvoie le désabonnement (sans effet sur le web).
 */
export function subscribeNotificationOpens(listener: (url: string) => void): () => void {
  const N = notifications();
  if (!N) return () => undefined;
  const handle = (response: NotificationResponse | null | undefined) => {
    if (!response || response.actionIdentifier !== N.DEFAULT_ACTION_IDENTIFIER) return;
    try {
      N.clearLastNotificationResponse();
    } catch {
      // déjà oubliée
    }
    const url = notificationUrl(response.notification.request.content.data);
    if (url) listener(url);
  };
  let sub: { remove(): void } | null = null;
  try {
    handle(N.getLastNotificationResponse());
    sub = N.addNotificationResponseReceivedListener(handle);
  } catch {
    // Module natif absent (tests, Expo Go ancien) : rien à écouter.
  }
  return () => sub?.remove();
}

/** Réinitialise l'état interne (tests). */
export function __resetNotificationsForTests(): void {
  mod = undefined;
  setupDone = false;
  cookingTimerTokens.clear();
}

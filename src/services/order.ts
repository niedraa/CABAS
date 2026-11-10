/**
 * Transmission de la commande (V1) : ouverture du drive / de la livraison de
 * l'enseigne avec le panier préparé, et copie de la liste.
 *
 * - `openOrder(handoff)` : navigateur intégré (expo-web-browser), repli
 *   `Linking.openURL` ; renvoie `true` si l'URL a pu être ouverte.
 * - `copyListToClipboard(text)` : presse-papiers (expo-clipboard).
 */
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

import type { OrderHandoff } from '@/core';

import { track } from './analytics';
import { captureError } from './monitoring';

/** Couleurs de la barre du navigateur intégré (forêt / crème de la DA). */
const BROWSER_COLORS = { toolbarColor: '#173A2C', controlsColor: '#F6F1E7' } as const;

export async function openOrder(handoff: OrderHandoff): Promise<boolean> {
  if (!handoff.url) return false;
  const props = {
    storeId: handoff.storeId,
    channel: handoff.channel,
    lines: handoff.lines.length,
    totalCents: handoff.totalCents,
  };
  try {
    await WebBrowser.openBrowserAsync(handoff.url, {
      toolbarColor: BROWSER_COLORS.toolbarColor,
      controlsColor: BROWSER_COLORS.controlsColor,
      dismissButtonStyle: 'close',
      enableBarCollapsing: true,
    });
    track('order_opened', { ...props, via: 'in_app_browser' });
    return true;
  } catch (err) {
    try {
      await Linking.openURL(handoff.url);
      track('order_opened', { ...props, via: 'linking' });
      return true;
    } catch (err2) {
      captureError(err2, { where: 'openOrder', storeId: handoff.storeId, first: String(err) });
      return false;
    }
  }
}

export async function copyListToClipboard(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    track('order_list_copied', { length: text.length });
    return true;
  } catch (err) {
    captureError(err, { where: 'copyListToClipboard' });
    return false;
  }
}

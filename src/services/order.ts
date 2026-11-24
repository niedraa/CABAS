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
import { Linking, Platform, Share } from 'react-native';

import { buildProductSearchUrl, productSearchQuery, type OrderHandoff, type Product, type Store } from '@/core';

import { getCatalogSnapshot, INGREDIENT_NAMES_ES } from './catalog';

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

export type ShareOutcome = 'shared' | 'copied' | 'failed';

/**
 * Partage un texte (feuille de partage du système) ; repli : copie dans le
 * presse-papiers (navigateur sans Web Share, partage refusé).
 */
export async function shareText(text: string, title = 'Ma liste Cabas'): Promise<ShareOutcome> {
  const canNativeShare = Platform.OS !== 'web' || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  if (canNativeShare) {
    try {
      await Share.share({ message: text, title });
      track('list_shared', { via: 'share', length: text.length });
      return 'shared';
    } catch {
      // Partage annulé ou indisponible : on copie.
    }
  }
  const copied = await copyListToClipboard(text);
  return copied ? 'copied' : 'failed';
}

/** URL de la recherche du produit sur le site de l'enseigne. */
export function productUrlOnStoreSite(store: Store, product: Product): string {
  const ingredientName = getCatalogSnapshot().ingredientsById[product.ingredientId]?.name;
  return buildProductSearchUrl(store, product, productSearchQuery(store, product, ingredientName, INGREDIENT_NAMES_ES));
}

/** Ouvre le produit sur le site de l'enseigne (navigateur intégré, repli Linking). */
export async function openProductOnStoreSite(store: Store, product: Product): Promise<boolean> {
  const url = productUrlOnStoreSite(store, product);
  try {
    await WebBrowser.openBrowserAsync(url, {
      toolbarColor: BROWSER_COLORS.toolbarColor,
      controlsColor: BROWSER_COLORS.controlsColor,
      dismissButtonStyle: 'close',
    });
    track('order_opened', { storeId: store.id, via: 'product_search' });
    return true;
  } catch {
    try {
      await Linking.openURL(url);
      return true;
    } catch (err) {
      captureError(err, { where: 'openProductOnStoreSite', storeId: store.id });
      return false;
    }
  }
}

/**
 * Alertes prix (Premium) — produits habituels dérivés de l'historique de
 * commandes (core › habitualProducts / watchesFromHandoffs).
 *
 * - `selectPriceWatches(orders)` / hook `usePriceWatches()` : PriceWatch[]
 *   (produit × magasin commandé au moins 2 fois, dernier prix payé) ;
 * - hook `usePriceDrops()` : baisses ≥ 5 % sur le catalogue courant ;
 * - `checkPriceDrops()` : détecte les baisses et envoie UNE notification locale
 *   par (produit, magasin, prix) — si Premium et réglage « baisses de prix » actif.
 *   Appelé par `useAppBootstrap` après le chargement du catalogue.
 */
import { useMemo } from 'react';

import type { PriceDrop, PriceWatch } from '@/core';
import { canUse, detectPriceDrops, watchesFromHandoffs } from '@/core';
import { getCatalogSnapshot, useCatalog } from '@/services/catalog';
import { notifyPriceDrop } from '@/services/notifications';

import { useOrderStore, type StoredOrder } from './orderStore';
import { useSettingsStore } from './settingsStore';
import { currentEntitlement } from './subscriptionStore';

export function selectPriceWatches(orders: readonly StoredOrder[]): PriceWatch[] {
  return watchesFromHandoffs(orders.filter((o) => o.status !== 'prepared'));
}

export function usePriceWatches(): PriceWatch[] {
  const orders = useOrderStore((s) => s.orders);
  return useMemo(() => selectPriceWatches(orders), [orders]);
}

export function usePriceDrops(): PriceDrop[] {
  const watches = usePriceWatches();
  const catalog = useCatalog();
  return useMemo(() => detectPriceDrops(watches, catalog.prices), [watches, catalog]);
}

/** Détecte et notifie les nouvelles baisses de prix. Renvoie les baisses notifiées. */
export async function checkPriceDrops(): Promise<PriceDrop[]> {
  const settings = useSettingsStore.getState();
  if (!settings.notificationPrefs.priceDrops || !canUse('price_alerts', currentEntitlement())) return [];
  const catalog = getCatalogSnapshot();
  const drops = detectPriceDrops(selectPriceWatches(useOrderStore.getState().orders), catalog.prices);
  const sent: PriceDrop[] = [];
  for (const drop of drops) {
    const key = `${drop.productId}|${drop.storeId}`;
    if (settings.notifiedPriceDrops[key] === drop.newCents) continue;
    const id = await notifyPriceDrop({
      ...drop,
      productName: catalog.productsById[drop.productId]?.name,
      storeName: catalog.storesById[drop.storeId]?.name,
    });
    if (id) {
      useSettingsStore.getState().markPriceDropNotified(key, drop.newCents);
      sent.push(drop);
    }
  }
  return sent;
}

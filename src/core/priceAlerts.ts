/**
 * Alertes prix : détection des baisses sur les produits habituels
 * (produits commandés plusieurs fois), utilisée par l'Edge Function
 * send-notifications et par l'écran « Alertes ».
 */
import type { OrderHandoff, Price } from './types';
import { effectivePrice } from './priceComparison';

export interface PriceWatch {
  productId: string;
  storeId: string;
  /** Prix de référence (dernier prix payé / vu), centimes. */
  referenceCents: number;
}

export interface PriceDrop {
  productId: string;
  storeId: string;
  oldCents: number;
  newCents: number;
  /** Baisse en %, arrondie au dixième. */
  dropPct: number;
}

/** Baisses de prix ≥ seuil (5 % par défaut), triées de la plus forte à la plus faible. */
export function detectPriceDrops(
  watch: readonly PriceWatch[],
  prices: readonly Price[],
  opts: { thresholdPct?: number; now?: string } = {},
): PriceDrop[] {
  const threshold = opts.thresholdPct ?? 5;
  // Prix le plus récent par (produit, magasin).
  const latest = new Map<string, Price>();
  for (const p of prices) {
    const key = `${p.productId}|${p.storeId}`;
    const prev = latest.get(key);
    if (!prev || p.updatedAt >= prev.updatedAt) latest.set(key, p);
  }
  const drops: PriceDrop[] = [];
  const seen = new Set<string>();
  for (const w of watch) {
    const key = `${w.productId}|${w.storeId}`;
    if (seen.has(key) || !(w.referenceCents > 0)) continue;
    seen.add(key);
    const price = latest.get(key);
    if (!price) continue;
    const newCents = effectivePrice(price, opts.now).cents;
    const dropPct = Math.round(((w.referenceCents - newCents) / w.referenceCents) * 1000) / 10;
    if (newCents < w.referenceCents && dropPct >= threshold) {
      drops.push({ productId: w.productId, storeId: w.storeId, oldCents: w.referenceCents, newCents, dropPct });
    }
  }
  return drops.sort((a, b) => b.dropPct - a.dropPct || (a.productId < b.productId ? -1 : 1));
}

/**
 * Produits habituels : achetés dans au moins `minOccurrences` commandes
 * (une commande compte une fois par produit), triés par fréquence.
 */
export function habitualProducts(
  handoffs: readonly OrderHandoff[],
  minOccurrences = 2,
): { productId: string; storeId: string; count: number }[] {
  const counts = new Map<string, { productId: string; storeId: string; count: number }>();
  for (const h of handoffs) {
    const inThisOrder = new Set<string>();
    for (const l of h.lines) {
      const key = `${l.productId}|${h.storeId}`;
      if (inThisOrder.has(key)) continue;
      inThisOrder.add(key);
      const c = counts.get(key) ?? { productId: l.productId, storeId: h.storeId, count: 0 };
      c.count += 1;
      counts.set(key, c);
    }
  }
  return Array.from(counts.values())
    .filter((c) => c.count >= minOccurrences)
    .sort(
      (a, b) =>
        b.count - a.count ||
        (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0) ||
        (a.storeId < b.storeId ? -1 : a.storeId > b.storeId ? 1 : 0),
    );
}

/**
 * Prix de référence des produits habituels : le dernier prix payé dans les
 * commandes (total de la ligne / nombre de conditionnements).
 */
export function watchesFromHandoffs(handoffs: readonly OrderHandoff[], minOccurrences = 2): PriceWatch[] {
  const habitual = new Set(habitualProducts(handoffs, minOccurrences).map((h) => `${h.productId}|${h.storeId}`));
  const lastPaid = new Map<string, { at: string; cents: number }>();
  for (const h of handoffs) {
    for (const l of h.lines) {
      const key = `${l.productId}|${h.storeId}`;
      if (!habitual.has(key) || !(l.packs > 0)) continue;
      const prev = lastPaid.get(key);
      if (!prev || h.createdAt >= prev.at) lastPaid.set(key, { at: h.createdAt, cents: Math.round(l.totalCents / l.packs) });
    }
  }
  return Array.from(lastPaid.entries()).map(([key, v]) => {
    const [productId, storeId] = key.split('|');
    return { productId, storeId, referenceCents: v.cents };
  });
}

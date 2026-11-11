// GENERATED — do not edit.
// Copie générée de src/core par scripts/sync-shared.mjs (npm run sync:shared).
// Toute modification doit être faite dans src/core puis resynchronisée.
/**
 * Alertes prix : détection des baisses sur les produits habituels
 * (produits commandés plusieurs fois), utilisée par l'Edge Function
 * send-notifications et par l'écran « Alertes ».
 */
import type { Allergen, OrderHandoff, Price, Product } from './types.ts';
import { effectivePrice, isEstimatedPrice, isPreferredPrice, isUsablePrice, productContainsAllergen } from './priceComparison.ts';

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

/** Produits connus, par id (Map ou objet) — seuls leurs allergènes sont lus. */
export type ProductsLookup =
  | ReadonlyMap<string, Pick<Product, 'allergens'>>
  | Readonly<Record<string, Pick<Product, 'allergens'> | undefined>>;

export interface PriceDropOptions {
  thresholdPct?: number;
  now?: string;
  /**
   * Allergènes déclarés du profil : AUCUNE alerte sur un produit qui en
   * contient un (allergènes de l'ingrédient ∪ Open Food Facts). Exige
   * `products` ; un produit inconnu n'est jamais signalé (on ne peut pas
   * vérifier qu'il est sûr).
   */
  excludeAllergens?: readonly Allergen[];
  products?: ProductsLookup;
}

function lookupProduct(products: ProductsLookup | undefined, id: string): Pick<Product, 'allergens'> | undefined {
  if (!products) return undefined;
  if (products instanceof Map) return products.get(id);
  return (products as Readonly<Record<string, Pick<Product, 'allergens'> | undefined>>)[id];
}

/**
 * Faut-il ignorer cette surveillance ? Oui si le profil déclare des
 * allergènes et que le produit est inconnu ou en contient un (fail closed).
 */
function unsafeWatch(productId: string, opts: PriceDropOptions): boolean {
  if (!opts.excludeAllergens || opts.excludeAllergens.length === 0) return false;
  const product = lookupProduct(opts.products, productId);
  return !product || productContainsAllergen(product, opts.excludeAllergens);
}

/**
 * Baisses de prix ≥ seuil (5 % par défaut), triées de la plus forte à la plus
 * faible. Les prix ESTIMÉS sont ignorés : seule une baisse constatée compte.
 * Avec `excludeAllergens`, jamais d'alerte sur un produit contenant un
 * allergène déclaré (ni sur un produit inconnu).
 */
export function detectPriceDrops(
  watch: readonly PriceWatch[],
  prices: readonly Price[],
  opts: PriceDropOptions = {},
): PriceDrop[] {
  const threshold = opts.thresholdPct ?? 5;
  // Prix le plus récent par (produit, magasin).
  const latest = new Map<string, Price>();
  for (const p of prices) {
    if (!isUsablePrice(p)) continue; // prix NaN / nul / négatif : jamais une « baisse »
    // Une estimation n'est pas un prix constaté : aucune « baisse » calculée dessus.
    if (isEstimatedPrice(p)) continue;
    const key = `${p.productId}|${p.storeId}`;
    const prev = latest.get(key);
    if (!prev || isPreferredPrice(p, prev)) latest.set(key, p);
  }
  const drops: PriceDrop[] = [];
  const seen = new Set<string>();
  for (const w of watch) {
    const key = `${w.productId}|${w.storeId}`;
    if (seen.has(key) || !(w.referenceCents > 0)) continue;
    seen.add(key);
    // Produit contenant un allergène déclaré du profil : jamais proposé, même par une alerte.
    if (unsafeWatch(w.productId, opts)) continue;
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
 * commandes (total de la ligne / nombre de conditionnements), hors lignes au
 * prix estimé.
 */
export function watchesFromHandoffs(handoffs: readonly OrderHandoff[], minOccurrences = 2): PriceWatch[] {
  const habitual = new Set(habitualProducts(handoffs, minOccurrences).map((h) => `${h.productId}|${h.storeId}`));
  const lastPaid = new Map<string, { at: string; cents: number }>();
  for (const h of handoffs) {
    for (const l of h.lines) {
      const key = `${l.productId}|${h.storeId}`;
      // Ligne payée à un prix ESTIMÉ : pas une référence (la baisse serait calculée sur une estimation).
      if (!habitual.has(key) || !(l.packs > 0) || l.priceSource === 'estimate') continue;
      const prev = lastPaid.get(key);
      if (!prev || h.createdAt >= prev.at) lastPaid.set(key, { at: h.createdAt, cents: Math.round(l.totalCents / l.packs) });
    }
  }
  return Array.from(lastPaid.entries()).map(([key, v]) => {
    const [productId, storeId] = key.split('|');
    return { productId, storeId, referenceCents: v.cents };
  });
}

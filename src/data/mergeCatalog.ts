/**
 * Fusion du catalogue de démonstration (prix estimés) et des prix RÉELS
 * relevés (Open Prices) : pour un même ingrédient dans un même magasin, les
 * relevés remplacent les estimations. Pur (imports de types uniquement).
 */
import type { Price, Product } from '../core/types';

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Recalage des estimations sur le marché réel : pour un ingrédient relevé
 * dans au moins un magasin, les estimations restantes sont multipliées par
 * (prix au kilo relevé médian ÷ prix au kilo estimé médian), borné à [0,5 ; 2].
 * Sans cela, une enseigne sans relevé paraîtrait artificiellement moins chère.
 */
export function calibrationFactors(
  products: readonly Product[],
  demoPrices: readonly Price[],
  realPrices: readonly Price[],
): Map<string, number> {
  const byId = new Map(products.map((p) => [p.id, p]));
  const unit = (pr: Price) => {
    const p = byId.get(pr.productId);
    return p && p.packSize > 0 ? { ing: p.ingredientId, v: pr.priceCents / p.packSize } : null;
  };
  const real = new Map<string, number[]>();
  for (const pr of realPrices) {
    const u = unit(pr);
    if (u) real.set(u.ing, [...(real.get(u.ing) ?? []), u.v]);
  }
  const demo = new Map<string, number[]>();
  for (const pr of demoPrices) {
    const p = byId.get(pr.productId);
    if (!p || p.organic) continue;
    const u = unit(pr);
    if (u && real.has(u.ing)) demo.set(u.ing, [...(demo.get(u.ing) ?? []), u.v]);
  }
  const out = new Map<string, number>();
  for (const [ing, values] of real) {
    const d = demo.get(ing);
    if (!d || d.length === 0) continue;
    out.set(ing, Math.min(2, Math.max(0.5, median(values) / median(d))));
  }
  return out;
}

export function mergeRealPrices(
  demoProducts: readonly Product[],
  demoPrices: readonly Price[],
  realProducts: readonly Product[],
  realPrices: readonly Price[],
): { products: Product[]; prices: Price[] } {
  const ingredientOf = new Map<string, string>();
  for (const p of demoProducts) ingredientOf.set(p.id, p.ingredientId);
  for (const p of realProducts) ingredientOf.set(p.id, p.ingredientId);
  const covered = new Set(realPrices.map((p) => `${ingredientOf.get(p.productId)}|${p.storeId}`));
  const demoIds = new Set(demoProducts.map((p) => p.id));
  const products = [...demoProducts, ...realProducts.filter((p) => !demoIds.has(p.id))];
  const factors = calibrationFactors(products, demoPrices, realPrices);
  const estimates = demoPrices
    .filter((p) => !covered.has(`${ingredientOf.get(p.productId)}|${p.storeId}`))
    .map((p) => {
      const f = factors.get(ingredientOf.get(p.productId) ?? '');
      if (!f || f === 1) return p;
      const next: Price = { ...p, priceCents: Math.max(1, Math.round(p.priceCents * f)) };
      if (p.promoPriceCents !== undefined) next.promoPriceCents = Math.max(1, Math.min(next.priceCents - 1, Math.round(p.promoPriceCents * f)));
      return next;
    });
  return { products, prices: [...estimates, ...realPrices] };
}

/** Part des prix réels (relevés) dans un ensemble de prix, 0 → 1. */
export function realPriceShare(prices: readonly Pick<Price, 'source'>[]): number {
  if (prices.length === 0) return 0;
  return prices.filter((p) => p.source !== 'demo').length / prices.length;
}

/**
 * Panier optimisé.
 *
 * - « un seul magasin » (`single_store`) : le magasin qui couvre le plus
 *   d'articles, puis le meilleur total frais inclus ;
 * - « le moins cher » (`cheapest`) : énumération EXHAUSTIVE des combinaisons
 *   d'au plus `maxStores` magasins (2 par défaut), chaque article allant au
 *   magasin le moins cher de la combinaison ; frais de retrait / livraison
 *   par magasin utilisé ; minimum de commande respecté si possible.
 *
 * Ordre de choix : couverture maximale, puis total minimal, puis moins de
 * magasins, puis ids de magasins (déterminisme).
 */
import type { BasketLine, BasketMode, BasketPlan, BasketStorePart, ItemComparison, OrderChannel, Store, StoreOffer } from './types';

export interface StoreTotal {
  storeId: string;
  subtotalCents: number;
  feesCents: number;
  totalCents: number;
  coveredItemIds: string[];
  missingItemIds: string[];
}

export interface OptimizeOptions {
  /** Nombre max de magasins dans le mode « le moins cher » (défaut 2). */
  maxStores?: number;
  /** Inclure les frais de retrait / livraison (défaut true). */
  includeFees?: boolean;
  channel?: OrderChannel;
  /** Restreint aux magasins choisis par l'utilisateur. */
  allowedStoreIds?: string[];
  now?: string;
}

/** Au-delà, on présélectionne les meilleurs magasins (combinatoire maîtrisée). */
export const MAX_ENUMERATED_STORES = 6;

/** Frais d'un magasin pour un canal ; null si le canal n'est pas proposé. */
export function storeFees(store: Store, channel: OrderChannel = 'drive'): number | null {
  if (channel === 'delivery') return store.deliveryFeeCents ?? null;
  return store.driveFeeCents ?? 0;
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Totaux « tout dans ce magasin » pour chaque magasin. */
export function storeTotals(
  comparisons: readonly ItemComparison[],
  stores: readonly Store[],
  opts: Pick<OptimizeOptions, 'channel' | 'includeFees'> = {},
): StoreTotal[] {
  const includeFees = opts.includeFees ?? true;
  return stores.map((store) => {
    let subtotal = 0;
    const covered: string[] = [];
    const missing: string[] = [];
    for (const c of comparisons) {
      const offer = c.offers.find((o) => o.storeId === store.id);
      if (offer) {
        subtotal += offer.totalCents;
        covered.push(c.itemId);
      } else {
        missing.push(c.itemId);
      }
    }
    const fees = includeFees ? (storeFees(store, opts.channel) ?? 0) : 0;
    return {
      storeId: store.id,
      subtotalCents: subtotal,
      feesCents: fees,
      totalCents: subtotal + fees,
      coveredItemIds: covered,
      missingItemIds: missing,
    };
  });
}

interface Evaluation {
  parts: BasketStorePart[];
  coveredIds: Set<string>;
  missingItemIds: string[];
  totalCents: number;
  valid: boolean;
  key: string;
}

/** Combinaisons de taille 1..k (ordre stable). */
function subsets<T>(items: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length > 0) out.push(acc.slice());
    if (acc.length === k) return;
    for (let i = start; i < items.length; i++) {
      acc.push(items[i]);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

function evaluate(
  subset: readonly Store[],
  comparisons: readonly ItemComparison[],
  channel: OrderChannel,
  includeFees: boolean,
): Evaluation {
  const order = new Map(subset.map((s, i) => [s.id, i]));
  const linesByStore = new Map<string, BasketLine[]>();
  const coveredIds = new Set<string>();
  const missingItemIds: string[] = [];
  for (const c of comparisons) {
    let best: StoreOffer | undefined;
    for (const o of c.offers) {
      if (!order.has(o.storeId)) continue;
      if (
        !best ||
        o.totalCents < best.totalCents ||
        (o.totalCents === best.totalCents &&
          (o.pricePerBaseUnitCents < best.pricePerBaseUnitCents ||
            (o.pricePerBaseUnitCents === best.pricePerBaseUnitCents &&
              (order.get(o.storeId) as number) < (order.get(best.storeId) as number))))
      ) {
        best = o;
      }
    }
    if (!best) {
      missingItemIds.push(c.itemId);
      continue;
    }
    coveredIds.add(c.itemId);
    const line: BasketLine = {
      itemId: c.itemId,
      label: c.label,
      productId: best.productId,
      packs: best.packs,
      totalCents: best.totalCents,
    };
    const lines = linesByStore.get(best.storeId);
    if (lines) lines.push(line);
    else linesByStore.set(best.storeId, [line]);
  }

  const parts: BasketStorePart[] = [];
  let total = 0;
  let valid = true;
  for (const store of subset) {
    const lines = linesByStore.get(store.id);
    if (!lines) continue; // magasin de la combinaison inutilisé : pas de frais
    const subtotalCents = lines.reduce((s, l) => s + l.totalCents, 0);
    const feesCents = includeFees ? (storeFees(store, channel) ?? 0) : 0;
    if (subtotalCents < (store.minOrderCents ?? 0)) valid = false;
    parts.push({ storeId: store.id, lines, subtotalCents, feesCents });
    total += subtotalCents + feesCents;
  }
  return {
    parts,
    coveredIds,
    missingItemIds,
    totalCents: total,
    valid,
    key: parts
      .map((p) => p.storeId)
      .sort(cmpStr)
      .join('|'),
  };
}

function better(a: Evaluation, b: Evaluation): boolean {
  if (a.coveredIds.size !== b.coveredIds.size) return a.coveredIds.size > b.coveredIds.size;
  if (a.totalCents !== b.totalCents) return a.totalCents < b.totalCents;
  if (a.parts.length !== b.parts.length) return a.parts.length < b.parts.length;
  return a.key < b.key;
}

/** Calcule le panier optimal (déterministe). */
export function optimizeBasket(
  comparisons: readonly ItemComparison[],
  stores: readonly Store[],
  mode: BasketMode,
  opts: OptimizeOptions = {},
): BasketPlan {
  const channel = opts.channel ?? 'drive';
  const includeFees = opts.includeFees ?? true;
  const maxStores = Math.max(1, Math.floor(opts.maxStores ?? 2));
  const allowed = opts.allowedStoreIds && opts.allowedStoreIds.length > 0 ? new Set(opts.allowedStoreIds) : undefined;

  let eligible = stores
    .filter((s) => (!allowed || allowed.has(s.id)) && storeFees(s, channel) !== null)
    .slice()
    .sort((a, b) => cmpStr(a.id, b.id));

  if (eligible.length > MAX_ENUMERATED_STORES) {
    // Présélection : meilleure couverture, puis meilleur total mono-magasin.
    const totals = new Map(storeTotals(comparisons, eligible, { channel, includeFees }).map((t) => [t.storeId, t]));
    eligible = eligible
      .slice()
      .sort((a, b) => {
        const ta = totals.get(a.id) as StoreTotal;
        const tb = totals.get(b.id) as StoreTotal;
        return tb.coveredItemIds.length - ta.coveredItemIds.length || ta.totalCents - tb.totalCents || cmpStr(a.id, b.id);
      })
      .slice(0, MAX_ENUMERATED_STORES)
      .sort((a, b) => cmpStr(a.id, b.id));
  }

  const combos = mode === 'single_store' ? eligible.map((s) => [s]) : subsets(eligible, Math.min(maxStores, eligible.length));
  const evaluations = combos.map((c) => evaluate(c, comparisons, channel, includeFees));
  const valid = evaluations.filter((e) => e.valid);
  const pool = valid.length > 0 ? valid : evaluations;

  let chosen: Evaluation | undefined;
  for (const e of pool) if (!chosen || better(e, chosen)) chosen = e;

  const computedAt = opts.now ?? new Date().toISOString();
  if (!chosen) {
    return {
      mode,
      parts: [],
      totalCents: 0,
      savingsCents: 0,
      missingItemIds: comparisons.map((c) => c.itemId),
      computedAt,
    };
  }

  // Économie vs. le magasin unique le plus cher couvrant les mêmes articles.
  let worst = 0;
  for (const store of eligible) {
    let subtotal = 0;
    let coversAll = true;
    for (const c of comparisons) {
      if (!chosen.coveredIds.has(c.itemId)) continue;
      const offer = c.offers.find((o) => o.storeId === store.id);
      if (!offer) {
        coversAll = false;
        break;
      }
      subtotal += offer.totalCents;
    }
    if (!coversAll || chosen.coveredIds.size === 0) continue;
    const fees = includeFees ? (storeFees(store, channel) ?? 0) : 0;
    worst = Math.max(worst, subtotal + fees);
  }

  return {
    mode,
    parts: chosen.parts,
    totalCents: chosen.totalCents,
    savingsCents: Math.max(0, worst - chosen.totalCents),
    missingItemIds: chosen.missingItemIds,
    computedAt,
  };
}

/**
 * Logique de présentation PURE de l'onglet « Prix » (comparateur + panier
 * optimisé) : état de l'écran, ticket récapitulatif, lignes de comparaison,
 * articles introuvables, gain potentiel du mode Premium. Aucun import React :
 * testable seul.
 */
import type {
  BasketLine,
  BasketMode,
  BasketPlan,
  BasketStorePart,
  ItemComparison,
  OrderChannel,
  Product,
  ShoppingList,
  Store,
  StoreOffer,
} from '@/core';
import { formatPrice, formatQuantity, hasEstimatedPrice, optimizeBasket, storeDisplayName, storeFees } from '@/core';

// ─── Libellés ────────────────────────────────────────────────────────────────

/** CTA de commande : « Commander chez Leclerc » (« Ma liste pour Lidl » sans commande en ligne). */
export function orderCtaLabel(store: Pick<Store, 'chain' | 'name'> & Partial<Pick<Store, 'pickup'>> | null | undefined): string {
  const name = storeDisplayName(store, { short: true });
  return store?.pickup === 'none' ? `Ma liste pour ${name}` : `Commander chez ${name}`;
}

export const CHANNEL_LABELS: Record<OrderChannel, string> = { drive: 'Drive', delivery: 'Livraison' };

/**
 * Service réellement rendu par un magasin pour le canal : « Drive »,
 * « Click & collect », « En magasin » (enseigne sans retrait en ligne) ou
 * « Livraison ».
 */
export function serviceLabel(store: Partial<Pick<Store, 'pickup'>> | null | undefined, channel: OrderChannel): string {
  if (channel === 'delivery') return CHANNEL_LABELS.delivery;
  if (store?.pickup === 'click_collect') return 'Click & collect';
  if (store?.pickup === 'none') return 'En magasin';
  return CHANNEL_LABELS.drive;
}

/** Nombre de lignes au prix estimé. */
export function estimatedCount(lines: readonly Pick<BasketLine, 'priceSource'>[]): number {
  return lines.reduce((n, l) => n + (hasEstimatedPrice(l) ? 1 : 0), 0);
}

/** « dont 1 prix estimé », « dont 3 prix estimés » (vide sans estimation). */
export function estimatedNote(count: number): string {
  return count > 0 ? `dont ${count} prix estimé${count > 1 ? 's' : ''}` : '';
}

/** « Frais de retrait » / « Frais de livraison ». */
export function feesLabel(channel: OrderChannel): string {
  return channel === 'delivery' ? 'Frais de livraison' : 'Frais de retrait';
}

/** Montant des frais : « Offerts » si nuls. */
export function feesValue(cents: number): string {
  return cents > 0 ? formatPrice(cents) : 'Offerts';
}

/** Économie affichée en premier, signe moins typographique : « −7,14 € ». */
export function savingsLabel(cents: number): string {
  return formatPrice(-Math.max(0, Math.round(cents)));
}

/** « 1 article », « 18 articles ». */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}

/** Espace insécable : « 250 g » ne se coupe jamais en fin de ligne. */
const NBSP = '\u00A0';

/** Contenance d'un conditionnement : « 250 g », « 1 l », « 6 pièces » (insécable). */
export function packLabel(product: Pick<Product, 'packSize' | 'packUnit'>): string {
  const raw = product.packUnit === 'piece' ? plural(product.packSize, 'pièce') : formatQuantity(product.packSize, product.packUnit);
  return raw.replace(/ /g, NBSP);
}

/** Quantité achetée : « 2 × 250 g » (« 250 g » pour un seul conditionnement), insécable. */
export function packsLabel(packs: number, product: Pick<Product, 'packSize' | 'packUnit'> | undefined): string {
  if (!product) return `${packs}${NBSP}×`;
  const pack = packLabel(product);
  return packs > 1 ? `${packs}${NBSP}×${NBSP}${pack}` : pack;
}

/** Nom d'un produit avec sa marque : « Ail blanc, filet 3 têtes · Auchan ». */
export function productTitle(product: Pick<Product, 'name' | 'brand'> | undefined, fallback: string): string {
  if (!product) return fallback;
  return product.brand ? `${product.name} · ${product.brand}` : product.name;
}

export const MODE_COPY: Record<BasketMode, { label: string; hint: string }> = {
  single_store: { label: 'Un seul magasin', hint: 'Tout au même endroit, au meilleur total, frais compris.' },
  cheapest: { label: 'Le moins cher', hint: 'Jusqu’à 2 magasins pour payer le moins possible, frais compris.' },
};

// ─── État de l'écran ─────────────────────────────────────────────────────────

export type BasketScreenState = 'loading' | 'empty' | 'allChecked' | 'computing' | 'error' | 'ready';

/**
 * Que montrer ? Squelettes tant qu'aucun panier exploitable n'existe ; le
 * panier précédent reste affiché pendant un recalcul (pas de clignotement).
 */
export function basketScreenState(input: {
  hydrated: boolean;
  list: Pick<ShoppingList, 'items'> | null;
  status: 'idle' | 'computing' | 'ready' | 'error';
  plan: BasketPlan | null;
  /** Le panier a été calculé pour une autre semaine. */
  otherWeek: boolean;
}): BasketScreenState {
  if (!input.hydrated) return 'loading';
  const items = input.list?.items ?? [];
  if (items.length === 0) return 'empty';
  if (items.every((i) => i.checked)) return 'allChecked';
  const usable = !!input.plan && !input.otherWeek;
  if (usable) return 'ready';
  return input.status === 'error' ? 'error' : 'computing';
}

// ─── Ticket récapitulatif ────────────────────────────────────────────────────

export interface ReceiptPart {
  storeId: string;
  store: Store | undefined;
  name: string;
  items: number;
  /** Lignes au prix estimé. */
  estimated: number;
  subtotalCents: number;
  feesCents: number;
}

export interface ReceiptSummary {
  mode: BasketMode;
  parts: ReceiptPart[];
  chains: string[];
  items: number;
  /** Articles au prix estimé (aucun relevé dans l'enseigne). */
  estimated: number;
  subtotalCents: number;
  feesCents: number;
  totalCents: number;
  savingsCents: number;
  missing: number;
}

export function receiptSummary(plan: BasketPlan, storesById: Record<string, Store>): ReceiptSummary {
  const parts = plan.parts.map((p) => {
    const store = storesById[p.storeId];
    return {
      storeId: p.storeId,
      store,
      name: storeDisplayName(store, { fallback: p.storeId }),
      items: p.lines.length,
      estimated: estimatedCount(p.lines),
      subtotalCents: p.subtotalCents,
      feesCents: p.feesCents,
    };
  });
  return {
    mode: plan.mode,
    parts,
    chains: parts.map((p) => p.store?.chain ?? p.storeId),
    items: parts.reduce((s, p) => s + p.items, 0),
    estimated: parts.reduce((s, p) => s + p.estimated, 0),
    subtotalCents: parts.reduce((s, p) => s + p.subtotalCents, 0),
    feesCents: parts.reduce((s, p) => s + p.feesCents, 0),
    totalCents: plan.totalCents,
    savingsCents: Math.max(0, plan.savingsCents),
    missing: plan.missingItemIds.length,
  };
}

// ─── Comparaison article par article ─────────────────────────────────────────

/** Ligne du panier pour un article (et son magasin). */
export function lineForItem(plan: BasketPlan | null, itemId: string): (BasketLine & { storeId: string }) | null {
  if (!plan) return null;
  for (const part of plan.parts) {
    const line = part.lines.find((l) => l.itemId === itemId);
    if (line) return { ...line, storeId: part.storeId };
  }
  return null;
}

/**
 * Signal « marque distributeur » :
 *  - `chosen`    : la MDD moins chère est déjà l'offre retenue dans son magasin ;
 *  - `available` : une MDD moins chère existe mais un autre produit a été choisi.
 */
export interface MddSignal {
  kind: 'chosen' | 'available';
  savingsCents: number;
  storeId: string;
  productId: string;
}

export function mddSignal(comparison: ItemComparison): MddSignal | null {
  const alt = comparison.cheaperAlternative;
  if (!alt || !(alt.savingsCents > 0)) return null;
  const inStore = comparison.offers.find((o) => o.storeId === alt.storeId);
  return {
    kind: inStore && inStore.productId === alt.productId ? 'chosen' : 'available',
    savingsCents: alt.savingsCents,
    storeId: alt.storeId,
    productId: alt.productId,
  };
}

export interface ComparisonRowData {
  itemId: string;
  label: string;
  best: StoreOffer;
  bestStoreId: string;
  stores: number;
  /** Écart entre l'offre la plus chère et la moins chère. */
  spreadCents: number;
  /** Où l'article est dans le panier, s'il n'y est pas au meilleur prix. */
  basket: { storeId: string; totalCents: number; extraCents: number } | null;
  inBasket: boolean;
  mdd: MddSignal | null;
  /** Le meilleur prix est une ESTIMATION (aucun relevé dans cette enseigne). */
  bestEstimated: boolean;
}

/** Lignes du comparateur : seulement les articles qui ont au moins une offre. */
export function comparisonRows(comparisons: readonly ItemComparison[], plan: BasketPlan | null): ComparisonRowData[] {
  const rows: ComparisonRowData[] = [];
  for (const c of comparisons) {
    const best = c.best ?? c.offers[0];
    if (!best) continue;
    const totals = c.offers.map((o) => o.totalCents);
    const line = lineForItem(plan, c.itemId);
    const extra = line ? line.totalCents - best.totalCents : 0;
    rows.push({
      itemId: c.itemId,
      label: c.label,
      best,
      bestStoreId: best.storeId,
      stores: c.offers.length,
      spreadCents: Math.max(...totals) - Math.min(...totals),
      basket: line && (line.storeId !== best.storeId || extra > 0) ? { storeId: line.storeId, totalCents: line.totalCents, extraCents: Math.max(0, extra) } : null,
      inBasket: !!line,
      mdd: mddSignal(c),
      bestEstimated: hasEstimatedPrice(best),
    });
  }
  return rows;
}

/** Nombre d'enseignes distinctes comparées (pour l'en-tête). */
export function comparedStoreIds(comparisons: readonly ItemComparison[]): string[] {
  const ids = new Set<string>();
  for (const c of comparisons) for (const o of c.offers) ids.add(o.storeId);
  return Array.from(ids).sort();
}

// ─── Articles introuvables ───────────────────────────────────────────────────

export interface MissingRow {
  itemId: string;
  label: string;
  /** `nowhere` : aucune enseigne ; `elsewhere` : pas dans les magasins du panier. */
  reason: 'nowhere' | 'elsewhere';
  elsewhere: { storeId: string; totalCents: number } | null;
}

export function missingRows(plan: BasketPlan | null, comparisons: readonly ItemComparison[]): MissingRow[] {
  if (!plan) return [];
  const byId = new Map(comparisons.map((c) => [c.itemId, c]));
  return plan.missingItemIds.map((id) => {
    const c = byId.get(id);
    const best = c?.best ?? c?.offers[0];
    return {
      itemId: id,
      label: c?.label ?? 'Article',
      reason: best ? 'elsewhere' : 'nowhere',
      elsewhere: best ? { storeId: best.storeId, totalCents: best.totalCents } : null,
    };
  });
}

// ─── Panier vide : pourquoi ? ────────────────────────────────────────────────

/**
 * Pourquoi aucun magasin n'est retenu :
 *  - `not_in_catalog` : aucune enseigne ne vend ces articles (articles saisis à la main…) ;
 *  - `no_delivery`    : en livraison, aucun des magasins du panier ne livre ;
 *  - `not_sold`       : tes magasins (ceux qui livrent, en livraison) ne les vendent pas.
 */
export type EmptyBasketReason = 'not_in_catalog' | 'no_delivery' | 'not_sold';

export function emptyBasketReason(
  comparisons: readonly ItemComparison[],
  stores: readonly Store[],
  opts: { channel: OrderChannel; storeIds: readonly string[] },
): EmptyBasketReason {
  if (!comparisons.some((c) => c.offers.length > 0)) return 'not_in_catalog';
  if (opts.channel === 'delivery') {
    // Mêmes magasins que le calcul : ceux du panier, tous si aucun n'est connu.
    const mine = stores.filter((s) => opts.storeIds.includes(s.id));
    const candidates = mine.length > 0 ? mine : stores;
    if (!candidates.some((s) => storeFees(s, 'delivery') !== null)) return 'no_delivery';
  }
  return 'not_sold';
}

// ─── Premium : gain du panier « le moins cher » ──────────────────────────────

/**
 * Ce que le mode « le moins cher » (Premium, 2 magasins max) ferait gagner
 * par rapport au panier affiché. `null` si rien à gagner (ou couverture moindre).
 */
export function cheapestGainCents(
  comparisons: readonly ItemComparison[],
  current: BasketPlan | null,
  stores: readonly Store[],
  opts: { channel: OrderChannel; storeIds: readonly string[] },
): number | null {
  if (!current || current.mode === 'cheapest' || comparisons.length === 0) return null;
  const allowed = opts.storeIds.filter((id) => stores.some((s) => s.id === id));
  const cheapest = optimizeBasket(comparisons, stores, 'cheapest', {
    channel: opts.channel,
    allowedStoreIds: allowed.length > 0 ? allowed : undefined,
    now: current.computedAt,
  });
  if (cheapest.missingItemIds.length > current.missingItemIds.length) return null;
  const gain = current.totalCents - cheapest.totalCents;
  return gain > 0 ? gain : null;
}

// ─── Magasin du panier ───────────────────────────────────────────────────────

/** Lignes visibles d'une carte magasin repliée. */
export const COLLAPSED_LINES = 3;

export function visibleLines(part: Pick<BasketStorePart, 'lines'>, expanded: boolean): BasketLine[] {
  return expanded ? part.lines : part.lines.slice(0, COLLAPSED_LINES);
}

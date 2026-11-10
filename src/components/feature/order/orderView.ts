/**
 * Logique de présentation PURE de l'écran « Commande » : lignes du ticket,
 * étape (prête / ouverte chez l'enseigne / validée), correspondance entre la
 * commande préparée et le panier, économies, historique. Aucun import React.
 */
import type { BasketLine, BasketPlan, BasketStorePart, OrderChannel, OrderHandoff, Product } from '@/core';
import { relativeDayLabel } from '@/core';

import { packsLabel } from '../basket/basketView';

export interface OrderLineView {
  key: string;
  label: string;
  /** Produit commandé (« Ail blanc, filet 3 têtes »). */
  productName: string | null;
  brand: string | null;
  quantity: string;
  packs: number;
  totalCents: number;
  isStoreBrand: boolean;
}

export function orderLineViews(lines: readonly BasketLine[], productsById: Record<string, Product>): OrderLineView[] {
  return lines.map((l) => {
    const p = productsById[l.productId];
    return {
      key: l.itemId,
      label: l.label,
      productName: p?.name ?? null,
      brand: p?.brand ?? null,
      quantity: packsLabel(l.packs, p),
      packs: l.packs,
      totalCents: l.totalCents,
      isStoreBrand: !!p?.isStoreBrand,
    };
  });
}

/** Sous-total, frais et total d'une liste de lignes. */
export function orderTotals(lines: readonly Pick<BasketLine, 'totalCents'>[], totalCents: number): { subtotalCents: number; feesCents: number; totalCents: number } {
  const subtotal = lines.reduce((s, l) => s + l.totalCents, 0);
  return { subtotalCents: subtotal, feesCents: Math.max(0, totalCents - subtotal), totalCents };
}

/** La commande préparée correspond-elle encore au panier (mêmes lignes, canal, total) ? */
export function orderMatchesPart(
  order: Pick<OrderHandoff, 'channel' | 'lines' | 'totalCents'>,
  part: BasketStorePart,
  channel: OrderChannel,
): boolean {
  if (order.channel !== channel) return false;
  if (order.totalCents !== part.subtotalCents + part.feesCents) return false;
  if (order.lines.length !== part.lines.length) return false;
  const key = (l: BasketLine) => `${l.itemId}|${l.productId}|${l.packs}|${l.totalCents}`;
  const mine = new Set(order.lines.map(key));
  return part.lines.every((l) => mine.has(key(l)));
}

export type OrderStage = 'ready' | 'opened' | 'confirmed';

/** Étape affichée. `reordering` : nouvelle commande demandée après une commande validée. */
export function orderStage(order: Pick<OrderHandoff, 'status'> | null, reordering = false): OrderStage {
  if (!order) return 'ready';
  if (order.status === 'opened') return 'opened';
  if (order.status === 'confirmed' && !reordering) return 'confirmed';
  return 'ready';
}

export const ORDER_STATUS_LABELS: Record<OrderHandoff['status'], string> = {
  prepared: 'Préparée',
  opened: 'En cours chez l’enseigne',
  confirmed: 'Validée',
};

/** « Validée aujourd’hui », « Préparée lundi 9 novembre ». */
export function orderWhenLabel(order: Pick<OrderHandoff, 'status' | 'createdAt'> & { confirmedAt?: string }, todayIso: string): string {
  const at = (order.status === 'confirmed' && order.confirmedAt) || order.createdAt;
  const when = relativeDayLabel(at.slice(0, 10), todayIso.slice(0, 10)).replace("'", '’');
  return `${ORDER_STATUS_LABELS[order.status]} ${when.charAt(0).toLowerCase()}${when.slice(1)}`;
}

/** Part des économies du panier attribuée à un magasin (même règle que orderStore). */
export function partSavingsCents(plan: Pick<BasketPlan, 'savingsCents' | 'totalCents'> | null, part: Pick<BasketStorePart, 'subtotalCents' | 'feesCents'>): number {
  if (!plan || !(plan.totalCents > 0)) return 0;
  return Math.max(0, Math.round((plan.savingsCents * (part.subtotalCents + part.feesCents)) / plan.totalCents));
}

/**
 * Commande à rappeler dans « Cette semaine » : l'ancienne commande validée de
 * ce magasin quand on en prépare une nouvelle, sinon la dernière commande de
 * la semaine si c'est une autre que celle affichée.
 */
export function historyOrder<T extends Pick<OrderHandoff, 'id' | 'status'>>(
  lastOfWeek: T | null,
  storeOrder: T | null,
  stage: OrderStage,
): T | null {
  if (stage === 'ready' && storeOrder?.status === 'confirmed') return storeOrder;
  if (lastOfWeek && lastOfWeek.id !== storeOrder?.id) return lastOfWeek;
  return null;
}

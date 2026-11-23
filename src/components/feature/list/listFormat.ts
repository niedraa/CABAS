/**
 * Formatage pur de la liste de courses : quantités, conditionnements, texte
 * à partager (rangé par rayon). Aucun accès aux stores.
 */
import {
  AISLE_LABELS,
  formatQuantity,
  groupByAisle,
  type ShoppingListItem,
} from '@/core';

/** « 450 g », « 1,5 L », « 3 pièces ». */
export function itemQuantityLabel(item: Pick<ShoppingListItem, 'quantity' | 'unit'>): string {
  if (!(item.quantity > 0)) return '';
  return formatQuantity(item.quantity, item.unit);
}

/** Conditionnement conseillé : « 2 × 500 g », « 1 × 6 pièces ». */
export function packagingLabel(item: ShoppingListItem): string | null {
  const p = item.packaging;
  if (!p || !(p.packs > 0) || !(p.packSize > 0)) return null;
  return `${p.packs} × ${formatQuantity(p.packSize, p.packUnit)}`;
}

/** Sous-titre d'un article : quantité · conditionnement · note. */
export function itemSubtitle(item: ShoppingListItem): string {
  const parts: string[] = [];
  const q = itemQuantityLabel(item);
  if (q && item.source === 'plan') parts.push(q);
  else if (q && item.quantity !== 1) parts.push(q);
  const pack = packagingLabel(item);
  if (pack) parts.push(`à acheter : ${pack}`);
  if (item.note) parts.push(item.note);
  return parts.join(' · ');
}

/** Texte de la liste, rangé par rayon (articles restants seulement par défaut). */
export function listAsText(
  items: readonly ShoppingListItem[],
  opts: { title?: string; includeChecked?: boolean } = {},
): string {
  const kept = opts.includeChecked ? items : items.filter((i) => !i.checked);
  const lines: string[] = [opts.title ?? 'Ma liste de courses Cabas'];
  for (const section of groupByAisle(kept)) {
    lines.push('', `${AISLE_LABELS[section.aisle]}`);
    for (const i of section.items) {
      const pack = packagingLabel(i);
      const q = pack ?? (i.quantity > 0 && !(i.source === 'manual' && i.quantity === 1) ? formatQuantity(i.quantity, i.unit) : '');
      lines.push(`${i.checked ? '☑' : '☐'} ${i.label}${q ? ` — ${q}` : ''}`);
    }
  }
  if (kept.length === 0) lines.push('', 'Rien à acheter, tout est dans le cabas !');
  return lines.join('\n');
}

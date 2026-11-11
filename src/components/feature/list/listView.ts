/**
 * Logique de présentation PURE de l'onglet « Liste » (aucun import React) :
 * libellés d'un article, indices « placard », ordre d'affichage pendant
 * l'animation de coche, saisie rapide (« 2 baguettes », « 500 g de farine »).
 */
import type { Aisle, BaseUnit, PantryItem, Recipe, ShoppingListItem } from '@/core';
import {
  AISLE_LABELS,
  AISLES,
  compareFr,
  foldText,
  formatItemQuantity,
  formatPackaging,
  formatQuantity,
  guessAisle,
} from '@/core';

/** Emoji d'un rayon (vignettes du placard, aperçu de saisie). */
export const AISLE_EMOJI: Record<Aisle, string> = {
  fruits_legumes: '🥕',
  boulangerie: '🥖',
  boucherie: '🥩',
  poissonnerie: '🐟',
  cremerie: '🥛',
  epicerie_salee: '🍝',
  condiments: '🧂',
  epicerie_sucree: '🍫',
  surgeles: '🧊',
  boissons: '🧃',
  hygiene_maison: '🧴',
  autre: '🛒',
};

/** Rayons proposés dans la feuille d'édition (ordre de parcours). */
export const AISLE_OPTIONS: { value: Aisle; label: string; emoji: string }[] = AISLES.map((a) => ({
  value: a,
  label: AISLE_LABELS[a],
  emoji: AISLE_EMOJI[a],
}));

/** Unité courte affichée à côté d'un champ numérique. */
export const UNIT_SHORT: Record<BaseUnit, string> = { g: 'g', ml: 'ml', piece: 'pièce(s)' };

/** Nombre saisi (« 250 », « 1,5 ») → valeur > 0, sinon null. */
export function parseAmount(text: string): number | null {
  const clean = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(clean)) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 && n < 100000 ? n : null;
}

/** « 1 article », « 3 articles ». */
export function countFr(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${Math.abs(n) >= 2 ? plural : singular}`;
}

// ─── Un article ──────────────────────────────────────────────────────────────

export interface ItemView {
  /** Quantité à droite : « 450 g », « × 3 », ou vide. */
  quantity: string;
  /** Conditionnement réel : « Prends 2 × 300 g ». */
  buy: string | null;
  /** Recettes d'origine, compact : « Carbonara +1 ». */
  sources: string | null;
  /** Recettes d'origine, en clair (lecteur d'écran) : « Pour Carbonara et Poulet teriyaki ». */
  sourcesA11y: string | null;
  /** Indice « placard » (badge). */
  pantry: PantryHint | null;
}

export interface PantryHint {
  label: string;
  /** success : déjà au placard (quantité connue) ; neutral : sûrement à la maison. */
  tone: 'success' | 'neutral';
}

/** Recettes d'origine d'un article (titres connus du catalogue). */
export function recipeSources(
  recipeIds: readonly string[],
  recipesById: Readonly<Record<string, Pick<Recipe, 'title'>>>,
): { short: string; full: string } | null {
  const titles = recipeIds.map((id) => recipesById[id]?.title).filter((x): x is string => !!x);
  if (titles.length === 0) return null;
  const short = titles.length === 1 ? titles[0] : `${titles[0]} +${titles.length - 1}`;
  // « · » plutôt que « et » : les titres contiennent souvent déjà « et ».
  return { short, full: `Pour ${titles.join(' · ')}` };
}

/**
 * Indice « déjà au placard » :
 * - note de déduction (« Déjà 10 cl au placard ») posée par la liste ;
 * - article d'épicerie de base (sel, huile…) : sûrement à la maison ;
 * - article ajouté à la main dont le libellé est au placard.
 */
export function pantryHintFor(item: ShoppingListItem, pantry: readonly PantryItem[] = []): PantryHint | null {
  if (item.note && /placard/i.test(item.note)) return { label: item.note, tone: 'success' };
  if (item.pantryStaple) return { label: 'Sûrement déjà chez toi', tone: 'neutral' };
  if (item.source === 'manual') {
    const key = foldText(item.label.trim());
    const match = pantry.find((p) => p.quantity > 0 && p.unit === item.unit && foldText(p.label.trim()) === key);
    if (match) return { label: `Déjà ${formatQuantity(match.quantity, match.unit)} au placard`, tone: 'success' };
  }
  return null;
}

export function itemView(
  item: ShoppingListItem,
  recipesById: Readonly<Record<string, Pick<Recipe, 'title'>>>,
  pantry: readonly PantryItem[] = [],
): ItemView {
  const pack = formatPackaging(item);
  const sources = recipeSources(item.recipeIds, recipesById);
  return {
    quantity: formatItemQuantity(item),
    buy: pack ? `Prends ${pack.startsWith('lot ') ? `un ${pack}` : pack}` : null,
    sources: sources?.short ?? (item.source === 'manual' ? 'Ajouté par toi' : null),
    sourcesA11y: sources?.full ?? (item.source === 'manual' ? 'Ajouté par toi' : null),
    pantry: pantryHintFor(item, pantry),
  };
}

/** Phrase lue par le lecteur d'écran pour une ligne de la liste. */
export function itemA11yLabel(item: ShoppingListItem, view: ItemView): string {
  const parts = [view.quantity ? `${item.label}, ${view.quantity.replace('× ', '')}` : item.label];
  if (view.buy) parts.push(view.buy);
  if (view.sourcesA11y) parts.push(view.sourcesA11y);
  if (view.pantry) parts.push(view.pantry.label);
  if (item.note && !view.pantry) parts.push(item.note);
  return parts.join('. ');
}

// ─── Rayons ──────────────────────────────────────────────────────────────────

export interface ListSection {
  aisle: Aisle;
  items: ShoppingListItem[];
}

/**
 * Ordre d'affichage d'un rayon : non cochés d'abord, puis alphabétique.
 * Un article qui vient d'être (dé)coché garde sa place le temps de
 * l'animation : `frozen[id]` = état coché à utiliser pour le tri.
 */
export function orderSection(items: readonly ShoppingListItem[], frozen: Readonly<Record<string, boolean>> = {}): ShoppingListItem[] {
  const rank = (i: ShoppingListItem) => Number(frozen[i.id] ?? i.checked);
  return items.slice().sort((a, b) => rank(a) - rank(b) || compareFr(a.label, b.label));
}

export function applyFrozenOrder(sections: readonly ListSection[], frozen: Readonly<Record<string, boolean>>): ListSection[] {
  if (Object.keys(frozen).length === 0) return sections.slice();
  return sections.map((s) => ({ aisle: s.aisle, items: orderSection(s.items, frozen) }));
}

export function sectionProgress(items: readonly ShoppingListItem[]): { done: number; total: number; complete: boolean } {
  const done = items.filter((i) => i.checked).length;
  return { done, total: items.length, complete: items.length > 0 && done === items.length };
}

/** État d'avancement de la liste : vide, à faire, tout coché. */
export type ListPhase = 'empty' | 'todo' | 'complete';

export function listPhase(total: number, done: number): ListPhase {
  if (!(total > 0)) return 'empty';
  return done >= total ? 'complete' : 'todo';
}

/** Rangement du surplus au placard, une fois tout coché. */
export type LeftoversState = 'todo' | 'stored' | 'none';

/**
 * « todo » tant qu'un article coché n'a pas été rangé ; ensuite « stored » si au
 * moins un surplus a rejoint le placard, « none » s'il n'y avait rien à ranger.
 */
export function leftoversState(
  items: readonly ShoppingListItem[],
  record: { itemIds: readonly string[]; stored: number } | undefined,
): LeftoversState {
  if (!record) return 'todo';
  const done = new Set(record.itemIds);
  if (items.some((i) => i.checked && !done.has(i.id))) return 'todo';
  return record.stored > 0 ? 'stored' : 'none';
}

/** Toast après « Ranger le reste au placard » (accordé au nombre de restes). */
export function leftoversToast(n: number): { title: string; message: string } {
  if (n <= 0) return { title: 'Rien à ranger', message: 'Tout part en cuisine cette semaine.' };
  return {
    title: `${countFr(n, 'reste')} au placard`,
    message: n > 1 ? 'Cabas te proposera de quoi les cuisiner.' : 'Cabas te proposera de quoi le cuisiner.',
  };
}

/** Bouton qui déplie les articles cochés sous la carte « bravo ». */
export function reviewCheckedLabel(done: number): string {
  return done > 1 ? `Revoir les ${done} articles cochés` : 'Revoir l’article coché';
}

/** Titre de la carte de progression : « Encore 12 articles », « Plus qu’un article ». */
export function remainingHeadline(remaining: number): string {
  if (remaining <= 0) return 'Tout est dans le cabas';
  if (remaining === 1) return 'Plus qu’un article';
  return `Encore ${remaining} articles`;
}

/**
 * Sous-titre de la carte de progression (l'anneau montre déjà « 5/17 ») :
 * « 17 articles · 6 rayons », « 3 rayons à faire », « Dernier rayon : Crèmerie ».
 */
export function progressSubtitle(sections: readonly ListSection[]): string {
  let done = 0;
  let total = 0;
  const todo: Aisle[] = [];
  for (const s of sections) {
    const p = sectionProgress(s.items);
    done += p.done;
    total += p.total;
    if (!p.complete) todo.push(s.aisle);
  }
  if (total === 0) return 'Ta liste est vide';
  if (done === 0) return `${countFr(total, 'article')} · ${countFr(todo.length, 'rayon')}`;
  if (todo.length === 0) return 'Tout est coché';
  if (todo.length === 1) return `Dernier rayon : ${AISLE_LABELS[todo[0]]}`;
  return `${todo.length} rayons à faire`;
}

// ─── Saisie rapide ───────────────────────────────────────────────────────────

export interface QuickAdd {
  label: string;
  quantity?: number;
  unit?: BaseUnit;
}

const UNIT_WORDS: Record<string, { unit: BaseUnit; factor: number }> = {
  g: { unit: 'g', factor: 1 },
  gr: { unit: 'g', factor: 1 },
  kg: { unit: 'g', factor: 1000 },
  ml: { unit: 'ml', factor: 1 },
  cl: { unit: 'ml', factor: 10 },
  dl: { unit: 'ml', factor: 100 },
  l: { unit: 'ml', factor: 1000 },
  x: { unit: 'piece', factor: 1 },
  '×': { unit: 'piece', factor: 1 },
};

const NUM = '(\\d+(?:[.,]\\d+)?)';
const UNIT = '(kg|gr|g|ml|cl|dl|l|x|×)';
/** « 2 baguettes », « 500 g de farine », « 1,5l lait », « x6 œufs ». */
const LEADING = new RegExp(`^(?:[x×]\\s*)?${NUM}\\s*${UNIT}?\\s+(?:(?:de|d['’])\\s*)?(.+)$`, 'i');
/** « farine 500 g », « œufs x6 », « lait 1,5 l ». */
const TRAILING = new RegExp(`^(.+?)\\s+(?:[x×]\\s*)?${NUM}\\s*${UNIT}?$`, 'i');

function toQuantity(raw: string, unitWord: string | undefined): { quantity: number; unit: BaseUnit } | null {
  const n = Number(raw.replace(',', '.'));
  const u = UNIT_WORDS[(unitWord ?? 'x').toLowerCase()];
  if (!u || !Number.isFinite(n) || n <= 0) return null;
  const quantity = Math.round(n * u.factor * 1000) / 1000;
  return quantity > 0 && quantity < 100000 ? { quantity, unit: u.unit } : null;
}

/** Interprète la saisie rapide. `null` si le texte est vide. */
export function parseQuickAdd(text: string): QuickAdd | null {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return null;
  for (const [re, labelAt, numAt, unitAt] of [
    [LEADING, 3, 1, 2],
    [TRAILING, 1, 2, 3],
  ] as const) {
    const m = re.exec(clean);
    if (!m) continue;
    const label = m[labelAt].trim();
    const q = toQuantity(m[numAt], m[unitAt]);
    // Libellé avec au moins une lettre, qui ne finit pas sur une préposition
    // (« pack de 6 » reste tel quel).
    if (q && /[a-zà-ÿœæ]/i.test(label) && !/\s(de|d['’]|à|au|aux)$/i.test(label)) return { label, ...q };
  }
  return { label: clean };
}

/** Aperçu de la saisie : rayon deviné + quantité lisible. */
export function quickAddPreview(parsed: QuickAdd | null): { aisle: Aisle; quantity: string } | null {
  if (!parsed) return null;
  const quantity =
    parsed.quantity !== undefined && parsed.unit
      ? formatItemQuantity({ quantity: parsed.quantity, unit: parsed.unit, source: 'plan' })
      : '';
  return { aisle: guessAisle(parsed.label), quantity };
}

// ─── Partage ─────────────────────────────────────────────────────────────────

/** Titre du texte partagé : « Ma liste Cabas · 9 – 15 nov. ». */
export function shareTitle(rangeLabel: string): string {
  return `Ma liste Cabas · ${rangeLabel}`;
}

/**
 * Logique de présentation PURE du placard (aucun import React) : dates de
 * péremption lisibles, tri, recherche d'ingrédient, pas de quantité,
 * libellés des suggestions anti-gaspi.
 */
import type { Aisle, BaseUnit, Ingredient, PantryItem } from '@/core';
import { addDays, compareFr, daysBetween, foldText, formatDayLabel, guessAisle, isISODate, joinFr, lowerFirst, MONTH_SHORT } from '@/core';

// ─── Péremption ──────────────────────────────────────────────────────────────

export type ExpiryTone = 'danger' | 'warning' | 'neutral';

export interface ExpiryInfo {
  /** Jours restants (négatif : périmé). */
  days: number;
  /** « Périme dans 2 jours », « À consommer aujourd’hui », « Périmé depuis hier ». */
  label: string;
  /** Version courte pour une pastille : « Dans 2 j », « Aujourd’hui », « Périmé ». */
  short: string;
  tone: ExpiryTone;
}

function dayMonth(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[2])} ${MONTH_SHORT[Number(m[1]) - 1]}` : iso;
}

/** Date limite lisible, relative à `today` (`YYYY-MM-DD`). `null` sans date valide. */
export function expiryInfo(expiresAt: string | undefined, today: string): ExpiryInfo | null {
  const day = expiresAt?.slice(0, 10);
  if (!day || !isISODate(day) || !isISODate(today.slice(0, 10))) return null;
  const days = daysBetween(today.slice(0, 10), day);
  if (days < -1) return { days, label: `Périmé depuis ${-days} jours`, short: 'Périmé', tone: 'danger' };
  if (days === -1) return { days, label: 'Périmé depuis hier', short: 'Périmé', tone: 'danger' };
  if (days === 0) return { days, label: 'À consommer aujourd’hui', short: 'Aujourd’hui', tone: 'danger' };
  if (days === 1) return { days, label: 'Périme demain', short: 'Demain', tone: 'warning' };
  if (days <= 6) return { days, label: `Périme dans ${days} jours`, short: `Dans ${days} j`, tone: days <= 3 ? 'warning' : 'neutral' };
  if (days <= 13) return { days, label: `Périme ${lowerFirst(formatDayLabel(day, 'long'))}`, short: dayMonth(day), tone: 'neutral' };
  return { days, label: `À consommer avant le ${dayMonth(day)}`, short: dayMonth(day), tone: 'neutral' };
}

/** Choix rapides de date limite (jours à partir d'aujourd'hui, `null` = aucune). */
export const EXPIRY_PRESETS: readonly { key: string; label: string; days: number | null }[] = [
  { key: 'none', label: 'Aucune', days: null },
  { key: 'd0', label: 'Aujourd’hui', days: 0 },
  { key: 'd1', label: 'Demain', days: 1 },
  { key: 'd3', label: 'Dans 3 jours', days: 3 },
  { key: 'd7', label: 'Dans 1 semaine', days: 7 },
  { key: 'd14', label: 'Dans 2 semaines', days: 14 },
];

export function expiryFromPreset(key: string, today: string): string | undefined {
  const preset = EXPIRY_PRESETS.find((p) => p.key === key);
  if (!preset || preset.days === null) return undefined;
  return addDays(today.slice(0, 10), preset.days);
}

/** Préréglage correspondant à une date (« custom » si aucune ne correspond). */
export function presetForExpiry(expiresAt: string | undefined, today: string): string {
  if (!expiresAt) return 'none';
  const day = expiresAt.slice(0, 10);
  const match = EXPIRY_PRESETS.find((p) => p.days !== null && addDays(today.slice(0, 10), p.days) === day);
  return match ? match.key : 'custom';
}

// ─── Tri & regroupement ──────────────────────────────────────────────────────

/** Péremption la plus proche d'abord, puis sans date, alphabétique. */
export function sortPantry(items: readonly PantryItem[]): PantryItem[] {
  return items.slice().sort((a, b) => {
    const da = a.expiresAt?.slice(0, 10);
    const db = b.expiresAt?.slice(0, 10);
    if (da && db && da !== db) return da < db ? -1 : 1;
    if (da && !db) return -1;
    if (!da && db) return 1;
    return compareFr(a.label, b.label);
  });
}

/** Sépare « à consommer vite » (ids fournis par `useExpiringSoon`) du reste du placard. */
export function splitPantry(items: readonly PantryItem[], soon: readonly PantryItem[]): { soon: PantryItem[]; rest: PantryItem[] } {
  const ids = new Set(soon.map((p) => p.id));
  return { soon: sortPantry(soon), rest: sortPantry(items.filter((p) => !ids.has(p.id))) };
}

/** Rayon d'un article du placard (ingrédient connu, sinon deviné au libellé). */
export function pantryAisle(item: Pick<PantryItem, 'label' | 'ingredientId'>, ingredientsById: Readonly<Record<string, Ingredient>>): Aisle {
  const ing = item.ingredientId ? ingredientsById[item.ingredientId] : undefined;
  return ing?.aisle ?? guessAisle(item.label);
}

// ─── Recherche d'ingrédient ──────────────────────────────────────────────────

/**
 * Ingrédients du catalogue qui correspondent à la saisie : début du nom
 * d'abord, puis début d'un mot, puis contenu ; insensible aux accents.
 */
export function searchIngredients(ingredients: readonly Ingredient[], query: string, limit = 6): Ingredient[] {
  const q = foldText(query.trim());
  if (q.length === 0) return [];
  const scored: { ing: Ingredient; score: number }[] = [];
  for (const ing of ingredients) {
    const names = [ing.name, ing.namePlural ?? ''].map((n) => foldText(n));
    let score = -1;
    for (const n of names) {
      if (!n) continue;
      if (n.startsWith(q)) score = Math.max(score, 3);
      else if (n.split(/[\s'’-]+/).some((w) => w.startsWith(q))) score = Math.max(score, 2);
      else if (n.includes(q)) score = Math.max(score, 1);
    }
    if (score > 0) scored.push({ ing, score });
  }
  scored.sort((a, b) => b.score - a.score || a.ing.name.length - b.ing.name.length || compareFr(a.ing.name, b.ing.name));
  return scored.slice(0, Math.max(0, limit)).map((s) => s.ing);
}

/** Quantité proposée à l'ajout d'un article. */
export function defaultQuantity(unit: BaseUnit): number {
  return unit === 'piece' ? 1 : unit === 'ml' ? 250 : 200;
}

/** Pas du sélecteur « − / + » selon la quantité de départ. */
export function quantityStep(unit: BaseUnit, quantity: number): number {
  if (unit === 'piece') return 1;
  if (quantity >= 1000) return 100;
  if (quantity >= 200) return 50;
  if (quantity >= 50) return 10;
  return 5;
}

// ─── Anti-gaspi ──────────────────────────────────────────────────────────────

/** « Avec ta crème fraîche et tes œufs » → ici : « Utilise : crème fraîche et œufs ». */
export function leftoverUsesLabel(matchedIds: readonly string[], ingredientsById: Readonly<Record<string, Ingredient>>): string {
  const names = matchedIds
    .map((id) => ingredientsById[id])
    .filter((x): x is Ingredient => !!x)
    .map((i) => lowerFirst(i.name));
  return names.length > 0 ? `Utilise ${joinFr(names)}` : 'Utilise tes restes';
}

/** « 3 articles », « 1 article ». */
export function pantryCountLabel(n: number): string {
  return `${n} article${n > 1 ? 's' : ''}`;
}

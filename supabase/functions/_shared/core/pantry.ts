// GENERATED — do not edit.
// Copie générée de src/core par scripts/sync-shared.mjs (npm run sync:shared).
// Toute modification doit être faite dans src/core puis resynchronisée.
/**
 * (V2) Placard & anti-gaspi : ce qu'on a déjà à la maison est déduit de la
 * liste de courses, et on propose des recettes qui écoulent les restes,
 * en priorité ceux qui périment bientôt.
 */
import type { BaseUnit, Ingredient, PantryItem, Recipe, ShoppingListItem } from './types.ts';
import type { ConstraintProfile } from './constraints.ts';
import { checkRecipe } from './constraints.ts';
import { addDays, todayISO } from './dates.ts';
import { createId } from './ids.ts';
import { capitalize, foldText } from './text.ts';
import { convertBase, formatQuantity, roundTo } from './units.ts';

/** Quantité de placard disponible pour un article, dans l'unité de l'article. */
function availableFor(item: ShoppingListItem, pantry: readonly PantryItem[], ingredient?: Ingredient): number {
  let available = 0;
  for (const p of pantry) {
    const sameIngredient = item.ingredientId !== undefined && p.ingredientId === item.ingredientId;
    const sameLabel = !p.ingredientId && foldText(p.label.trim()) === foldText(item.label.trim());
    if (!sameIngredient && !sameLabel) continue;
    const q = convertBase(p.quantity, p.unit, item.unit, ingredient);
    if (q !== null && q > 0) available += q;
  }
  return roundTo(available, 4);
}

/**
 * Déduit le placard de la liste. Un article entièrement couvert est retiré ;
 * un article partiellement couvert voit sa quantité réduite (avec une note).
 * Les articles manuels ne sont déduits que sur correspondance exacte du libellé.
 */
export function subtractPantry(
  items: readonly ShoppingListItem[],
  pantry: readonly PantryItem[],
  ingredientsById: Record<string, Ingredient>,
): ShoppingListItem[] {
  const out: ShoppingListItem[] = [];
  for (const item of items) {
    const ingredient = item.ingredientId ? ingredientsById[item.ingredientId] : undefined;
    const available = availableFor(item, pantry, ingredient);
    if (available <= 0) {
      out.push(item);
      continue;
    }
    const remaining = roundTo(item.quantity - available, 4);
    if (remaining <= 0) continue; // tout est déjà au placard
    // L'ancien conditionnement ne vaut plus : il est recalculé par l'appelant.
    const { packaging: _stale, ...rest } = item;
    out.push({
      ...rest,
      quantity: Math.ceil(remaining - 1e-9),
      note: `Déjà ${formatQuantity(available, item.unit)} au placard`,
    });
  }
  return out;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Articles qui périment dans les `days` prochains jours (ou déjà périmés), triés. */
export function expiringSoon(pantry: readonly PantryItem[], nowIso: string, days = 3): PantryItem[] {
  const limit = addDays(todayISO(nowIso), days);
  return pantry
    .filter((p) => !!p.expiresAt && p.expiresAt.slice(0, 10) <= limit)
    .sort((a, b) => cmp(a.expiresAt as string, b.expiresAt as string) || cmp(a.label, b.label));
}

export interface LeftoverSuggestion {
  recipe: Recipe;
  matchedIngredientIds: string[];
  /** Part des ingrédients (hors placard de base) déjà à la maison, 0-1. */
  coverage: number;
}

/**
 * Recettes « anti-gaspi » : recettes SÛRES (et sans ingrédient détesté /
 * ustensile manquant) qui utilisent des restes, triées par date de
 * péremption la plus proche, puis par couverture décroissante.
 */
export function recipesUsingLeftovers(
  recipes: readonly Recipe[],
  pantry: readonly PantryItem[],
  ingredientsById: Record<string, Ingredient>,
  profile: ConstraintProfile,
  limit = 10,
): LeftoverSuggestion[] {
  // Date de péremption la plus proche par ingrédient présent.
  const expiry = new Map<string, string | undefined>();
  for (const p of pantry) {
    if (!p.ingredientId || p.quantity <= 0) continue;
    const prev = expiry.get(p.ingredientId);
    const cur = p.expiresAt?.slice(0, 10);
    if (!expiry.has(p.ingredientId) || (cur && (!prev || cur < prev))) expiry.set(p.ingredientId, cur ?? prev);
  }
  if (expiry.size === 0) return [];

  const results: (LeftoverSuggestion & { soonest?: string })[] = [];
  for (const recipe of recipes) {
    const check = checkRecipe(recipe, profile, ingredientsById);
    if (!check.safe || check.violations.some((v) => v.kind === 'disliked' || v.kind === 'equipment')) continue;
    const considered = recipe.ingredients.filter((ri) => !ri.optional && !ingredientsById[ri.ingredientId]?.isPantryStaple);
    const matched = considered.filter((ri) => expiry.has(ri.ingredientId)).map((ri) => ri.ingredientId);
    if (matched.length === 0) continue;
    let soonest: string | undefined;
    for (const id of matched) {
      const e = expiry.get(id);
      if (e && (!soonest || e < soonest)) soonest = e;
    }
    results.push({
      recipe,
      matchedIngredientIds: Array.from(new Set(matched)),
      coverage: roundTo(matched.length / considered.length, 4),
      soonest,
    });
  }
  results.sort((a, b) => {
    if (a.soonest !== b.soonest) {
      if (!a.soonest) return 1;
      if (!b.soonest) return -1;
      return a.soonest < b.soonest ? -1 : 1;
    }
    return b.coverage - a.coverage || (a.recipe.id < b.recipe.id ? -1 : 1);
  });
  return results.slice(0, Math.max(0, limit)).map(({ recipe, matchedIngredientIds, coverage }) => ({
    recipe,
    matchedIngredientIds,
    coverage,
  }));
}

/** Crée un article de placard. */
export function createPantryItem(
  label: string,
  quantity: number,
  unit: BaseUnit,
  opts: { ingredientId?: string; expiresAt?: string; now?: string; id?: string } = {},
): PantryItem {
  const item: PantryItem = {
    id: opts.id ?? createId('pantry'),
    label: capitalize(label.trim()),
    quantity: Math.max(0, quantity),
    unit,
    addedAt: opts.now ?? new Date().toISOString(),
  };
  if (opts.ingredientId) item.ingredientId = opts.ingredientId;
  if (opts.expiresAt) item.expiresAt = opts.expiresAt;
  return item;
}

/**
 * Après les courses : les articles cochés du planning rejoignent le placard
 * (quantité achetée = conditionnements si connus, sinon besoin).
 */
export function pantryItemsFromShopping(items: readonly ShoppingListItem[], nowIso: string): PantryItem[] {
  return items
    .filter((i) => i.checked && i.source === 'plan' && i.ingredientId)
    .map((i) => {
      const bought = i.packaging ? i.packaging.packs * i.packaging.packSize : i.quantity;
      // Le surplus (paquet entamé) reste au placard.
      const leftover = roundTo(bought - i.quantity, 4);
      return createPantryItem(i.label, leftover, i.unit, { ingredientId: i.ingredientId, now: nowIso, id: `pantry_${i.id}` });
    })
    .filter((p) => p.quantity > 0);
}

/** Consomme une quantité d'un article de placard (supprimé à zéro). */
export function consumePantry(pantry: readonly PantryItem[], itemId: string, quantity: number): PantryItem[] {
  const out: PantryItem[] = [];
  for (const p of pantry) {
    if (p.id !== itemId) {
      out.push(p);
      continue;
    }
    const rest = roundTo(p.quantity - quantity, 4);
    if (rest > 0) out.push({ ...p, quantity: rest });
  }
  return out;
}

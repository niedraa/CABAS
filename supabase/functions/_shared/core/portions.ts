// GENERATED — do not edit.
// Copie générée de src/core par scripts/sync-shared.mjs (npm run sync:shared).
// Toute modification doit être faite dans src/core puis resynchronisée.
/**
 * Portions du foyer et mise à l'échelle des recettes.
 * Un adulte = 1 portion, un enfant (< 12 ans) = 0,6 portion.
 */
import type { Household, Recipe, RecipeIngredient } from './types.ts';
import { isCountUnit, roundTo } from './units.ts';

export const CHILD_PORTION = 0.6;

/** Portions du foyer, arrondies à la demi-portion supérieure (minimum 1). */
export function householdPortions(h: Household): number {
  const adults = Math.max(0, h.adults || 0);
  const children = Math.max(0, h.children || 0);
  const raw = adults + CHILD_PORTION * children;
  // − 1e-9 : évite que 2,8000000001 (bruit flottant) passe à 3,5.
  const rounded = Math.ceil(raw * 2 - 1e-9) / 2;
  return Math.max(1, rounded);
}

/** Portions entières à cuisiner pour le foyer (arrondi supérieur). */
export function householdServings(h: Household): number {
  return Math.ceil(householdPortions(h));
}

/** Règle de trois : quantité pour `from` portions → pour `to` portions. */
export function scaleQuantity(q: number, from: number, to: number): number {
  if (!(from > 0)) return q;
  return roundTo((q * to) / from, 4);
}

/** Arrondi à la demi-unité supérieure (½ oignon, 1 oignon, 1½ oignon…). */
export function ceilHalf(q: number): number {
  return Math.ceil(q * 2 - 1e-9) / 2;
}

/**
 * Ingrédients d'une recette pour `servings` portions. Les quantités en pièces
 * (pièce, gousse, botte…) sont arrondies à la demi-unité supérieure.
 */
export function scaleRecipeIngredients(recipe: Recipe, servings: number): RecipeIngredient[] {
  return recipe.ingredients.map((ri) => {
    let quantity = scaleQuantity(ri.quantity, recipe.servings, servings);
    if (isCountUnit(ri.unit) && quantity > 0) quantity = ceilHalf(quantity);
    return { ...ri, quantity };
  });
}

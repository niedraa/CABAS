/**
 * Calculs purs de la fiche recette : ingrédients mis à l'échelle, allergènes
 * et régimes DÉDUITS des ingrédients (jamais déclarés à la main), libellés.
 */
import type { Allergen, Diet, Ingredient, Recipe } from '@/core';
import {
  ALLERGEN_LABELS,
  DIET_LABELS,
  DIETS,
  dietAllows,
  foldText,
  formatIngredientLine,
  lookupIngredient,
  recipeAllergens,
  scaleRecipeIngredients,
} from '@/core';

export const DIFFICULTY_LABELS: Record<Recipe['difficulty'], string> = { 1: 'Facile', 2: 'Intermédiaire', 3: 'Élaboré' };

export interface IngredientLine {
  key: string;
  ingredientId: string;
  /** « 250 g de farine », « 2 gousses d'ail ». */
  text: string;
  note?: string;
  optional: boolean;
  allergens: Allergen[];
}

/** Lignes d'ingrédients pour `servings` portions, en français naturel. */
export function scaledIngredientLines(
  recipe: Recipe,
  servings: number,
  ingredientsById: Record<string, Ingredient>,
): IngredientLine[] {
  const safeServings = Number.isFinite(servings) && servings > 0 ? servings : recipe.servings;
  return scaleRecipeIngredients(recipe, safeServings).map((ri, i) => {
    const ing = lookupIngredient(ingredientsById, ri.ingredientId);
    return {
      key: `${ri.ingredientId}-${i}`,
      ingredientId: ri.ingredientId,
      text: formatIngredientLine(ri.quantity, ri.unit, ing ?? { name: ri.ingredientId.replace(/_/g, ' ') }),
      note: ri.note,
      optional: !!ri.optional,
      allergens: ing?.allergens ?? [],
    };
  });
}

export interface AllergenBadge {
  allergen: Allergen;
  label: string;
  /** Allergène déclaré par le foyer (ne devrait jamais arriver dans un planning). */
  conflict: boolean;
}

export function allergenBadges(
  recipe: Recipe,
  ingredientsById: Record<string, Ingredient>,
  declared: readonly Allergen[] = [],
): AllergenBadge[] {
  const set = new Set(declared);
  return recipeAllergens(recipe, ingredientsById)
    .map((a) => ({ allergen: a, label: ALLERGEN_LABELS[a] ?? a, conflict: set.has(a) }))
    .sort((a, b) => Number(b.conflict) - Number(a.conflict) || a.label.localeCompare(b.label, 'fr'));
}

/**
 * Régimes compatibles, déduits des ingrédients (optionnels compris, par
 * prudence). Un ingrédient inconnu rend la recette incompatible avec tout régime.
 */
export function compatibleDiets(recipe: Recipe, ingredientsById: Record<string, Ingredient>): Diet[] {
  const ings = recipe.ingredients.map((ri) => lookupIngredient(ingredientsById, ri.ingredientId));
  if (ings.some((i) => !i)) return [];
  return DIETS.filter((d) => {
    if (d === 'casher') return false; // règle viande + lait au niveau recette : non affiché
    return ings.every((i) => dietAllows(d, i as Ingredient));
  });
}

export function dietLabel(d: Diet): string {
  return DIET_LABELS[d] ?? d;
}

/** « 1 h 15 », « 45 min ». */
export function formatMinutes(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '0 min';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m < 10 ? `0${m}` : m}`;
}

/**
 * Alternatives affichées dans « Remplacer le plat » : sans recherche, les
 * `suggested` mieux classées ; avec une recherche, TOUTES celles du `pool`
 * (déjà triées par score) dont le titre ou un tag contient la requête.
 */
export function filterAlternatives<T extends Pick<Recipe, 'title' | 'tags'>>(pool: readonly T[], query: string, suggested = 6): T[] {
  const q = foldText(query.trim());
  if (!q) return pool.slice(0, suggested);
  return pool.filter((r) => foldText(r.title).includes(q) || r.tags.some((tag) => foldText(tag).includes(q)));
}

// GENERATED — do not edit.
// Copie générée de src/core par scripts/sync-shared.mjs (npm run sync:shared).
// Toute modification doit être faite dans src/core puis resynchronisée.
/**
 * Contraintes alimentaires — MODULE CRITIQUE POUR LA SÉCURITÉ.
 *
 * Critère de réussite du dossier : ne JAMAIS proposer un plat contenant un
 * allergène déclaré. Ce filtrage est exécuté côté serveur (Edge Function,
 * après la réponse de l'IA) ET côté client, indépendamment de l'IA.
 *
 * Principe « fail closed » : un ingrédient inconnu du référentiel rend la
 * recette non sûre, et les ingrédients OPTIONNELS comptent aussi pour les
 * allergènes et les régimes (l'utilisateur pourrait les ajouter).
 */
import type { Allergen, Diet, Equipment, Ingredient, MealPlan, Recipe, UserProfile } from './types.ts';
import { ALLERGEN_LABELS, DIET_LABELS, EQUIPMENT_LABELS } from './labels.ts';

export type ConstraintProfile = Pick<UserProfile, 'allergens' | 'diets' | 'dislikedIngredientIds' | 'equipment'>;

export type ViolationKind = 'allergen' | 'diet' | 'disliked' | 'equipment' | 'time' | 'unknown_ingredient';

export interface ConstraintViolation {
  kind: ViolationKind;
  /** Explication courte en français (« Arachides (cacahuètes) »). */
  detail: string;
  ingredientId?: string;
}

export interface RecipeCheck {
  /** Aucune violation : la recette peut être proposée telle quelle. */
  allowed: boolean;
  /** Aucune violation de sécurité (allergène, régime, ingrédient inconnu). */
  safe: boolean;
  violations: ConstraintViolation[];
}

export interface CheckOptions {
  /** Temps total max (préparation + cuisson), minutes. */
  maxTimeMin?: number;
}

/** Violations qui touchent à la santé / aux convictions : jamais relâchées. */
export const SAFETY_VIOLATIONS: readonly ViolationKind[] = ['allergen', 'diet', 'unknown_ingredient'];

/**
 * Recherche SÛRE d'un ingrédient dans le référentiel.
 *
 * - Propriété PROPRE uniquement : un id comme « constructor » ou « toString »
 *   ne doit pas renvoyer une fonction héritée d'Object.prototype.
 * - Enregistrement incomplet (liste d'allergènes absente) → considéré comme
 *   inconnu : on ne peut pas garantir son innocuité (fail closed).
 */
export function lookupIngredient(
  ingredientsById: Record<string, Ingredient>,
  id: string,
): Ingredient | undefined {
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(ingredientsById, id)) return undefined;
  const ing = ingredientsById[id];
  if (!ing || typeof ing !== 'object' || !Array.isArray(ing.allergens)) return undefined;
  return ing;
}

/** Union des allergènes de TOUS les ingrédients (optionnels compris). */
export function recipeAllergens(recipe: Recipe, ingredientsById: Record<string, Ingredient>): Allergen[] {
  const set = new Set<Allergen>();
  for (const ri of recipe.ingredients) {
    const ing = lookupIngredient(ingredientsById, ri.ingredientId);
    if (ing) for (const a of ing.allergens) set.add(a);
  }
  return Array.from(set);
}

/** Ingrédient porteur de crustacés / mollusques (drapeau ou allergène). */
function isShellfish(ing: Ingredient): boolean {
  return ing.isSeafood || ing.allergens.includes('crustaces') || ing.allergens.includes('mollusques');
}

/** Ingrédient « chair animale » (viande, poisson, fruits de mer) — défense en profondeur. */
function isAnimalFlesh(ing: Ingredient): boolean {
  return ing.isMeat || ing.isPork || ing.isFish || isShellfish(ing) || ing.allergens.includes('poissons');
}

/**
 * Un ingrédient est-il compatible avec un régime ?
 * (Le cas casher viande + lait est une règle au niveau de la recette :
 * voir `checkRecipe`.)
 */
export function dietAllows(diet: Diet, ingredient: Ingredient): boolean {
  switch (diet) {
    case 'vegetarien':
      return !isAnimalFlesh(ingredient);
    case 'vegan':
      return (
        !isAnimalFlesh(ingredient) &&
        !ingredient.isAnimalProduct &&
        !ingredient.allergens.includes('oeufs') &&
        !ingredient.allergens.includes('lait')
      );
    case 'pescetarien':
      return !ingredient.isMeat && !ingredient.isPork;
    case 'halal':
      return !ingredient.isPork && !ingredient.isAlcohol;
    case 'casher':
      return !ingredient.isPork && !isShellfish(ingredient);
    case 'sans_porc':
      return !ingredient.isPork;
    case 'sans_gluten':
      return !ingredient.allergens.includes('gluten');
    case 'sans_lactose':
      return !ingredient.allergens.includes('lait');
    default:
      // Régime inconnu (données corrompues / version future) : on refuse.
      return false;
  }
}

/** Temps total d'une recette, minutes. */
export function recipeTotalTime(recipe: Recipe): number {
  return (recipe.prepTimeMin || 0) + (recipe.cookTimeMin || 0);
}

/** Ustensiles effectifs du profil : les plaques sont supposées si rien n'est déclaré. */
function ownedEquipment(equipment: readonly Equipment[] | undefined): readonly Equipment[] {
  return equipment && equipment.length > 0 ? equipment : ['plaques'];
}

/** Vérifie une recette contre le profil et liste toutes les violations. */
export function checkRecipe(
  recipe: Recipe,
  profile: ConstraintProfile,
  ingredientsById: Record<string, Ingredient>,
  opts: CheckOptions = {},
): RecipeCheck {
  const violations: ConstraintViolation[] = [];
  const allergens = profile.allergens ?? [];
  const diets = profile.diets ?? [];
  const disliked = profile.dislikedIngredientIds ?? [];
  let hasMeat = false;
  let hasDairy = false;

  // Recette sans liste d'ingrédients exploitable (donnée corrompue) : on ne
  // peut rien vérifier → non sûre.
  if (!Array.isArray(recipe.ingredients)) {
    violations.push({ kind: 'unknown_ingredient', detail: 'Ingrédients de la recette illisibles' });
  }

  for (const ri of Array.isArray(recipe.ingredients) ? recipe.ingredients : []) {
    const ing = lookupIngredient(ingredientsById, ri.ingredientId);
    if (!ing) {
      violations.push({
        kind: 'unknown_ingredient',
        detail: `Ingrédient inconnu : ${ri.ingredientId}`,
        ingredientId: ri.ingredientId,
      });
      continue;
    }
    for (const a of ing.allergens) {
      if (allergens.includes(a)) {
        violations.push({ kind: 'allergen', detail: `${ALLERGEN_LABELS[a]} (${ing.name})`, ingredientId: ing.id });
      }
    }
    for (const d of diets) {
      if (!dietAllows(d, ing)) {
        violations.push({ kind: 'diet', detail: `${DIET_LABELS[d] ?? d} : ${ing.name}`, ingredientId: ing.id });
      }
    }
    // Un ingrédient optionnel « pas aimé » peut simplement être omis.
    if (!ri.optional && disliked.includes(ing.id)) {
      violations.push({ kind: 'disliked', detail: `Tu n'aimes pas : ${ing.name}`, ingredientId: ing.id });
    }
    if (ing.isMeat || ing.isPork) hasMeat = true;
    if (ing.allergens.includes('lait')) hasDairy = true;
  }

  // Casher : pas de viande et de produit laitier dans le même plat.
  if (diets.includes('casher') && hasMeat && hasDairy) {
    violations.push({ kind: 'diet', detail: 'Casher : viande et produit laitier dans le même plat' });
  }

  const owned = ownedEquipment(profile.equipment);
  for (const e of recipe.equipment ?? []) {
    if (!owned.includes(e)) {
      violations.push({ kind: 'equipment', detail: `Nécessite : ${EQUIPMENT_LABELS[e] ?? e}` });
    }
  }

  const total = recipeTotalTime(recipe);
  if (opts.maxTimeMin !== undefined && total > opts.maxTimeMin) {
    violations.push({ kind: 'time', detail: `${total} min (max ${opts.maxTimeMin} min)` });
  }

  return {
    allowed: violations.length === 0,
    safe: !violations.some((v) => SAFETY_VIOLATIONS.includes(v.kind)),
    violations,
  };
}

/** Recette sans danger (allergènes, régimes, ingrédients connus). */
export function isRecipeSafe(
  recipe: Recipe,
  profile: ConstraintProfile,
  ingredientsById: Record<string, Ingredient>,
): boolean {
  return checkRecipe(recipe, profile, ingredientsById).safe;
}

/** Recettes autorisées (aucune violation, contraintes de confort comprises). */
export function filterRecipes(
  recipes: readonly Recipe[],
  profile: ConstraintProfile,
  ingredientsById: Record<string, Ingredient>,
  opts: CheckOptions = {},
): Recipe[] {
  return recipes.filter((r) => checkRecipe(r, profile, ingredientsById, opts).allowed);
}

/** Recettes sûres uniquement (contraintes de confort ignorées). */
export function filterSafeRecipes(
  recipes: readonly Recipe[],
  profile: ConstraintProfile,
  ingredientsById: Record<string, Ingredient>,
): Recipe[] {
  return recipes.filter((r) => isRecipeSafe(r, profile, ingredientsById));
}

/**
 * Dernier filet de sécurité avant d'enregistrer / afficher un planning :
 * une recette absente du référentiel est considérée comme non sûre.
 */
export function assertPlanSafe(
  plan: MealPlan,
  recipesById: Record<string, Recipe>,
  profile: ConstraintProfile,
  ingredientsById: Record<string, Ingredient>,
): { ok: boolean; unsafeMealIds: string[] } {
  const unsafeMealIds = plan.meals
    .filter((m) => {
      const recipe = recipesById[m.recipeId];
      return !recipe || !isRecipeSafe(recipe, profile, ingredientsById);
    })
    .map((m) => m.id);
  return { ok: unsafeMealIds.length === 0, unsafeMealIds };
}

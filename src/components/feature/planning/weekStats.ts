/**
 * Calculs purs de l'écran « Ma semaine » : statistiques, créneaux libres,
 * libellés. Aucun import React : testable seul.
 */
import type { MealType, PlannedMeal, Recipe, UserProfile } from '@/core';
import { recipeTotalTime, slotKey, weekSlots } from '@/core';

/**
 * Coût moyen estimé d'une portion selon le niveau de prix de la recette
 * (centimes). Utilisé tant que le comparateur n'a pas chiffré le panier.
 */
export const COST_PER_SERVING_CENTS: Record<Recipe['costLevel'], number> = { 1: 180, 2: 290, 3: 430 };

export function estimateMealCostCents(recipe: Pick<Recipe, 'costLevel'> | undefined, servings: number): number {
  if (!recipe) return 0;
  const perServing = COST_PER_SERVING_CENTS[recipe.costLevel] ?? COST_PER_SERVING_CENTS[2];
  return Math.round(perServing * Math.max(1, Number.isFinite(servings) ? servings : 1));
}

export interface WeekStats {
  meals: number;
  /** Budget de la semaine (centimes). */
  budgetCents: number;
  /** true : estimation ; false : total réel du panier calculé. */
  budgetIsEstimate: boolean;
  /** Temps moyen (prépa + cuisson) par repas, minutes arrondies. */
  avgMinutes: number;
}

/** Budget déjà chiffré ailleurs : panier calculé (exact) ou liste comparée (estimation). */
export interface KnownBudget {
  cents: number;
  exact: boolean;
}

/**
 * Chiffres clés de la semaine. Budget, par ordre de préférence : `known`
 * (panier ou liste chiffrée), sinon estimation par niveau de prix des recettes.
 */
export function computeWeekStats(
  meals: readonly PlannedMeal[],
  recipesById: Record<string, Recipe>,
  known?: KnownBudget | null,
): WeekStats {
  let estimate = 0;
  let minutes = 0;
  let timed = 0;
  for (const m of meals) {
    const r = recipesById[m.recipeId];
    if (!r) continue;
    estimate += estimateMealCostCents(r, m.servings);
    minutes += recipeTotalTime(r);
    timed += 1;
  }
  const useKnown = !!known && Number.isFinite(known.cents) && known.cents > 0 && meals.length > 0;
  return {
    meals: meals.length,
    budgetCents: useKnown ? Math.round(known.cents) : estimate,
    budgetIsEstimate: useKnown ? !known.exact : true,
    avgMinutes: timed > 0 ? Math.round(minutes / timed) : 0,
  };
}

/** Somme des meilleures offres d'une liste comparée (centimes), null si rien n'est chiffré. */
export function listEstimateCents(comparisons: readonly { best?: { totalCents: number } }[]): number | null {
  let total = 0;
  for (const c of comparisons) total += c.best?.totalCents ?? 0;
  return total > 0 ? total : null;
}

export interface OpenSlot {
  date: string;
  type: MealType;
}

/** Créneaux du profil encore sans repas cette semaine (triés). */
export function openSlotsOf(
  profile: Pick<UserProfile, 'mealSlots'> | null | undefined,
  weekStart: string,
  meals: readonly PlannedMeal[],
): OpenSlot[] {
  if (!profile) return [];
  const taken = new Set(meals.map((m) => slotKey(m.date, m.type)));
  return weekSlots(profile, weekStart).filter((s) => !taken.has(slotKey(s.date, s.type)));
}

/** Prénom pour le message d'accueil (« Camille Martin » → « Camille »). */
export function firstNameOf(displayName: string | null | undefined): string {
  const first = (displayName ?? '').trim().split(/\s+/)[0] ?? '';
  return first;
}

export function greetingFor(displayName: string | null | undefined): string {
  const first = firstNameOf(displayName);
  return first ? `Salut ${first}` : 'Salut !';
}

/** « 1 repas », « 3 repas » ; « 1 article », « 23 articles ». */
export function countLabelFr(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n > 1 ? plural : singular}`;
}

/** Arrondi « humain » d'un budget estimé à l'euro (centimes → centimes). */
export function roundToEuro(cents: number): number {
  return Math.round(cents / 100) * 100;
}

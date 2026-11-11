/**
 * Édition du profil après l'onboarding — logique pure : sections éditables
 * (mêmes identifiants que les étapes de l'onboarding), résumé d'une ligne par
 * section, champs concernés, détection des changements, et repas remplacés
 * par la revérification automatique du planning.
 */
import type { MealPlan, Store, UserProfile } from '@/core';
import { ALLERGEN_LABELS, CUISINE_LABELS, DIET_LABELS, EQUIPMENT_LABELS, formatPrice, joinFr, storeDisplayName } from '@/core';
import type { ProfileDraft } from '@/stores';

import { householdSummary } from '../onboarding/steps';
import { COOK_TIME_CHOICES, nearestCookTime } from '../profile/profileOptions';

export type ProfileSectionId = 'foyer' | 'regime' | 'budget-temps' | 'cuisine' | 'magasins' | 'creneaux';

export interface ProfileSectionMeta {
  id: ProfileSectionId;
  emoji: string;
  /** Titre court (ligne du profil). */
  title: string;
  /** Titre de l'écran d'édition (≤ 5 mots). */
  screenTitle: string;
  /** Sous-titre de l'écran d'édition. */
  subtitle: string;
  /** Champs du profil modifiés par la section. */
  fields: readonly (keyof ProfileDraft)[];
  /** Phrase du toast de confirmation. */
  savedMessage: string;
}

export const PROFILE_SECTIONS: readonly ProfileSectionMeta[] = [
  {
    id: 'foyer',
    emoji: '🏡',
    title: 'Foyer',
    screenTitle: 'Ton foyer',
    subtitle: 'Ton prénom et qui passe à table : Cabas ajuste les portions.',
    fields: ['displayName', 'household'],
    savedMessage: 'Les portions suivent ton foyer.',
  },
  {
    id: 'regime',
    emoji: '🥗',
    title: 'Régimes & allergies',
    screenTitle: 'Tes goûts & ta santé',
    subtitle: 'Régimes, allergies, aliments que tu n’aimes pas : on s’adapte.',
    fields: ['diets', 'allergens', 'dislikedIngredientIds', 'healthDataConsentAt'],
    savedMessage: 'Tes menus en tiennent compte, dès maintenant.',
  },
  {
    id: 'budget-temps',
    emoji: '💶',
    title: 'Budget & temps',
    screenTitle: 'Budget & temps',
    subtitle: 'Ton budget courses et le temps que tu veux passer en cuisine.',
    fields: ['weeklyBudgetCents', 'maxCookTimeWeekdayMin', 'maxCookTimeWeekendMin'],
    savedMessage: 'Tes prochains menus suivront ce budget et ce rythme.',
  },
  {
    id: 'cuisine',
    emoji: '🍳',
    title: 'Cuisine',
    screenTitle: 'Ta cuisine',
    subtitle: 'Tes ustensiles et tes cuisines préférées.',
    fields: ['equipment', 'favoriteCuisines'],
    savedMessage: 'Tes prochaines idées suivront tes envies.',
  },
  {
    id: 'magasins',
    emoji: '🛒',
    title: 'Magasins',
    screenTitle: 'Tes magasins',
    subtitle: 'Où fais-tu tes courses ? Choisis jusqu’à 5 enseignes.',
    fields: ['preferredStoreIds'],
    savedMessage: 'Le comparateur suit tes enseignes.',
  },
  {
    id: 'creneaux',
    emoji: '🗓️',
    title: 'Repas',
    screenTitle: 'Tes repas',
    subtitle: 'Les midis et les soirs que Cabas planifie pour toi.',
    fields: ['mealSlots'],
    savedMessage: 'Tes prochaines semaines suivront ces créneaux.',
  },
];

export function sectionMeta(id: ProfileSectionId): ProfileSectionMeta {
  return PROFILE_SECTIONS.find((s) => s.id === id) ?? PROFILE_SECTIONS[0];
}

/** Paramètre de route → section connue, sinon null. */
export function parseSectionParam(value: unknown): ProfileSectionId | null {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === 'string' && PROFILE_SECTIONS.some((s) => s.id === v) ? (v as ProfileSectionId) : null;
}

export function sectionHref(id: ProfileSectionId): string {
  return `/parametres/profil/${id}`;
}

function cookLabel(min: number): string {
  return COOK_TIME_CHOICES.find((c) => c.value === nearestCookTime(min))?.label ?? `${min} min`;
}

/** Résumé d'une section (valeur principale + détail facultatif), prêt à afficher. */
export function sectionSummary(
  id: ProfileSectionId,
  p: Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>,
  stores: readonly Store[] = [],
): { value: string; detail: string | null } {
  switch (id) {
    case 'foyer':
      return { value: householdSummary(p.household), detail: null };
    case 'regime': {
      const diets = p.diets.map((d) => DIET_LABELS[d]);
      const allergens = p.allergens.map((a) => ALLERGEN_LABELS[a]);
      return {
        value: diets.length ? joinFr(diets) : 'Aucun régime particulier',
        detail: allergens.length ? `Allergies : ${joinFr(allergens).toLowerCase()}` : 'Aucune allergie déclarée',
      };
    }
    case 'budget-temps':
      return {
        value: `${formatPrice(p.weeklyBudgetCents, { compact: true })} par semaine`,
        detail: `${cookLabel(p.maxCookTimeWeekdayMin)} en semaine · ${cookLabel(p.maxCookTimeWeekendMin)} le week-end`,
      };
    case 'cuisine': {
      const eq = p.equipment.map((e) => EQUIPMENT_LABELS[e]);
      const cu = p.favoriteCuisines.map((c) => CUISINE_LABELS[c]);
      return {
        value: eq.length ? joinFr(eq) : 'Sans ustensile',
        detail: cu.length ? `Envie de : ${joinFr(cu).toLowerCase()}` : null,
      };
    }
    case 'magasins': {
      const chosen = p.preferredStoreIds.map((sid) => stores.find((s) => s.id === sid)).filter((s): s is Store => !!s);
      return { value: chosen.length ? joinFr(chosen.map((s) => storeDisplayName(s))) : 'Aucun magasin', detail: null };
    }
    case 'creneaux':
    default: {
      const n = p.mealSlots.length;
      return { value: `${n} repas par semaine`, detail: null };
    }
  }
}

/** Ne garde que les champs de la section (patch à passer à `updateProfile`). */
export function sectionPatch(id: ProfileSectionId, draft: ProfileDraft): ProfileDraft {
  const out: Record<string, unknown> = {};
  for (const f of sectionMeta(id).fields) {
    if (f in draft) out[f] = draft[f];
  }
  return out as ProfileDraft;
}

/** Égalité structurelle (valeurs JSON du profil : nombres, chaînes, tableaux, objets). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  return ka.length === kb.length && ka.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Vrai si le brouillon modifie au moins un champ de la section. */
export function isSectionDirty(id: ProfileSectionId, profile: ProfileDraft, draft: ProfileDraft): boolean {
  return sectionMeta(id).fields.some((f) => !sameValue(profile[f], draft[f]));
}

/**
 * Repas dont le plat a changé entre deux états du planning (revérification
 * automatique après un changement d'allergies / de régime).
 */
export function countReplacedMeals(before: Record<string, MealPlan>, after: Record<string, MealPlan>): number {
  let n = 0;
  for (const [ws, plan] of Object.entries(after)) {
    const prev = before[ws];
    if (!prev || prev === plan) continue;
    const prevById = new Map(prev.meals.map((m) => [m.id, m.recipeId]));
    for (const m of plan.meals) {
      const was = prevById.get(m.id);
      if (was !== undefined && was !== m.recipeId) n += 1;
    }
  }
  return n;
}

/** Prénom affiché (ou repli chaleureux). */
export function displayNameOf(profile: Pick<UserProfile, 'displayName'> | null | undefined): string | null {
  const name = (profile?.displayName ?? '').trim();
  return name.length > 0 ? name : null;
}

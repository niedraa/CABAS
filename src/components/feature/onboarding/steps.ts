/**
 * Étapes de l'onboarding (ordre, chemins) et règles de passage — pures et
 * testables. Les écrans vivent dans `src/app/(onboarding)/`.
 */
import {
  addDays,
  householdPortions,
  openSlots,
  startOfWeek,
  weekSlots,
  type MealEngineInput,
  type UserProfile,
} from '@/core';
import { DEFAULT_DRAFT, validateProfile, type ProfileDraft, type ProfileIssue } from '@/stores';

import { isHealthStepValid } from '../profile/profileOptions';

export const ONBOARDING_STEPS = [
  { id: 'bienvenue', path: '/bienvenue', label: 'Bienvenue' },
  { id: 'foyer', path: '/foyer', label: 'Ton foyer' },
  { id: 'regime', path: '/regime', label: 'Régimes & allergies' },
  { id: 'budget-temps', path: '/budget-temps', label: 'Budget & temps' },
  { id: 'cuisine', path: '/cuisine', label: 'Ta cuisine' },
  { id: 'magasins', path: '/magasins', label: 'Tes magasins' },
  { id: 'creneaux', path: '/creneaux', label: 'Tes repas' },
  { id: 'recap', path: '/recap', label: 'Récapitulatif' },
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]['id'];
export type OnboardingPath = (typeof ONBOARDING_STEPS)[number]['path'];

/** Nombre d'étapes affichées dans la barre de progression (hors bienvenue). */
export const PROGRESS_STEP_COUNT = ONBOARDING_STEPS.length - 1;

export function stepIndex(id: OnboardingStepId): number {
  return ONBOARDING_STEPS.findIndex((s) => s.id === id);
}

/** Index de l'étape d'après un chemin (`/foyer`, `/foyer?edit=1`) ; -1 si hors onboarding. */
export function stepIndexFromPath(pathname: string | null | undefined): number {
  if (!pathname) return -1;
  const clean = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  return ONBOARDING_STEPS.findIndex((s) => s.path === clean);
}

export function nextStepPath(id: OnboardingStepId): OnboardingPath | null {
  const i = stepIndex(id);
  return i >= 0 && i < ONBOARDING_STEPS.length - 1 ? ONBOARDING_STEPS[i + 1].path : null;
}

export function previousStepPath(id: OnboardingStepId): OnboardingPath | null {
  const i = stepIndex(id);
  return i > 0 ? ONBOARDING_STEPS[i - 1].path : null;
}

/**
 * Chemins à empiler (dans l'ordre) depuis la bienvenue pour reprendre à une
 * étape : chaque étape jusqu'à celle-ci. Ainsi « Étape précédente », le geste
 * de retour et le retour Android remontent étape par étape, et pas d'un coup
 * jusqu'à la bienvenue.
 */
export function resumePaths(id: OnboardingStepId): OnboardingPath[] {
  const i = stepIndex(id);
  return i > 0 ? ONBOARDING_STEPS.slice(1, i + 1).map((s) => s.path) : [];
}

/** « Étape 2 sur 7 » (la bienvenue n'est pas comptée). */
export function stepCounterLabel(index: number): string {
  return `Étape ${Math.max(1, Math.min(PROGRESS_STEP_COUNT, index))} sur ${PROGRESS_STEP_COUNT}`;
}

export type StepGate = { ok: true } | { ok: false; reason: string };

/** Brouillon complété par les valeurs par défaut. */
export function fullDraft(draft: ProfileDraft): Required<ProfileDraft> {
  return { ...DEFAULT_DRAFT, ...draft };
}

/** L'étape peut-elle être validée avec ce brouillon ? (raison prête à afficher sinon) */
export function canContinue(id: OnboardingStepId, draft: ProfileDraft): StepGate {
  const d = fullDraft(draft);
  switch (id) {
    case 'foyer':
      return d.household.adults >= 1 ? { ok: true } : { ok: false, reason: 'Ajoute au moins un adulte.' };
    case 'regime':
      return isHealthStepValid(d)
        ? { ok: true }
        : { ok: false, reason: 'Coche ton accord, juste sous les allergies, pour continuer.' };
    case 'magasins':
      return d.preferredStoreIds.length > 0 ? { ok: true } : { ok: false, reason: 'Choisis au moins un magasin.' };
    case 'creneaux':
      return d.mealSlots.length > 0 ? { ok: true } : { ok: false, reason: 'Choisis au moins un repas.' };
    case 'recap': {
      const issues = validateProfile(d);
      return issues.length === 0 ? { ok: true } : { ok: false, reason: issues[0].message };
    }
    default:
      return { ok: true };
  }
}

/** Étape à corriger pour un problème de validation du profil. */
export function stepForIssue(issue: ProfileIssue): OnboardingStepId {
  switch (issue.field) {
    case 'household':
      return 'foyer';
    case 'diets':
    case 'allergens':
    case 'healthDataConsentAt':
    case 'dislikedIngredientIds':
      return 'regime';
    case 'weeklyBudgetCents':
    case 'maxCookTimeWeekdayMin':
    case 'maxCookTimeWeekendMin':
      return 'budget-temps';
    case 'equipment':
    case 'favoriteCuisines':
      return 'cuisine';
    case 'preferredStoreIds':
      return 'magasins';
    case 'mealSlots':
      return 'creneaux';
    default:
      return 'foyer';
  }
}

/** Le brouillon a-t-il été modifié depuis les valeurs par défaut ? (reprise de l'onboarding) */
export function draftHasProgress(draft: ProfileDraft): boolean {
  const d = fullDraft(draft);
  const keys = Object.keys(DEFAULT_DRAFT) as (keyof ProfileDraft)[];
  return keys.some((k) => JSON.stringify(d[k]) !== JSON.stringify(DEFAULT_DRAFT[k]));
}

/** Résumé court du foyer : « 2 adultes, 1 enfant · 2,5 portions ». */
export function householdSummary(h: UserProfile['household']): string {
  const parts = [`${h.adults} adulte${h.adults > 1 ? 's' : ''}`];
  if (h.children > 0) parts.push(`${h.children} enfant${h.children > 1 ? 's' : ''}`);
  const p = householdPortions(h);
  const portions = Number.isInteger(p) ? String(p) : String(p).replace('.', ',');
  return `${parts.join(', ')} · ${portions} portion${p > 1 ? 's' : ''}`;
}

/** En dessous de ce nombre de repas encore planifiables d'ici dimanche, on démarre la semaine suivante. */
export const MIN_FIRST_WEEK_MEALS = 3;

/**
 * Semaine du premier planning (fin d'onboarding) : la semaine en cours si le
 * moteur peut y placer assez de repas sans toucher un jour passé, sinon la
 * suivante. On demande au moteur lui-même quels créneaux il remplirait
 * (`openSlots`, avec `fromDate` = aujourd'hui comme `planStore.generate`) :
 * s'il remplit depuis le lundi, le moindre créneau passé fait basculer sur la
 * semaine suivante ; s'il saute les jours passés, on garde la semaine en
 * cours tant qu'il reste au moins `MIN_FIRST_WEEK_MEALS` repas à planifier.
 * Dans tous les cas : jamais de repas déjà passé, ni de courses pour lui.
 */
export function firstPlanWeekStart(profile: UserProfile, maxMeals: number, today: string): string {
  const current = startOfWeek(today);
  // Seuls les créneaux comptent : pas besoin du catalogue de recettes.
  const input: MealEngineInput & { fromDate?: string } = {
    profile,
    recipes: [],
    ingredientsById: {},
    weekStart: current,
    maxMeals,
    fromDate: today,
  };
  const planned = openSlots(input);
  const enough = Math.min(MIN_FIRST_WEEK_MEALS, Math.max(1, maxMeals), weekSlots(profile, current).length);
  return planned.length >= enough && planned.every((s) => s.date >= today) ? current : addDays(current, 7);
}

/** Messages qui défilent pendant la génération du planning. */
export const GENERATION_MESSAGES = [
  'Je trie les recettes selon tes goûts…',
  'J’écarte les allergènes…',
  'Je respecte ton temps en cuisine…',
  'J’équilibre la semaine…',
  'Je garde un œil sur ton budget…',
] as const;

/** « 1,2 s » / « 850 ms ». */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.max(1, Math.round(ms / 10) * 10)} ms`;
  return `${(Math.round(ms / 100) / 10).toFixed(1).replace('.', ',')} s`;
}

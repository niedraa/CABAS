/**
 * profileStore — profil du foyer et onboarding (persisté : `cabas/profile`).
 *
 * État :
 *  - `profile: UserProfile | null`, `onboardingCompleted: boolean`,
 *    `onboardingCompletedAt: string | null` ;
 *  - `draft: ProfileDraft` : profil partiel édité étape par étape pendant
 *    l'onboarding (pré-rempli avec des valeurs par défaut raisonnables).
 * Actions :
 *  - `startOnboarding()` (analytique), `updateDraft(patch)`, `resetDraft()` ;
 *  - `setHealthDataConsent(granted)` : consentement RGPD explicite aux données
 *    de santé. Le RETRAIT vide aussi allergies et régimes (brouillon ET profil) ;
 *  - `completeOnboarding()` → `{ ok: true, profile }` ou `{ ok: false, issues }`
 *    (valide, pose id / horodatages ; consentement requis si allergies ou régimes) ;
 *  - `updateProfile(patch)` → même résultat (mêmes règles de validation) ;
 *  - `reset()`.
 * Utilitaires purs : `validateProfile(draft)`, `DEFAULT_DRAFT`, `draftFromProfile(p)`.
 * Le planning est revérifié automatiquement quand les allergies / régimes
 * changent (voir planStore) : aucun plat avec un allergène déclaré.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { UserProfile } from '@/core';
import { DEFAULT_MEAL_SLOTS, createId } from '@/core';
import { track } from '@/services/analytics';
import { getCurrentUserId } from '@/services/auth';
import { getCatalogSnapshot } from '@/services/catalog';

import { basePersistOptions, registerPersistedStore } from './registry';

/** Profil en cours de saisie (tout est optionnel). */
export type ProfileDraft = Partial<Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>>;

export interface ProfileIssue {
  field: keyof ProfileDraft;
  message: string;
}

export type ProfileResult = { ok: true; profile: UserProfile } | { ok: false; issues: ProfileIssue[] };

export const DEFAULT_DRAFT: Required<ProfileDraft> = {
  displayName: '',
  household: { adults: 2, children: 0 },
  diets: [],
  allergens: [],
  dislikedIngredientIds: [],
  favoriteCuisines: [],
  weeklyBudgetCents: 8000,
  maxCookTimeWeekdayMin: 30,
  maxCookTimeWeekendMin: 60,
  equipment: ['plaques', 'four'],
  preferredStoreIds: [],
  mealSlots: DEFAULT_MEAL_SLOTS,
  healthDataConsentAt: null,
};

/** Brouillon complet à partir d'un profil (édition depuis l'écran Profil). */
export function draftFromProfile(p: UserProfile): Required<ProfileDraft> {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = p;
  return { ...DEFAULT_DRAFT, ...rest };
}

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

/** Règles de validation (messages prêts à afficher, tutoiement). */
export function validateProfile(draft: ProfileDraft): ProfileIssue[] {
  const d = { ...DEFAULT_DRAFT, ...draft };
  const issues: ProfileIssue[] = [];
  const { adults, children } = d.household ?? { adults: 0, children: 0 };
  if (!isInt(adults) || adults < 1 || adults > 12) {
    issues.push({ field: 'household', message: 'Indique entre 1 et 12 adultes dans ton foyer.' });
  }
  if (!isInt(children) || children < 0 || children > 12) {
    issues.push({ field: 'household', message: 'Indique entre 0 et 12 enfants.' });
  }
  if (!isInt(d.weeklyBudgetCents) || d.weeklyBudgetCents < 0 || d.weeklyBudgetCents > 1_000_000) {
    issues.push({ field: 'weeklyBudgetCents', message: 'Ton budget doit être compris entre 0 et 10 000 €.' });
  }
  for (const key of ['maxCookTimeWeekdayMin', 'maxCookTimeWeekendMin'] as const) {
    const v = d[key];
    if (!isInt(v) || v < 5 || v > 600) {
      issues.push({ field: key, message: 'Choisis un temps de cuisine entre 5 minutes et 10 heures.' });
    }
  }
  const stores = getCatalogSnapshot().storesById;
  const preferred = (d.preferredStoreIds ?? []).filter((id) => !!stores[id]);
  if (preferred.length === 0) {
    issues.push({ field: 'preferredStoreIds', message: 'Choisis au moins un magasin.' });
  }
  if (!Array.isArray(d.mealSlots) || d.mealSlots.length === 0) {
    issues.push({ field: 'mealSlots', message: 'Choisis au moins un repas à planifier.' });
  }
  const hasHealthData = (d.allergens?.length ?? 0) > 0 || (d.diets?.length ?? 0) > 0;
  if (hasHealthData && !d.healthDataConsentAt) {
    issues.push({
      field: 'healthDataConsentAt',
      message: 'Pour tenir compte de tes allergies et de ton régime, on a besoin de ton accord explicite.',
    });
  }
  if ((d.displayName ?? '').length > 80) {
    issues.push({ field: 'displayName', message: 'Ton prénom est un peu long (80 caractères max).' });
  }
  return issues;
}

function uniq<T>(xs: readonly T[] | undefined): T[] {
  return Array.from(new Set(xs ?? []));
}

/** Nettoie un brouillon validé (doublons, magasins inconnus, prénom). */
function normalize(d: Required<ProfileDraft>): Required<ProfileDraft> {
  const stores = getCatalogSnapshot().storesById;
  return {
    ...d,
    displayName: d.displayName.trim().replace(/\s+/g, ' '),
    diets: uniq(d.diets),
    allergens: uniq(d.allergens),
    dislikedIngredientIds: uniq(d.dislikedIngredientIds),
    favoriteCuisines: uniq(d.favoriteCuisines),
    equipment: uniq(d.equipment),
    preferredStoreIds: uniq(d.preferredStoreIds).filter((id) => !!stores[id]),
  };
}

export interface ProfileState {
  hydrated: boolean;
  profile: UserProfile | null;
  onboardingCompleted: boolean;
  onboardingCompletedAt: string | null;
  draft: ProfileDraft;
  startOnboarding(): void;
  updateDraft(patch: ProfileDraft): void;
  resetDraft(): void;
  setHealthDataConsent(granted: boolean): void;
  completeOnboarding(): ProfileResult;
  updateProfile(patch: ProfileDraft): ProfileResult;
  /** Remplace le profil (synchronisation serveur, seed de démo). */
  setProfile(profile: UserProfile | null, onboardingCompleted?: boolean): void;
  reset(): void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      profile: null,
      onboardingCompleted: false,
      onboardingCompletedAt: null,
      draft: { ...DEFAULT_DRAFT },

      startOnboarding() {
        track('onboarding_started');
      },
      updateDraft(patch) {
        set({ draft: { ...get().draft, ...patch } });
      },
      resetDraft() {
        const p = get().profile;
        set({ draft: p ? draftFromProfile(p) : { ...DEFAULT_DRAFT } });
      },
      setHealthDataConsent(granted) {
        const now = new Date().toISOString();
        const { draft, profile } = get();
        if (granted) {
          set({
            draft: { ...draft, healthDataConsentAt: draft.healthDataConsentAt ?? now },
            profile: profile ? { ...profile, healthDataConsentAt: profile.healthDataConsentAt ?? now, updatedAt: now } : null,
          });
          return;
        }
        // Retrait du consentement : les données de santé sont effacées.
        set({
          draft: { ...draft, healthDataConsentAt: null, allergens: [], diets: [] },
          profile: profile ? { ...profile, healthDataConsentAt: null, allergens: [], diets: [], updatedAt: now } : null,
        });
      },
      completeOnboarding() {
        const merged = { ...DEFAULT_DRAFT, ...get().draft };
        const issues = validateProfile(merged);
        if (issues.length > 0) return { ok: false, issues };
        const clean = normalize(merged);
        const now = new Date().toISOString();
        const existing = get().profile;
        const profile: UserProfile = {
          ...clean,
          id: existing?.id ?? getCurrentUserId() ?? createId('user'),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        set({ profile, onboardingCompleted: true, onboardingCompletedAt: now, draft: draftFromProfile(profile) });
        // Jamais de donnée de santé dans l'analytique : uniquement des volumes.
        track('onboarding_completed', {
          adults: profile.household.adults,
          children: profile.household.children,
          stores: profile.preferredStoreIds.length,
          mealSlots: profile.mealSlots.length,
          budgetCents: profile.weeklyBudgetCents,
        });
        return { ok: true, profile };
      },
      updateProfile(patch) {
        const current = get().profile;
        if (!current) return { ok: false, issues: [{ field: 'displayName', message: 'Crée d’abord ton profil.' }] };
        const merged = { ...draftFromProfile(current), ...patch };
        const issues = validateProfile(merged);
        if (issues.length > 0) return { ok: false, issues };
        const profile: UserProfile = {
          ...normalize(merged),
          id: current.id,
          createdAt: current.createdAt,
          updatedAt: new Date().toISOString(),
        };
        set({ profile, draft: draftFromProfile(profile) });
        return { ok: true, profile };
      },
      setProfile(profile, onboardingCompleted) {
        const done = onboardingCompleted ?? !!profile;
        set({
          profile,
          onboardingCompleted: done,
          onboardingCompletedAt: done ? (get().onboardingCompletedAt ?? new Date().toISOString()) : null,
          draft: profile ? draftFromProfile(profile) : { ...DEFAULT_DRAFT },
        });
      },
      reset() {
        set({ profile: null, onboardingCompleted: false, onboardingCompletedAt: null, draft: { ...DEFAULT_DRAFT } });
      },
    }),
    {
      ...basePersistOptions<Partial<ProfileState>>('profile'),
      partialize: (s) => ({
        profile: s.profile,
        onboardingCompleted: s.onboardingCompleted,
        onboardingCompletedAt: s.onboardingCompletedAt,
        draft: s.draft,
      }),
    },
  ),
);

registerPersistedStore('profile', useProfileStore);

/** Profil courant (hors React). */
export function currentProfile(): UserProfile | null {
  return useProfileStore.getState().profile;
}

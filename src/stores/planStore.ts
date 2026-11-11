/**
 * planStore — planning des repas par semaine (persisté : `cabas/plan`).
 *
 * État :
 *  - `plans: Record<weekStart, MealPlan>` (semaine en cours + suivante, l'historique
 *    récent est conservé 4 semaines) ;
 *  - `status: 'idle' | 'generating' | 'error'`, `generatingWeekStart`, `error` ;
 *  - `generatingWeeks: Record<weekStart, true>` : générations en cours, PAR
 *    semaine (deux semaines peuvent se générer en même temps) ;
 *  - `lastDurationMs`, `lastSource` ('remote' | 'local' | 'fallback') ;
 *  - `recentRecipeIds` (variété d'une semaine à l'autre).
 * Actions (semaine par défaut : `weekStore.activeWeekStart` ; les actions sur un
 * repas retrouvent sa semaine toutes seules) :
 *  - `generate(weekStart?, { keepLocked = true })` → Promise<PlanActionResult> :
 *    respecte l'offre (3 repas en gratuit), les allergies (revérifiées côté
 *    client), conserve les repas verrouillés et ceux des jours passés, ne
 *    planifie rien avant aujourd'hui, puis RÉGÉNÈRE LA LISTE ;
 *  - `swapMeal(mealId, recipeId)` → PlanActionResult (refusé si le plat n'est pas sûr) ;
 *  - `getAlternatives(mealId, count = 6)` → Recipe[] (sûres, du bon type) ;
 *  - `toggleLock(mealId)`, `setServings(mealId, n)`, `removeMeal(mealId)` ;
 *  - `addMeal({ date, type }, recipeId?)` → PlanActionResult (limite gratuite respectée) ;
 *  - `syncList(weekStart?)` : régénère la liste depuis le planning ;
 *  - `revalidateSafety()` : remplace les plats devenus interdits (appelé
 *    automatiquement quand le profil change) ;
 *  - `setPlan(plan)` (sync / seed), `reset()`.
 * Toute modification du planning régénère la liste de courses de la semaine.
 * Sélecteurs purs : `mealsByDay(plan, today?)` → 7 jours `{ date, label, lunch, dinner, … }`,
 * `findMeal(plans, mealId)`.
 * Hooks : `useWeekPlan(weekStart?)`, `useMealsByDay(weekStart?)`, `useMeal(mealId)`.
 */
import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { MealPlan, MealType, PlannedMeal, Recipe } from '@/core';
import {
  addDays,
  formatDayLabel,
  maxMealsPerWeek,
  removeMeal as removeMealCore,
  setMealLocked,
  setMealServings,
  startOfWeek,
  todayISO,
  weekDates,
  weekdayIndex,
} from '@/core';
import { track } from '@/services/analytics';
import { getMealPlanner, type MealPlanResult } from '@/services/mealPlanner';
import { captureError } from '@/services/monitoring';
import { errorMessage } from '@/services/supabase';
import { flushSync } from '@/services/sync';

import { useListStore } from './listStore';
import { pantryIngredientIds, usePantryStore } from './pantryStore';
import { useProfileStore } from './profileStore';
import { basePersistOptions, registerPersistedStore } from './registry';
import { currentEntitlement } from './subscriptionStore';
import { activeWeek, useWeekStore } from './weekStore';

export type PlanStatus = 'idle' | 'generating' | 'error';

export type PlanActionResult =
  | { ok: true; plan: MealPlan }
  | {
      ok: false;
      reason: 'no_profile' | 'no_plan' | 'unknown_meal' | 'unknown_recipe' | 'unsafe' | 'wrong_type' | 'limit' | 'error';
      message: string;
    };

export interface GenerateOptions {
  /** Conserver les repas verrouillés (défaut : oui). */
  keepLocked?: boolean;
}

export interface PlanState {
  hydrated: boolean;
  plans: Record<string, MealPlan>;
  status: PlanStatus;
  generatingWeekStart: string | null;
  /** Semaines en cours de génération (l'écran lit SA semaine, pas l'état global). */
  generatingWeeks: Record<string, true>;
  error: string | null;
  lastDurationMs: number | null;
  lastSource: MealPlanResult['source'] | null;
  recentRecipeIds: string[];
  generationCount: Record<string, number>;
  generate(weekStart?: string, opts?: GenerateOptions): Promise<PlanActionResult>;
  swapMeal(mealId: string, recipeId: string): PlanActionResult;
  getAlternatives(mealId: string, count?: number): Recipe[];
  toggleLock(mealId: string): void;
  setServings(mealId: string, servings: number): void;
  removeMeal(mealId: string): void;
  addMeal(slot: { date: string; type: MealType }, recipeId?: string): PlanActionResult;
  syncList(weekStart?: string): void;
  revalidateSafety(): number;
  setPlan(plan: MealPlan): void;
  reset(): void;
}

const RECENT_LIMIT = 40;
const KEEP_WEEKS = 4;

/** Semaine qui contient un repas. */
export function findMeal(plans: Record<string, MealPlan>, mealId: string): { plan: MealPlan; meal: PlannedMeal } | null {
  for (const plan of Object.values(plans)) {
    const meal = plan.meals.find((m) => m.id === mealId);
    if (meal) return { plan, meal };
  }
  return null;
}

export interface DayMeals {
  date: string;
  /** 0 = lundi … 6 = dimanche */
  weekday: number;
  /** « lundi 9 novembre » */
  label: string;
  /** « Lundi » */
  weekdayLabel: string;
  isToday: boolean;
  isPast: boolean;
  lunch: PlannedMeal | null;
  dinner: PlannedMeal | null;
  meals: PlannedMeal[];
}

/** Les 7 jours de la semaine avec leurs repas (déjeuner puis dîner). */
export function mealsByDay(plan: MealPlan | null | undefined, weekStart?: string, today: string = todayISO()): DayMeals[] {
  const ws = plan?.weekStart ?? weekStart ?? startOfWeek(today);
  return weekDates(ws).map((date) => {
    const meals = (plan?.meals ?? []).filter((m) => m.date === date);
    return {
      date,
      weekday: weekdayIndex(date),
      label: formatDayLabel(date, 'long'),
      weekdayLabel: formatDayLabel(date, 'weekday'),
      isToday: date === today,
      isPast: date < today,
      lunch: meals.find((m) => m.type === 'dejeuner') ?? null,
      dinner: meals.find((m) => m.type === 'diner') ?? null,
      meals: meals.sort((a, b) => (a.type === b.type ? 0 : a.type === 'dejeuner' ? -1 : 1)),
    };
  });
}

const inFlight = new Map<string, Promise<PlanActionResult>>();

export const usePlanStore = create<PlanState>()(
  persist(
    (set, get) => {
      /** Enregistre un planning et régénère sa liste de courses. */
      const commit = (plan: MealPlan) => {
        const current = useWeekStore.getState().currentWeekStart;
        const oldest = addDays(current, -7 * KEEP_WEEKS);
        const plans: Record<string, MealPlan> = {};
        for (const [ws, p] of Object.entries(get().plans)) if (ws >= oldest) plans[ws] = p;
        plans[plan.weekStart] = plan;
        set({ plans });
        try {
          useListStore.getState().regenerateFromPlan(plan);
        } catch (err) {
          captureError(err, { where: 'regenerateFromPlan' });
        }
      };

      const withMeal = (mealId: string, fn: (plan: MealPlan, meal: PlannedMeal) => MealPlan | null) => {
        const found = findMeal(get().plans, mealId);
        if (!found) return;
        const next = fn(found.plan, found.meal);
        if (next && next !== found.plan) commit(next);
      };

      /** Fin de la génération de `ws` : les autres semaines en cours restent signalées. */
      const finishGenerating = (ws: string) => {
        const generatingWeeks = { ...get().generatingWeeks };
        delete generatingWeeks[ws];
        const others = Object.keys(generatingWeeks);
        return { generatingWeeks, generatingWeekStart: others[0] ?? null, stillGenerating: others.length > 0 };
      };

      const recentContext = () => ({
        recentRecipeIds: get().recentRecipeIds,
        pantryIngredientIds: pantryIngredientIds(usePantryStore.getState().items),
      });

      return {
        hydrated: false,
        plans: {},
        status: 'idle',
        generatingWeekStart: null,
        generatingWeeks: {},
        error: null,
        lastDurationMs: null,
        lastSource: null,
        recentRecipeIds: [],
        generationCount: {},

        generate(weekStart, opts = {}) {
          const ws = startOfWeek(weekStart ?? activeWeek());
          const existingRun = inFlight.get(ws);
          if (existingRun) return existingRun;
          const run = (async (): Promise<PlanActionResult> => {
            const profile = useProfileStore.getState().profile;
            if (!profile) {
              return { ok: false, reason: 'no_profile', message: 'Crée d’abord ton profil pour recevoir des menus.' };
            }
            set({ status: 'generating', generatingWeekStart: ws, generatingWeeks: { ...get().generatingWeeks, [ws]: true }, error: null });
            try {
              // Le serveur lit le profil en base : on pousse d'abord les changements en attente.
              await flushSync();
              const n = (get().generationCount[ws] ?? 0) + 1;
              const existing = get().plans[ws] ?? null;
              const entitlement = currentEntitlement();
              // Rien n'est planifié sur un jour passé ; les repas déjà passés restent en place
              // (même sans `keepLocked`, qui ne libère que les verrous des jours à venir).
              const today = useWeekStore.getState().today;
              const kept =
                opts.keepLocked === false && existing
                  ? { ...existing, meals: existing.meals.filter((m) => m.date < today) }
                  : existing;
              const result = await getMealPlanner().requestMealPlan({
                profile,
                weekStart: ws,
                entitlement,
                existing: kept,
                ...recentContext(),
                seed: `${profile.id}:${ws}:${n}`,
                fromDate: today,
              });
              const recipeIds = result.plan.meals.map((m) => m.recipeId);
              const { stillGenerating, ...done } = finishGenerating(ws);
              set({
                ...done,
                status: stillGenerating ? 'generating' : 'idle',
                lastDurationMs: result.durationMs,
                lastSource: result.source,
                generationCount: { ...get().generationCount, [ws]: n },
                recentRecipeIds: Array.from(new Set([...recipeIds, ...get().recentRecipeIds])).slice(0, RECENT_LIMIT),
              });
              commit(result.plan);
              track('plan_generated', {
                meals: result.plan.meals.length,
                source: result.source,
                planSource: result.plan.source,
                durationMs: Math.round(result.durationMs),
                entitlement,
                regenerated: n > 1,
                unsafeReplaced: result.replacedUnsafeMeals,
              });
              return { ok: true, plan: result.plan };
            } catch (err) {
              const message = 'On n’a pas réussi à préparer ta semaine. Réessaie dans un instant.';
              const { stillGenerating, ...done } = finishGenerating(ws);
              set({ ...done, status: stillGenerating ? 'generating' : 'error', error: message });
              captureError(err, { where: 'generate', weekStart: ws });
              track('plan_generation_failed', { error: errorMessage(err).slice(0, 120) });
              return { ok: false, reason: 'error', message };
            }
          })().finally(() => {
            inFlight.delete(ws);
          });
          inFlight.set(ws, run);
          return run;
        },

        swapMeal(mealId, recipeId) {
          const profile = useProfileStore.getState().profile;
          if (!profile) return { ok: false, reason: 'no_profile', message: 'Crée d’abord ton profil.' };
          const found = findMeal(get().plans, mealId);
          if (!found) return { ok: false, reason: 'unknown_meal', message: 'Ce repas n’est plus dans ton planning.' };
          const res = getMealPlanner().swapMeal(found.plan, mealId, recipeId, profile);
          if (!res.ok) return res;
          commit(res.plan);
          track('meal_swapped', { from: found.meal.recipeId, to: recipeId, type: found.meal.type });
          return res;
        },

        getAlternatives(mealId, count = 6) {
          const profile = useProfileStore.getState().profile;
          const found = findMeal(get().plans, mealId);
          if (!profile || !found) return [];
          return getMealPlanner().alternativesFor(found.plan, mealId, { profile, ...recentContext(), count });
        },

        toggleLock(mealId) {
          withMeal(mealId, (plan, meal) => {
            track('meal_locked', { locked: !meal.locked });
            return setMealLocked(plan, mealId, !meal.locked);
          });
        },

        setServings(mealId, servings) {
          withMeal(mealId, (plan, meal) => {
            const next = setMealServings(plan, mealId, Math.min(20, servings));
            return next.meals.find((m) => m.id === mealId)?.servings === meal.servings ? null : next;
          });
        },

        removeMeal(mealId) {
          withMeal(mealId, (plan, meal) => {
            track('meal_removed', { type: meal.type });
            return removeMealCore(plan, mealId);
          });
        },

        addMeal(slot, recipeId) {
          const profile = useProfileStore.getState().profile;
          if (!profile) return { ok: false, reason: 'no_profile', message: 'Crée d’abord ton profil.' };
          const ws = startOfWeek(slot.date);
          const plan: MealPlan = get().plans[ws] ?? {
            id: `plan_${ws}`,
            weekStart: ws,
            meals: [],
            generatedAt: new Date().toISOString(),
            source: 'rules',
          };
          const max = maxMealsPerWeek(currentEntitlement());
          if (plan.meals.length >= max) {
            return {
              ok: false,
              reason: 'limit',
              message: `Avec l’offre gratuite, tu peux planifier ${max} repas par semaine. Passe à Premium pour tout planifier.`,
            };
          }
          const res = getMealPlanner().addMealToPlan(plan, slot, profile, recipeId);
          if (!res.ok) return { ok: false, reason: res.reason, message: res.message };
          commit(res.plan);
          track('meal_added', { type: slot.type, chosen: !!recipeId });
          return res;
        },

        syncList(weekStart) {
          const ws = weekStart ?? activeWeek();
          const plan = get().plans[ws];
          if (plan) useListStore.getState().regenerateFromPlan(plan);
        },

        revalidateSafety() {
          const profile = useProfileStore.getState().profile;
          if (!profile) return 0;
          let replaced = 0;
          for (const plan of Object.values(get().plans)) {
            const res = getMealPlanner().enforcePlanSafety(plan, profile, recentContext());
            if (res.replaced > 0) {
              replaced += res.replaced;
              commit(res.plan);
            }
          }
          return replaced;
        },

        setPlan(plan) {
          // Planning venu d'ailleurs (serveur, seed) : revérifié avec le profil local.
          const profile = useProfileStore.getState().profile;
          commit(profile ? getMealPlanner().enforcePlanSafety(plan, profile, recentContext()).plan : plan);
        },

        reset() {
          inFlight.clear();
          set({
            plans: {},
            status: 'idle',
            generatingWeekStart: null,
            generatingWeeks: {},
            error: null,
            lastDurationMs: null,
            lastSource: null,
            recentRecipeIds: [],
            generationCount: {},
          });
        },
      };
    },
    {
      ...basePersistOptions<Partial<PlanState>>('plan'),
      partialize: (s) => ({
        plans: s.plans,
        lastDurationMs: s.lastDurationMs,
        lastSource: s.lastSource,
        recentRecipeIds: s.recentRecipeIds,
        generationCount: s.generationCount,
      }),
    },
  ),
);

registerPersistedStore('plan', usePlanStore);

// ─── Réactions automatiques ──────────────────────────────────────────────────

const ready = () =>
  usePlanStore.getState().hydrated && useProfileStore.getState().hydrated && useListStore.getState().hydrated;

// Allergies / régimes / ustensiles modifiés : aucun plat interdit ne doit subsister.
useProfileStore.subscribe((s, prev) => {
  if (!ready() || !s.profile || s.profile === prev.profile) return;
  const a = s.profile;
  const b = prev.profile;
  if (
    b &&
    a.allergens.join() === b.allergens.join() &&
    a.diets.join() === b.diets.join() &&
    a.dislikedIngredientIds.join() === b.dislikedIngredientIds.join()
  ) {
    return;
  }
  usePlanStore.getState().revalidateSafety();
});

// Placard modifié : la liste déduit ce qu'on a déjà (semaine en cours et suivante).
usePantryStore.subscribe((s, prev) => {
  if (!ready() || !usePantryStore.getState().hydrated || s.items === prev.items) return;
  const { currentWeekStart } = useWeekStore.getState();
  const plans = usePlanStore.getState().plans;
  for (const ws of [currentWeekStart, addDays(currentWeekStart, 7)]) {
    const plan = plans[ws];
    if (plan) useListStore.getState().regenerateFromPlan(plan);
  }
});

// ─── Hooks ───────────────────────────────────────────────────────────────────

/** Planning d'une semaine (défaut : semaine active), ou null. */
export function useWeekPlan(weekStart?: string): MealPlan | null {
  const active = useWeekStore((s) => s.activeWeekStart);
  const ws = weekStart ?? active;
  return usePlanStore((s) => s.plans[ws] ?? null);
}

/** Les 7 jours de la semaine avec leurs repas (mémoïsé). */
export function useMealsByDay(weekStart?: string): DayMeals[] {
  const active = useWeekStore((s) => s.activeWeekStart);
  const today = useWeekStore((s) => s.today);
  const ws = weekStart ?? active;
  const plan = usePlanStore((s) => s.plans[ws] ?? null);
  return useMemo(() => mealsByDay(plan, ws, today), [plan, ws, today]);
}

/** Un repas et sa semaine (null si introuvable). */
export function useMeal(mealId: string | undefined): { plan: MealPlan; meal: PlannedMeal } | null {
  const plans = usePlanStore((s) => s.plans);
  return useMemo(() => (mealId ? findMeal(plans, mealId) : null), [plans, mealId]);
}

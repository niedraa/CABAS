/**
 * Étape 7 — Récapitulatif puis génération du planning :
 * « Créer mon planning » → completeOnboarding() → planStore.generate(), avec
 * un plein écran immersif (panier qui se remplit, messages qui défilent),
 * la durée réelle mesurée, puis célébration et entrée dans l'app.
 *
 * Semaine planifiée : la semaine en cours si le moteur peut y placer assez de
 * repas sans toucher un jour passé, sinon la suivante (`firstPlanWeekStart`).
 */
import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Sparkles } from 'lucide-react-native';

import {
  clearResumeStep,
  firstPlanWeekStart,
  ONBOARDING_STEPS,
  OnboardingStep,
  PlanGenerationView,
  ProfileSummary,
  stepForIssue,
  stepIndex,
  useOnboardingChrome,
  useStepFlow,
  type GenerationPhase,
  type OnboardingStepId,
} from '@/components/feature/onboarding';
import { normalizeCookTimes } from '@/components/feature/profile';
import { InfoBanner, Stack } from '@/components/ui';
import { formatDayLabel, FREE_TIER, maxMealsPerWeek } from '@/core';
import { useEntitlement } from '@/hooks';
import { haptics } from '@/lib/haptics';
import { useCatalog } from '@/services/catalog';
import { currentEntitlement, usePlanStore, useProfileStore, useWeekStore, validateProfile } from '@/stores';

/** Durée minimale de l'animation : le temps de lire un ou deux messages. */
const MIN_ANIMATION_MS = 2600;
/** Temps de célébration avant l'entrée automatique dans l'app. */
const CELEBRATION_MS = 2400;

type Phase = 'review' | GenerationPhase;

export default function Recap() {
  const flow = useStepFlow('recap');
  const catalog = useCatalog();
  const entitlement = useEntitlement();
  const { setHeaderHidden } = useOnboardingChrome();
  const [phase, setPhase] = useState<Phase>('review');
  // Après une tentative refusée, les problèmes sont recalculés sur le brouillon
  // courant : le bandeau disparaît dès que l'étape est corrigée.
  const [attempted, setAttempted] = useState(false);
  const issues = attempted ? validateProfile(flow.draft) : [];
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [mealsCount, setMealsCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
      setHeaderHidden(false);
    };
  }, [setHeaderHidden]);

  useEffect(() => {
    setHeaderHidden(phase !== 'review');
  }, [phase, setHeaderHidden]);

  const enterApp = () => {
    if (timer.current) clearTimeout(timer.current);
    router.replace('/(tabs)');
  };

  const generate = async () => {
    setPhase('generating');
    setError(null);
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const started = now();
    // Jamais de repas déjà passé : semaine en cours ou suivante selon le jour.
    useWeekStore.getState().refreshToday();
    const { today, currentWeekStart } = useWeekStore.getState();
    const profile = useProfileStore.getState().profile;
    // Même offre que celle appliquée par planStore.generate.
    const ws = profile ? firstPlanWeekStart(profile, maxMealsPerWeek(currentEntitlement()), today) : currentWeekStart;
    useWeekStore.getState().setActiveWeek(ws);
    const res = await usePlanStore.getState().generate(ws);
    // Durée vécue : génération + liste de courses (pas seulement le moteur).
    const elapsed = now() - started;
    // On laisse l'animation respirer, mais on affiche la VRAIE durée.
    await new Promise((r) => setTimeout(r, Math.max(0, MIN_ANIMATION_MS - elapsed)));
    if (!alive.current) return;
    if (!res.ok) {
      haptics.error();
      setError(res.message);
      setPhase('error');
      return;
    }
    setDurationMs(Math.max(elapsed, usePlanStore.getState().lastDurationMs ?? 0));
    setMealsCount(res.plan.meals.length);
    const first = res.plan.meals[0]?.date;
    setStartsOn(ws !== currentWeekStart && first ? formatDayLabel(first, 'long') : null);
    setPhase('done');
    timer.current = setTimeout(() => alive.current && enterApp(), CELEBRATION_MS);
  };

  const create = () => {
    const store = useProfileStore.getState();
    // Déjà validé (retour arrière après une génération échouée) : on régénère seulement.
    if (!store.onboardingCompleted) {
      // Temps de cuisine ramenés sur les choix affichés au récap (« 60+ min » = 120).
      const cook = normalizeCookTimes(flow.draft);
      if (cook !== flow.draft) {
        store.updateDraft({ maxCookTimeWeekdayMin: cook.maxCookTimeWeekdayMin, maxCookTimeWeekendMin: cook.maxCookTimeWeekendMin });
      }
      const result = store.completeOnboarding();
      if (!result.ok) {
        haptics.error();
        setAttempted(true);
        return;
      }
    }
    setAttempted(false);
    void clearResumeStep();
    void generate();
  };

  const edit = (step: OnboardingStepId) => {
    router.push(`${ONBOARDING_STEPS[stepIndex(step)].path}?edit=1`);
  };

  const requested = flow.draft.mealSlots.length;
  const limited = entitlement === 'free' && requested > FREE_TIER.maxMealsPerWeek ? FREE_TIER.maxMealsPerWeek : null;

  return (
    <>
      <OnboardingStep
        title="Tout est prêt"
        subtitle="Vérifie ton profil, puis Cabas compose ta semaine."
        cta={{ label: 'Créer mon planning', icon: Sparkles, onPress: create, loading: phase === 'generating' }}
        testID="onboarding-recap"
      >
        <Stack gap="lg">
          {issues.length > 0 ? (
            <InfoBanner
              tone="danger"
              title="Il manque une petite chose"
              message={issues.map((i) => i.message).join(' ')}
              action={{ label: 'Corriger', onPress: () => edit(stepForIssue(issues[0])) }}
            />
          ) : null}
          <ProfileSummary draft={flow.draft} stores={catalog.stores} onEdit={edit} />
          {limited ? (
            <InfoBanner
              tone="tip"
              title={`${limited} repas planifiés en gratuit`}
              message={`Tu as choisi ${requested} repas : Premium les planifie tous, avec 7 jours d’essai offerts.`}
            />
          ) : null}
        </Stack>
      </OnboardingStep>

      {phase !== 'review' ? (
        <PlanGenerationView
          phase={phase}
          mealsCount={mealsCount}
          durationMs={durationMs}
          limitedTo={limited}
          startsOn={startsOn}
          errorMessage={error}
          onRetry={() => void generate()}
          onSkip={enterApp}
          onContinue={enterApp}
        />
      ) : null}
    </>
  );
}

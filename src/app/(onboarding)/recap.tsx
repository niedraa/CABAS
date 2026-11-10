/**
 * Étape 7 — Récapitulatif puis génération du planning :
 * « Créer mon planning » → completeOnboarding() → planStore.generate(), avec
 * un plein écran immersif (panier qui se remplit, messages qui défilent),
 * la durée réelle mesurée, puis célébration et entrée dans l'app.
 */
import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Sparkles } from 'lucide-react-native';

import {
  clearResumeStep,
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
import { InfoBanner, Stack } from '@/components/ui';
import { FREE_TIER } from '@/core';
import { useEntitlement } from '@/hooks';
import { haptics } from '@/lib/haptics';
import { useCatalog } from '@/services/catalog';
import { usePlanStore, useProfileStore, type ProfileIssue } from '@/stores';

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
  const [issues, setIssues] = useState<ProfileIssue[]>([]);
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
    const res = await usePlanStore.getState().generate();
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
    setPhase('done');
    timer.current = setTimeout(() => alive.current && enterApp(), CELEBRATION_MS);
  };

  const create = () => {
    const store = useProfileStore.getState();
    // Déjà validé (retour arrière après une génération échouée) : on régénère seulement.
    if (!store.onboardingCompleted) {
      const result = store.completeOnboarding();
      if (!result.ok) {
        haptics.error();
        setIssues(result.issues);
        return;
      }
    }
    setIssues([]);
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
          errorMessage={error}
          onRetry={() => void generate()}
          onSkip={enterApp}
          onContinue={enterApp}
        />
      ) : null}
    </>
  );
}

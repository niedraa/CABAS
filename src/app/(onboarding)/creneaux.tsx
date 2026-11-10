/** Étape 6 — Repas à planifier chaque semaine (midi / soir × 7 jours). */
import { OnboardingStep, useStepFlow } from '@/components/feature/onboarding';
import { MealSlotsSection } from '@/components/feature/profile';
import { FREE_TIER } from '@/core';
import { useEntitlement } from '@/hooks';

export default function Creneaux() {
  const flow = useStepFlow('creneaux');
  const entitlement = useEntitlement();
  return (
    <OnboardingStep
      title="Tes repas"
      subtitle="Quels repas Cabas prépare-t-il pour toi chaque semaine ?"
      cta={{ label: flow.ctaLabel, icon: flow.ctaIcon, onPress: flow.next, disabled: !flow.gate.ok }}
      footerHint={flow.gate.ok ? null : flow.gate.reason}
      testID="onboarding-creneaux"
    >
      <MealSlotsSection
        value={flow.draft.mealSlots}
        onChange={(mealSlots) => flow.update({ mealSlots })}
        freeLimit={entitlement === 'premium' ? null : FREE_TIER.maxMealsPerWeek}
      />
    </OnboardingStep>
  );
}

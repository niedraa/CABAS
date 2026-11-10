/** Étape 4 — Ustensiles et cuisines préférées. */
import { OnboardingStep, useStepFlow } from '@/components/feature/onboarding';
import { EquipmentCuisineSection } from '@/components/feature/profile';

export default function Cuisine() {
  const flow = useStepFlow('cuisine');
  const { equipment, favoriteCuisines } = flow.draft;
  return (
    <OnboardingStep
      title="Ta cuisine"
      subtitle="Avec quoi tu cuisines, et ce qui te fait envie."
      cta={{ label: flow.ctaLabel, icon: flow.ctaIcon, onPress: flow.next, disabled: !flow.gate.ok }}
      testID="onboarding-cuisine"
    >
      <EquipmentCuisineSection value={{ equipment, favoriteCuisines }} onChange={(v) => flow.update(v)} />
    </OnboardingStep>
  );
}

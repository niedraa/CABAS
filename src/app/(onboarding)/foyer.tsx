/** Étape 1 — Le foyer : adultes / enfants, portions calculées en direct. */
import { OnboardingStep, useStepFlow } from '@/components/feature/onboarding';
import { HouseholdSection } from '@/components/feature/profile';

export default function Foyer() {
  const flow = useStepFlow('foyer');
  return (
    <OnboardingStep
      title="Qui passe à table ?"
      subtitle="Cabas ajuste les portions et les quantités à ton foyer."
      cta={{ label: flow.ctaLabel, icon: flow.ctaIcon, onPress: flow.next, disabled: !flow.gate.ok }}
      footerHint={flow.gate.ok ? null : flow.gate.reason}
      testID="onboarding-foyer"
    >
      <HouseholdSection value={flow.draft.household} onChange={(household) => flow.update({ household })} testID="household" />
    </OnboardingStep>
  );
}

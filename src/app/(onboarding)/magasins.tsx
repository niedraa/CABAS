/** Étape 5 — Enseignes préférées (1 à 5) : la base du comparateur de prix. */
import { OnboardingStep, useStepFlow } from '@/components/feature/onboarding';
import { StoresSection } from '@/components/feature/profile';
import { useCatalog } from '@/services/catalog';

export default function Magasins() {
  const flow = useStepFlow('magasins');
  const catalog = useCatalog();
  return (
    <OnboardingStep
      title="Tes magasins"
      subtitle="Où fais-tu tes courses ? Choisis jusqu’à 5 enseignes."
      cta={{ label: flow.ctaLabel, icon: flow.ctaIcon, onPress: flow.next, disabled: !flow.gate.ok }}
      footerHint={flow.gate.ok ? null : flow.gate.reason}
      testID="onboarding-magasins"
    >
      <StoresSection
        value={flow.draft.preferredStoreIds}
        onChange={(preferredStoreIds) => flow.update({ preferredStoreIds })}
        stores={catalog.stores}
      />
    </OnboardingStep>
  );
}

/**
 * Étape 2 — Régimes & allergies (+ ingrédients exclus). Données de santé :
 * consentement RGPD explicite exigé avant de continuer.
 */
import { useRef } from 'react';
import type { ScrollViewInstance } from 'react-native';

import { OnboardingStep, useStepFlow } from '@/components/feature/onboarding';
import { DietAllergySection } from '@/components/feature/profile';
import { useCatalog } from '@/services/catalog';

export default function Regime() {
  const flow = useStepFlow('regime');
  const catalog = useCatalog();
  const scroll = useRef<ScrollViewInstance>(null);
  const { diets, allergens, dislikedIngredientIds, healthDataConsentAt } = flow.draft;
  return (
    <OnboardingStep
      title="Tes goûts & ta santé"
      subtitle="Régimes, allergies, aliments que tu n’aimes pas : on s’adapte."
      cta={{
        label: flow.ctaLabel,
        icon: flow.ctaIcon,
        onPress: flow.next,
        disabled: !flow.gate.ok,
        accessibilityHint: flow.gate.ok ? undefined : flow.gate.reason,
      }}
      footerHint={flow.gate.ok ? (diets.length + allergens.length === 0 ? 'Rien à signaler ? Continue simplement.' : null) : flow.gate.reason}
      footerHintTone={flow.gate.ok ? 'neutral' : 'warning'}
      scrollRef={scroll}
      testID="onboarding-regime"
    >
      <DietAllergySection
        value={{ diets, allergens, dislikedIngredientIds, healthDataConsentAt }}
        onChange={(v) => flow.update(v)}
        ingredients={catalog.ingredients}
        onSearchResults={() => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60)}
      />
    </OnboardingStep>
  );
}

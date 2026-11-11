/**
 * Étape 2 — Régimes & allergies (+ ingrédients exclus). Données de santé :
 * consentement RGPD explicite exigé avant de continuer.
 */
import { useEffect, useRef } from 'react';
import { Keyboard, type EmitterSubscription, type ScrollViewInstance } from 'react-native';

import { OnboardingStep, useStepFlow } from '@/components/feature/onboarding';
import { DietAllergySection } from '@/components/feature/profile';
import { useCatalog } from '@/services/catalog';

export default function Regime() {
  const flow = useStepFlow('regime');
  const catalog = useCatalog();
  const scroll = useRef<ScrollViewInstance>(null);
  const keyboardShown = useRef<EmitterSubscription | null>(null);
  const { diets, allergens, dislikedIngredientIds, healthDataConsentAt } = flow.draft;

  useEffect(() => () => keyboardShown.current?.remove(), []);

  const scrollToEnd = () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);

  // Le champ « Je n'aime pas » est tout en bas de l'étape. Sur iOS, le clavier
  // réduit la zone défilante (KeyboardAvoidingView) sans la faire défiler : une
  // fois le clavier affiché, on ramène le bas du contenu au-dessus du pied de page.
  const onSearchFocus = () => {
    keyboardShown.current?.remove();
    keyboardShown.current = null;
    if (Keyboard.isVisible()) {
      scrollToEnd();
      return;
    }
    keyboardShown.current = Keyboard.addListener('keyboardDidShow', () => {
      keyboardShown.current?.remove();
      keyboardShown.current = null;
      scrollToEnd();
    });
  };

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
        onSearchResults={scrollToEnd}
        onSearchFocus={onSearchFocus}
      />
    </OnboardingStep>
  );
}

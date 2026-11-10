/** Étape 3 — Budget hebdo (curseur aimanté) et temps de cuisine. */
import { OnboardingStep, useStepFlow } from '@/components/feature/onboarding';
import { BudgetTimeSection } from '@/components/feature/profile';

export default function BudgetTemps() {
  const flow = useStepFlow('budget-temps');
  const { weeklyBudgetCents, maxCookTimeWeekdayMin, maxCookTimeWeekendMin, household } = flow.draft;
  return (
    <OnboardingStep
      title="Budget & temps"
      subtitle="Combien tu veux dépenser, et combien de temps tu as pour cuisiner."
      cta={{ label: flow.ctaLabel, icon: flow.ctaIcon, onPress: flow.next, disabled: !flow.gate.ok }}
      testID="onboarding-budget-temps"
    >
      <BudgetTimeSection
        value={{ weeklyBudgetCents, maxCookTimeWeekdayMin, maxCookTimeWeekendMin }}
        onChange={(v) => flow.update(v)}
        household={household}
      />
    </OnboardingStep>
  );
}

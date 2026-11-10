/**
 * Onboarding : briques des écrans `src/app/(onboarding)/*`.
 * Les sections de formulaire elles-mêmes vivent dans `../profile`.
 */
export { OnboardingStep, useStepFlow, type OnboardingStepProps, type StepFlow } from './OnboardingStep';
export {
  OnboardingHeader,
  OnboardingChromeProvider,
  useOnboardingChrome,
  useOnboardingTopInset,
  ONBOARDING_HEADER_HEIGHT,
  type OnboardingHeaderProps,
} from './OnboardingHeader';
export { BasketFilling, type BasketFillingProps } from './BasketFilling';
export { PlanGenerationView, type GenerationPhase, type PlanGenerationViewProps } from './PlanGenerationView';
export { ProfileSummary, type ProfileSummaryProps } from './ProfileSummary';
export { saveResumeStep, readResumeStep, clearResumeStep } from './resume';
export { rootScreenOptionsFor, entryHref, type RootScreenOptions } from './navigation';
export * from './steps';

/**
 * Reprise de l'onboarding : dernière étape atteinte (le brouillon lui-même est
 * persisté par `profileStore.draft`). Clé `cabas/onboarding-step`.
 */
import { readJSON, removeKey, storageKey, writeJSON } from '@/lib/storage';

import { ONBOARDING_STEPS, type OnboardingStepId } from './steps';

const KEY = storageKey('onboarding-step');

export async function saveResumeStep(id: OnboardingStepId): Promise<void> {
  await writeJSON(KEY, id);
}

export async function readResumeStep(): Promise<OnboardingStepId | null> {
  const v = await readJSON<string | null>(KEY, null);
  return ONBOARDING_STEPS.some((s) => s.id === v) ? (v as OnboardingStepId) : null;
}

export async function clearResumeStep(): Promise<void> {
  await removeKey(KEY);
}

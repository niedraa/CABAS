/**
 * Onboarding : Stack d'étapes (glisser pour revenir autorisé) sous un en-tête
 * persistant (retour, « Étape n sur 7 », barre de progression segmentée qui
 * se remplit au ressort entre deux étapes).
 */
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, router, Stack, usePathname } from 'expo-router';

import {
  OnboardingChromeProvider,
  OnboardingHeader,
  ONBOARDING_STEPS,
  previousStepPath,
  stepIndex,
  stepIndexFromPath,
  useOnboardingChrome,
} from '@/components/feature/onboarding';
import { track } from '@/services/analytics';
import { useProfileStore } from '@/stores';
import { useTheme } from '@/theme';

export default function OnboardingLayout() {
  return (
    <OnboardingChromeProvider>
      <OnboardingFrame />
    </OnboardingChromeProvider>
  );
}

function OnboardingFrame() {
  const t = useTheme();
  const pathname = usePathname();
  const index = stepIndexFromPath(pathname);
  const { headerHidden } = useOnboardingChrome();
  const onboarded = useProfileStore((s) => s.onboardingCompleted);

  // Analytique : une étape est « complétée » quand on passe à la suivante.
  const previous = useRef(index);
  useEffect(() => {
    const from = previous.current;
    if (from >= 1 && index > from) {
      track('onboarding_step_completed', { step: ONBOARDING_STEPS[from].id, index: from });
    }
    previous.current = index;
  }, [index]);

  // Profil déjà créé : seules la génération finale (récap) reste accessible.
  if (onboarded && index !== stepIndex('recap')) return <Redirect href="/(tabs)" />;

  const onBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    const step = ONBOARDING_STEPS[index];
    const prev = step ? previousStepPath(step.id) : null;
    router.replace(prev ?? '/bienvenue');
  };

  return (
    <View style={[styles.root, { backgroundColor: t.colors.background }]}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
          contentStyle: { backgroundColor: t.colors.background },
        }}
      >
        <Stack.Screen name="bienvenue" options={{ animation: 'fade' }} />
        <Stack.Screen name="recap" />
      </Stack>
      <OnboardingHeader step={Math.max(0, index)} visible={index >= 1 && !headerHidden} onBack={onBack} />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });

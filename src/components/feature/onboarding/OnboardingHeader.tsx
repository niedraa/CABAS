/**
 * En-tête PERSISTANT de l'onboarding (posé par le layout, au-dessus du Stack) :
 * retour, compteur « Étape 2 sur 7 » et barre de progression segmentée qui se
 * remplit au ressort d'une étape à l'autre. Masqué (glissé vers le haut) sur
 * l'écran de bienvenue et pendant la génération du planning.
 *
 * `OnboardingChromeProvider` permet à un écran de masquer l'en-tête
 * (`useOnboardingChrome().setHeaderHidden(true)`).
 */
import React, { createContext, useContext, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, useReducedMotion, withSpring, withTiming } from 'react-native-reanimated';
import { ChevronLeft } from 'lucide-react-native';

import { IconButton, Text, useSafeInsets } from '@/components/ui';
import { useTheme } from '@/theme';

import { PROGRESS_STEP_COUNT, stepCounterLabel } from './steps';

/** Hauteur de l'en-tête sous la zone sûre (ligne + barre). */
export const ONBOARDING_HEADER_HEIGHT = 64;

interface Chrome {
  headerHidden: boolean;
  setHeaderHidden: (hidden: boolean) => void;
}

const ChromeContext = createContext<Chrome>({ headerHidden: false, setHeaderHidden: () => undefined });

export function OnboardingChromeProvider({ children }: { children: React.ReactNode }) {
  const [headerHidden, setHeaderHidden] = useState(false);
  const value = useMemo(() => ({ headerHidden, setHeaderHidden }), [headerHidden]);
  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>;
}

export function useOnboardingChrome(): Chrome {
  return useContext(ChromeContext);
}

/** Espace à réserver en haut des écrans d'étape (zone sûre + en-tête). */
export function useOnboardingTopInset(): number {
  const insets = useSafeInsets();
  return insets.top + ONBOARDING_HEADER_HEIGHT;
}

export interface OnboardingHeaderProps {
  /** Index d'étape (1 → 7 ; 0 = bienvenue). */
  step: number;
  visible: boolean;
  onBack: () => void;
}

export function OnboardingHeader({ step, visible, onBack }: OnboardingHeaderProps) {
  const t = useTheme();
  const insets = useSafeInsets();
  const reduced = useReducedMotion();
  const shown = useDerivedValue(
    () => (reduced ? (visible ? 1 : 0) : visible ? withSpring(1, t.motion.spring) : withTiming(0, { duration: t.motion.duration.fast })),
    [visible, reduced],
  );
  const style = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: (1 - shown.get()) * -24 }],
  }));

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.root,
        { paddingTop: insets.top, backgroundColor: t.colors.background, height: insets.top + ONBOARDING_HEADER_HEIGHT, zIndex: t.zIndex.sticky },
        style,
      ]}
      testID="onboarding-header"
    >
      <View style={[styles.row, { paddingHorizontal: t.spacing.sm }]}>
        <IconButton icon={ChevronLeft} accessibilityLabel="Étape précédente" onPress={onBack} testID="onboarding-back" />
        <Text variant="subhead" color="textSecondary" tabular accessibilityRole="text" accessibilityLiveRegion="polite" testID="onboarding-counter">
          {stepCounterLabel(step)}
        </Text>
        <View style={styles.spacer} />
      </View>
      <View
        style={[styles.bar, { paddingHorizontal: t.spacing.screen, gap: t.spacing.xs }]}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Progression de ton profil"
        accessibilityValue={{ min: 0, max: PROGRESS_STEP_COUNT, now: Math.max(0, step) }}
      >
        {Array.from({ length: PROGRESS_STEP_COUNT }, (_, i) => (
          <Segment key={i} filled={i < step} current={i === step - 1} />
        ))}
      </View>
    </Animated.View>
  );
}

function Segment({ filled, current }: { filled: boolean; current: boolean }) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const p = useDerivedValue(() => (reduced ? (filled ? 1 : 0) : withSpring(filled ? 1 : 0, t.motion.springIndicator)), [filled, reduced]);
  const fill = useAnimatedStyle(() => ({ width: `${p.get() * 100}%` }));
  return (
    <View style={[styles.segment, { backgroundColor: t.colors.backgroundAlt, borderRadius: t.radius.pill }]}>
      <Animated.View
        style={[styles.segmentFill, { backgroundColor: current ? t.colors.accent : t.colors.primary, borderRadius: t.radius.pill }, fill]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0 },
  row: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spacer: { width: 44 },
  bar: { flexDirection: 'row', height: 6, marginTop: 4 },
  segment: { flex: 1, height: 6, overflow: 'hidden' },
  segmentFill: { height: 6 },
});

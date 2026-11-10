/**
 * Bandeau « la semaine mijote » pendant la génération : illustration,
 * micro-texte qui change au fil des secondes, barre de progression douce.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';

import { CookingPot } from '@/components/brand';
import { ProgressBar, Text } from '@/components/ui';
import { useTheme } from '@/theme';

/** Étapes affichées pendant la génération (≈ 1,4 s chacune). */
export const GENERATING_STEPS = [
  'Je relis tes allergies et tes régimes…',
  'Je choisis des plats de saison…',
  'J’ajuste les portions à ton foyer…',
  'Je vérifie ton budget…',
  'Dernière touche, c’est presque prêt !',
] as const;

export const GENERATING_STEP_MS = 1400;

export function GeneratingBanner({ testID }: { testID?: string }) {
  const t = useTheme();
  const c = t.colors;
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(GENERATING_STEPS.length - 1, s + 1)), GENERATING_STEP_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Préparation de ta semaine. ${GENERATING_STEPS[step]}`}
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, borderRadius: t.radius.xl, padding: t.spacing.lg }]}
    >
      <CookingPot size={64} />
      <View style={styles.flex}>
        <Text variant="headline">Ta semaine mijote…</Text>
        <View style={styles.line}>
          <Animated.View key={step} entering={FadeInDown.duration(t.motion.duration.base)} exiting={FadeOutUp.duration(t.motion.duration.fast)}>
            <Text variant="footnote" color="textSecondary" numberOfLines={1}>
              {GENERATING_STEPS[step]}
            </Text>
          </Animated.View>
        </View>
        <ProgressBar progress={(step + 1) / GENERATING_STEPS.length} tone="accent" height={6} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: StyleSheet.hairlineWidth * 2 },
  flex: { flex: 1, gap: 6 },
  line: { height: 18, overflow: 'hidden' },
});

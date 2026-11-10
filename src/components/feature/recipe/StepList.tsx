/**
 * Étapes de la recette (aperçu de la fiche) : pastille numérotée, texte,
 * minuteur proposé. Toucher une étape ouvre le mode cuisine à cette étape.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Timer } from 'lucide-react-native';

import { Badge, PressableScale, staggerEntering, Text } from '@/components/ui';
import type { RecipeStep } from '@/core';
import { useTheme } from '@/theme';

export interface StepListProps {
  steps: readonly RecipeStep[];
  onOpenStep?: (index: number) => void;
  testID?: string;
}

export function StepList({ steps, onOpenStep, testID }: StepListProps) {
  const t = useTheme();
  const c = t.colors;
  return (
    <View testID={testID} style={{ gap: t.spacing.sm }}>
      {steps.map((s, i) => (
        <Animated.View key={i} entering={staggerEntering(i)}>
          <PressableScale
            onPress={onOpenStep ? () => onOpenStep(i) : undefined}
            disabled={!onOpenStep}
            scaleTo={0.98}
            accessibilityLabel={`Étape ${i + 1} sur ${steps.length} : ${s.text}${s.timerMin ? `. Minuteur de ${s.timerMin} minutes.` : ''}`}
            accessibilityHint={onOpenStep ? 'Ouvre le mode cuisine à cette étape.' : undefined}
            style={[styles.row, { backgroundColor: c.surface, borderRadius: t.radius.lg, borderColor: c.border, padding: t.spacing.md }]}
          >
            <View style={[styles.num, { backgroundColor: c.primarySoft }]}>
              <Text variant="headline" tabular style={{ color: t.scheme === 'dark' ? c.text : c.primary }}>
                {i + 1}
              </Text>
            </View>
            <View style={styles.flex}>
              <Text variant="body">{s.text}</Text>
              {s.timerMin ? <Badge label={`${s.timerMin} min`} icon={Timer} tone="accent" size="sm" style={styles.badge} /> : null}
            </View>
          </PressableScale>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, borderWidth: StyleSheet.hairlineWidth * 2 },
  num: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 8 },
  badge: { marginTop: 2 },
});

/**
 * Ingrédients de la recette à cocher. Quand les portions changent, seules
 * les lignes dont la quantité change « roulent » (entrée au ressort).
 * Les ingrédients porteurs d'un allergène déclaré sont signalés en rouge.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Badge, Checkbox } from '@/components/ui';
import type { Allergen } from '@/core';
import { ALLERGEN_LABELS } from '@/core';
import { useTheme } from '@/theme';

import type { IngredientLine } from './recipeInfo';

export interface IngredientChecklistProps {
  lines: readonly IngredientLine[];
  checked: Readonly<Record<string, boolean>>;
  onToggle: (key: string, checked: boolean) => void;
  /** Allergènes déclarés par le foyer. */
  declaredAllergens?: readonly Allergen[];
  testID?: string;
}

export function IngredientChecklist({ lines, checked, onToggle, declaredAllergens = [], testID }: IngredientChecklistProps) {
  const t = useTheme();
  const c = t.colors;
  const declared = new Set(declaredAllergens);
  return (
    <View testID={testID} style={{ gap: t.spacing.xxs }}>
      {lines.map((l, i) => {
        const conflict = l.allergens.find((a) => declared.has(a));
        const description = [l.note, l.optional ? 'facultatif' : null].filter(Boolean).join(' · ') || undefined;
        return (
          <View key={l.key} style={[styles.row, i > 0 && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <Animated.View key={l.text} entering={FadeInDown.springify().damping(t.motion.springSnappy.damping).stiffness(t.motion.springSnappy.stiffness)} style={styles.flex}>
              <Checkbox
                checked={!!checked[l.key]}
                onChange={(v) => onToggle(l.key, v)}
                label={capitalizeFirst(l.text)}
                description={description}
                strikeWhenChecked
                size={24}
                testID={testID ? `${testID}-${i}` : undefined}
              />
            </Animated.View>
            {conflict ? <Badge label={ALLERGEN_LABELS[conflict]} tone="danger" size="sm" /> : null}
          </View>
        );
      })}
    </View>
  );
}

function capitalizeFirst(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  flex: { flex: 1 },
});

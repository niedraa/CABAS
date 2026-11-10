/**
 * Suggestion « anti-gaspi » : une recette sûre qui écoule des restes du
 * placard. Toucher → fiche recette.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Clock, Leaf } from 'lucide-react-native';

import { Badge, PressableScale, RecipeThumb, Text } from '@/components/ui';
import type { Recipe } from '@/core';
import { recipeTotalTime } from '@/core';
import { boxShadow, useTheme } from '@/theme';

export interface LeftoverCardProps {
  recipe: Recipe;
  /** « Utilise crème fraîche et œufs ». */
  uses: string;
  onPress: () => void;
  width?: number;
  testID?: string;
}

export function LeftoverCard({ recipe, uses, onPress, width = 208, testID }: LeftoverCardProps) {
  const t = useTheme();
  const c = t.colors;
  const minutes = recipeTotalTime(recipe);
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={`${recipe.title}. ${uses}. ${minutes} minutes.`}
      accessibilityHint="Ouvre la recette."
      testID={testID}
      style={[
        styles.card,
        {
          width,
          backgroundColor: c.surface,
          borderColor: c.border,
          borderRadius: t.radius.lg,
          padding: t.spacing.md,
          gap: t.spacing.sm,
          boxShadow: boxShadow('sm', c.shadow),
        },
      ]}
    >
      <View style={styles.top}>
        <RecipeThumb emoji={recipe.emoji} seed={recipe.id} size="md" />
        <Badge size="sm" icon={Clock} label={`${minutes} min`} />
      </View>
      <Text variant="headline" numberOfLines={2} style={{ minHeight: t.typography.headline.lineHeight * 2 }}>
        {recipe.title}
      </Text>
      <View style={[styles.uses, { gap: t.spacing.xs }]}>
        <Leaf size={t.iconSize.xs} color={c.success} strokeWidth={2.4} style={styles.leaf} />
        <Text variant="footnote" color="textSecondary" numberOfLines={2} style={[styles.flex, { minHeight: t.typography.footnote.lineHeight * 2 }]}>
          {uses}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth * 2 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  uses: { flexDirection: 'row', alignItems: 'flex-start' },
  leaf: { marginTop: 2 },
  flex: { flex: 1 },
});

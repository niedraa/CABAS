/**
 * Une alternative proposée pour remplacer un plat : vignette, titre, temps,
 * étiquettes, et « Pourquoi » (raisons courtes, dont la garantie allergènes).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ChevronRight, Clock, ShieldCheck } from 'lucide-react-native';

import { Badge, PressableScale, RecipeThumb, Text } from '@/components/ui';
import type { Recipe, UserProfile } from '@/core';
import { ALLERGEN_LABELS, CUISINE_LABELS, lowerFirst, recipeTotalTime } from '@/core';
import { useTheme } from '@/theme';

export interface AlternativeReasons {
  /** Raisons courtes (« Rapide », « Petit budget », « Cuisine italienne, ta préférée »). */
  why: string[];
  /** « Sans arachides » : garanti par le filtre d'allergènes. */
  safety: string | null;
}

/** Raisons affichées sous une alternative (fonction pure). */
export function alternativeReasons(
  recipe: Recipe,
  profile: Pick<UserProfile, 'favoriteCuisines' | 'allergens' | 'maxCookTimeWeekdayMin'> | null,
  current?: Recipe | null,
): AlternativeReasons {
  const why: string[] = [];
  const total = recipeTotalTime(recipe);
  if (profile?.favoriteCuisines?.includes(recipe.cuisine)) why.push(`Cuisine ${lowerFirst(CUISINE_LABELS[recipe.cuisine])}, ta préférée`);
  if (current && total < recipeTotalTime(current) - 5) why.push(`Plus rapide (−${recipeTotalTime(current) - total} min)`);
  else if (total <= 25) why.push('Rapide');
  if (recipe.costLevel === 1) why.push('Petit budget');
  else if (current && recipe.costLevel < current.costLevel) why.push('Moins cher');
  if (why.length === 0) why.push(recipe.difficulty === 1 ? 'Facile à réaliser' : 'Pour varier');
  const allergens = profile?.allergens ?? [];
  const safety =
    allergens.length > 0
      ? `Sans ${allergens
          .slice(0, 2)
          .map((a) => lowerFirst(ALLERGEN_LABELS[a]))
          .join(', ')}${allergens.length > 2 ? '…' : ''}`
      : null;
  return { why: why.slice(0, 2), safety };
}

export interface AlternativeRowProps {
  recipe: Recipe;
  reasons: AlternativeReasons;
  onPress: () => void;
  testID?: string;
}

export function AlternativeRow({ recipe, reasons, onPress, testID }: AlternativeRowProps) {
  const t = useTheme();
  const c = t.colors;
  const total = recipeTotalTime(recipe);
  return (
    <PressableScale
      onPress={onPress}
      haptic="none"
      scaleTo={0.98}
      accessibilityLabel={`${recipe.title}, ${total} minutes. ${reasons.why.join('. ')}${reasons.safety ? `. ${reasons.safety}` : ''}`}
      accessibilityHint="Remplace le plat par celui-ci."
      testID={testID}
      style={[styles.row, { backgroundColor: c.surface, borderColor: c.border, borderRadius: t.radius.lg, padding: t.spacing.md }]}
    >
      <RecipeThumb emoji={recipe.emoji} seed={recipe.id} size="md" />
      <View style={styles.body}>
        <Text variant="headline" numberOfLines={2}>
          {recipe.title}
        </Text>
        <View style={styles.badges}>
          <Badge size="sm" icon={Clock} label={`${total} min`} />
          {reasons.safety ? <Badge size="sm" icon={ShieldCheck} tone="success" label={reasons.safety} /> : null}
        </View>
        <Text variant="footnote" color="info" numberOfLines={2}>
          ✨ {reasons.why.join(' · ')}
        </Text>
      </View>
      <ChevronRight size={t.iconSize.md} color={c.textTertiary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: StyleSheet.hairlineWidth * 2 },
  body: { flex: 1, gap: 5 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});

/**
 * Options d'un repas (appui long ou « … ») : portions, verrou, remplacer,
 * voir la recette, retirer du planning.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BookOpen, Hand, Lock, Shuffle, Trash2 } from 'lucide-react-native';

import { Divider, ListRow, RecipeThumb, Sheet, Stepper, Switch, Text } from '@/components/ui';
import type { PlannedMeal, Recipe } from '@/core';
import { formatDayLabel, MEAL_TYPE_LABELS } from '@/core';
import { useTheme } from '@/theme';

export interface MealOptionsSheetProps {
  visible: boolean;
  meal: PlannedMeal | null;
  recipe: Recipe | null;
  onClose: () => void;
  onServingsChange: (servings: number) => void;
  onToggleLock: () => void;
  onSwap: () => void;
  onOpenRecipe: () => void;
  onRemove: () => void;
}

export function MealOptionsSheet({
  visible,
  meal,
  recipe,
  onClose,
  onServingsChange,
  onToggleLock,
  onSwap,
  onOpenRecipe,
  onRemove,
}: MealOptionsSheetProps) {
  const t = useTheme();
  const c = t.colors;
  return (
    <Sheet
      visible={visible && !!meal && !!recipe}
      onClose={onClose}
      title={recipe?.title}
      subtitle={meal ? `${formatDayLabel(meal.date, 'weekday')} · ${MEAL_TYPE_LABELS[meal.type]}` : undefined}
      testID="meal-options"
    >
      {meal && recipe ? (
        <View style={{ gap: t.spacing.xs }}>
          <View style={[styles.servings, { backgroundColor: c.background, borderRadius: t.radius.lg, padding: t.spacing.md }]}>
            <RecipeThumb emoji={recipe.emoji} seed={recipe.id} size="sm" />
            <View style={styles.flex}>
              <Text variant="headline">Portions</Text>
              <Text variant="footnote" color="textSecondary">
                La liste de courses suit.
              </Text>
            </View>
            <Stepper
              value={meal.servings}
              onChange={onServingsChange}
              min={1}
              max={12}
              size="sm"
              accessibilityLabel="Portions"
              testID="meal-options-servings"
            />
          </View>
          <ListRow
            icon={Lock}
            title="Garder ce plat"
            subtitle="Il reste en place si tu demandes de nouvelles idées."
            right={<Switch value={!!meal.locked} onValueChange={onToggleLock} accessibilityLabel="Garder ce plat" />}
          />
          <Divider inset={52} />
          <ListRow icon={Shuffle} title="Remplacer ce plat" chevron onPress={onSwap} />
          <Divider inset={52} />
          <ListRow icon={BookOpen} title="Voir la recette" chevron onPress={onOpenRecipe} />
          <Divider inset={52} />
          <ListRow icon={Trash2} title="Retirer du planning" destructive onPress={onRemove} />
          <View style={styles.hint}>
            <Hand size={t.iconSize.xs} color={c.textTertiary} />
            <Text variant="footnote" color="textTertiary">
              Astuce : glisse une carte vers la gauche pour la remplacer.
            </Text>
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  servings: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8 },
});

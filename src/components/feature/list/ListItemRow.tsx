/**
 * Ligne d'article de la liste de courses : case à cocher (toucher = cocher),
 * libellé barré une fois coché, quantité et conditionnement, pastille
 * « placard » pour les ingrédients qu'on a souvent, menu « … » d'édition.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { MoreHorizontal } from 'lucide-react-native';

import { Badge, Checkbox, IconButton } from '@/components/ui';
import type { ShoppingListItem } from '@/core';
import { useTheme } from '@/theme';

export interface ListItemRowProps {
  item: ShoppingListItem;
  subtitle: string;
  onToggle: () => void;
  onMore: () => void;
  testID?: string;
}

export function ListItemRow({ item, subtitle, onToggle, onMore, testID }: ListItemRowProps) {
  const t = useTheme();
  return (
    <Animated.View
      entering={FadeIn.duration(t.motion.duration.base)}
      exiting={FadeOut.duration(t.motion.duration.fast)}
      layout={LinearTransition.springify().damping(t.motion.spring.damping)}
      style={[styles.row, { paddingVertical: t.spacing.xs, opacity: item.checked ? 0.72 : 1 }]}
      testID={testID}
    >
      <View style={styles.flex}>
        <Checkbox
          checked={item.checked}
          onChange={onToggle}
          label={item.label}
          description={subtitle || undefined}
          strikeWhenChecked
          accessibilityLabel={`${item.label}${subtitle ? `, ${subtitle}` : ''}`}
          testID={testID ? `${testID}-check` : undefined}
        />
      </View>
      {item.pantryStaple && !item.checked ? <Badge label="Placard ?" tone="info" size="sm" accessibilityLabel="Tu l’as peut-être déjà" /> : null}
      {item.source === 'manual' && !item.checked ? <Badge label="Ajouté" tone="neutral" size="sm" /> : null}
      <IconButton
        icon={MoreHorizontal}
        accessibilityLabel={`Options pour ${item.label}`}
        variant="plain"
        size="sm"
        onPress={onMore}
        testID={testID ? `${testID}-more` : undefined}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flex: { flex: 1 },
});

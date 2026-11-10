/**
 * Un rayon de la liste : pastille de couleur du rayon, nom, avancement
 * (« 2/5 », puis « Fait » quand tout est coché), et ses articles dans une
 * carte. Les lignes glissent à leur nouvelle place au ressort quand on coche.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';

import { Badge, staggerEntering, Text } from '@/components/ui';
import type { Aisle, ShoppingListItem } from '@/core';
import { AISLE_LABELS } from '@/core';
import { aisleColors, boxShadow, useTheme } from '@/theme';

import { sectionProgress } from './listView';

export interface AisleSectionProps {
  aisle: Aisle;
  items: readonly ShoppingListItem[];
  /** Rang de la première ligne (cascade d'entrée continue d'un rayon à l'autre). */
  startIndex?: number;
  renderItem: (item: ShoppingListItem, index: number) => React.ReactNode;
  testID?: string;
}

export function AisleSection({ aisle, items, startIndex = 0, renderItem, testID }: AisleSectionProps) {
  const t = useTheme();
  const c = t.colors;
  const progress = sectionProgress(items);
  const label = AISLE_LABELS[aisle];
  const layout = LinearTransition.springify().damping(t.motion.spring.damping).stiffness(t.motion.spring.stiffness);

  return (
    <Animated.View layout={layout} style={{ gap: t.spacing.sm }} testID={testID}>
      <View
        style={[styles.header, { gap: t.spacing.sm, paddingHorizontal: t.spacing.xs }]}
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${label}, ${progress.complete ? 'tout est coché' : `${progress.done} sur ${progress.total} cochés`}`}
      >
        <View style={[styles.dot, { backgroundColor: aisleColors[aisle] ?? aisleColors.autre, borderRadius: t.radius.pill }]} />
        <Text variant="headline" style={styles.flex} numberOfLines={1}>
          {label}
        </Text>
        {progress.complete ? (
          <Badge label="Fait" tone="success" size="sm" icon={Check} />
        ) : (
          <Text variant="caption" color="textSecondary" tabular>
            {progress.done}/{progress.total}
          </Text>
        )}
      </View>
      {/* Ombre à l'extérieur, découpe (glisser pour retirer) à l'intérieur. */}
      <View style={{ borderRadius: t.radius.lg, boxShadow: boxShadow('sm', c.shadow) }}>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, borderRadius: t.radius.lg }]}>
          {items.map((item, i) => (
            <Animated.View
              key={item.id}
              entering={staggerEntering(startIndex + i)}
              exiting={FadeOut.duration(t.motion.duration.fast)}
              layout={layout}
            >
              {renderItem(item, i)}
            </Animated.View>
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 12, height: 12 },
  flex: { flex: 1 },
  card: { borderWidth: StyleSheet.hairlineWidth * 2, overflow: 'hidden' },
});

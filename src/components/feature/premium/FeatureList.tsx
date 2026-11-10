/**
 * Bénéfices Premium (sur fond forêt) : pastille moutarde + icône, titre et
 * description de `FEATURE_COPY`, en cascade au ressort. La fonctionnalité
 * d'origine est mise en avant ; en mode `unlocked`, chaque ligne porte une
 * coche (« Tu es Premium »).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { CircleCheck } from 'lucide-react-native';

import { Badge, staggerEntering, Text } from '@/components/ui';
import { FEATURE_COPY, type Feature } from '@/core';
import { useTheme, withAlpha } from '@/theme';

import { FEATURE_ICONS } from './featureIcons';

export interface FeatureListProps {
  features: readonly Feature[];
  highlight?: Feature | null;
  /** Coches « débloqué » au lieu de la mise en avant. */
  unlocked?: boolean;
  /** Décalage de la cascade (éléments déjà affichés au-dessus). */
  startIndex?: number;
  testID?: string;
}

export function FeatureList({ features, highlight = null, unlocked = false, startIndex = 0, testID = 'feature-list' }: FeatureListProps) {
  const t = useTheme();
  const c = t.colors;
  return (
    <View style={{ gap: t.spacing.sm }} testID={testID}>
      {features.map((f, i) => {
        const Icon = FEATURE_ICONS[f];
        const copy = FEATURE_COPY[f];
        const isHighlight = !unlocked && f === highlight;
        return (
          <Animated.View
            key={f}
            entering={staggerEntering(startIndex + i)}
            accessible
            accessibilityLabel={`${copy.title}. ${copy.description}${unlocked ? ' Inclus.' : ''}`}
            style={[
              styles.row,
              {
                gap: t.spacing.md,
                padding: t.spacing.md,
                borderRadius: t.radius.lg,
                backgroundColor: withAlpha(c.heroText, isHighlight ? 0.14 : 0.07),
                borderColor: isHighlight ? c.accent : 'transparent',
              },
            ]}
            testID={`${testID}-${f}`}
          >
            <View style={[styles.icon, { backgroundColor: c.accent, borderRadius: t.radius.md }]}>
              <Icon size={t.iconSize.md} color={c.onAccent} strokeWidth={2.2} />
            </View>
            <View style={styles.flex}>
              {isHighlight ? <Badge label="Ce que tu cherchais" tone="accent" size="sm" style={{ marginBottom: t.spacing.xs }} /> : null}
              <Text variant="headline" color="heroText">
                {copy.title}
              </Text>
              <Text variant="footnote" color="heroText" style={styles.muted}>
                {copy.description}
              </Text>
            </View>
            {unlocked ? <CircleCheck size={t.iconSize.lg} color={c.accent} strokeWidth={2.2} /> : null}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 2 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  muted: { opacity: 0.8 },
});

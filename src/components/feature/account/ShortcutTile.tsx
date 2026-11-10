/**
 * Raccourci en tuile (Placard, Budget) : emoji sur pastel, titre, phrase
 * courte, badge facultatif (« Premium »). Deux tuiles côte à côte.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Crown } from 'lucide-react-native';

import { Badge, PressableScale, Text } from '@/components/ui';
import { boxShadow, useTheme } from '@/theme';

export interface ShortcutTileProps {
  emoji: string;
  title: string;
  subtitle: string;
  /** Pastille de fond de l'emoji. */
  tone?: 'primary' | 'accent';
  premium?: boolean;
  onPress: () => void;
  testID?: string;
}

export function ShortcutTile({ emoji, title, subtitle, tone = 'primary', premium, onPress, testID }: ShortcutTileProps) {
  const t = useTheme();
  const c = t.colors;
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}${premium ? '. Premium' : ''}`}
      style={[
        styles.tile,
        {
          backgroundColor: c.surface,
          borderRadius: t.radius.lg,
          padding: t.spacing.lg,
          gap: t.spacing.sm,
          boxShadow: boxShadow('sm', c.shadow),
        },
      ]}
      testID={testID}
    >
      <View style={styles.top}>
        <View style={[styles.emojiBox, { backgroundColor: tone === 'accent' ? c.accentSoft : c.primarySoft, borderRadius: t.radius.md }]}>
          <Text style={styles.emoji} accessibilityElementsHidden importantForAccessibility="no">
            {emoji}
          </Text>
        </View>
        {premium ? <Badge label="Premium" tone="premium" size="sm" icon={Crown} /> : null}
      </View>
      <Text variant="headline">{title}</Text>
      <Text variant="footnote" color="textSecondary" numberOfLines={2}>
        {subtitle}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, minHeight: 132 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 },
  emojiBox: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 22, lineHeight: 28 },
});

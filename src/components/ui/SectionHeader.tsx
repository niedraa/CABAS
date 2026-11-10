/**
 * En-tête de section : titre (style « titre » ou « surtitre »), sous-titre,
 * action textuelle à droite (« Tout voir »).
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  kind?: 'title' | 'overline';
  action?: { label: string; onPress: () => void };
  /** Élément libre à droite (badge, compteur). */
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function SectionHeader({ title, subtitle, kind = 'title', action, right, style }: SectionHeaderProps) {
  const t = useTheme();
  return (
    <View style={[styles.row, style]}>
      <View style={styles.texts}>
        <Text
          variant={kind === 'title' ? 'title3' : 'overline'}
          color={kind === 'title' ? 'text' : 'textSecondary'}
          accessibilityRole="header"
        >
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" color="textSecondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {action ? (
        <PressableScale
          onPress={action.onPress}
          accessibilityLabel={action.label}
          hitSlop={t.layout.hitSlop}
          scaleTo={0.94}
          style={styles.action}
        >
          <Text variant="subhead" style={{ color: t.scheme === 'dark' ? t.colors.primary : t.colors.success, fontFamily: t.typography.headline.fontFamily }}>
            {action.label}
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  texts: { flex: 1, gap: 2 },
  action: { paddingVertical: 4 },
});

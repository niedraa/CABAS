/**
 * Ligne « libellé ……… valeur » façon ticket de caisse (récapitulatifs,
 * détails de panier, frais de retrait).
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { Text, type ThemeColorKey } from './Text';

export interface KeyValueRowProps {
  label: string;
  value: React.ReactNode;
  /** Pointillés entre libellé et valeur (style ticket). */
  leader?: boolean;
  /** Ligne de total (gras, plus grand). */
  emphasis?: boolean;
  valueColor?: ThemeColorKey;
  hint?: string;
  style?: StyleProp<ViewStyle>;
}

export function KeyValueRow({ label, value, leader, emphasis, valueColor = 'text', hint, style }: KeyValueRowProps) {
  const t = useTheme();
  return (
    <View
      style={[styles.row, style]}
      accessible
      accessibilityLabel={typeof value === 'string' ? `${label} : ${value}` : label}
    >
      <View style={styles.labelWrap}>
        <Text variant={emphasis ? 'headline' : 'callout'} color={emphasis ? 'text' : 'textSecondary'} numberOfLines={1}>
          {label}
        </Text>
        {hint ? (
          <Text variant="caption" color="textTertiary">
            {hint}
          </Text>
        ) : null}
      </View>
      {leader ? (
        <Text
          numberOfLines={1}
          ellipsizeMode="clip"
          style={[styles.leader, { color: t.colors.borderStrong }]}
          importantForAccessibility="no"
        >
          {'· '.repeat(80)}
        </Text>
      ) : (
        <View style={styles.flex} />
      )}
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text variant={emphasis ? 'price' : 'bodyMedium'} color={valueColor} tabular>
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  labelWrap: { flexShrink: 1 },
  leader: { flex: 1, overflow: 'hidden', fontSize: 12, letterSpacing: 1 },
  flex: { flex: 1 },
});

/**
 * Séparateur : filet fin, ou pointillés « ticket de caisse ».
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export interface DividerProps {
  /** Retrait à gauche (aligné sur le texte d'une ListRow avec icône : 52). */
  inset?: number;
  variant?: 'solid' | 'dashed';
  /** Libellé centré (« ou »). */
  label?: string;
  spacing?: number;
  style?: StyleProp<ViewStyle>;
}

export function Divider({ inset = 0, variant = 'solid', label, spacing = 0, style }: DividerProps) {
  const t = useTheme();
  const c = t.colors;
  if (label) {
    return (
      <View style={[styles.labelRow, { marginVertical: spacing }, style]}>
        <View style={[styles.line, { backgroundColor: c.border }]} />
        <Text variant="caption" color="textSecondary">
          {label}
        </Text>
        <View style={[styles.line, { backgroundColor: c.border }]} />
      </View>
    );
  }
  if (variant === 'dashed') {
    // Pointillés robustes sur toutes les plateformes : une rangée de tirets.
    return (
      <View
        style={[styles.dashRow, { marginLeft: inset, marginVertical: spacing }, style]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length: 80 }, (_, i) => (
          <View key={i} style={[styles.dash, { backgroundColor: c.borderStrong }]} />
        ))}
      </View>
    );
  }
  return (
    <View
      style={[
        { height: StyleSheet.hairlineWidth * 2, backgroundColor: c.border, marginLeft: inset, marginVertical: spacing },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flex: 1, height: 1 },
  dashRow: { flexDirection: 'row', gap: 4, overflow: 'hidden', height: 2 },
  dash: { width: 6, height: 2, borderRadius: 1 },
});

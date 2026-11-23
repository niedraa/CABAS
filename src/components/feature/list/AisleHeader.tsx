/** En-tête de rayon : pastille couleur du rayon, libellé, compteur « 2/5 ». */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { AISLE_LABELS, type Aisle } from '@/core';
import { aisleColors, useTheme } from '@/theme';

export interface AisleHeaderProps {
  aisle: Aisle;
  done: number;
  total: number;
}

export function AisleHeader({ aisle, done, total }: AisleHeaderProps) {
  const t = useTheme();
  const complete = total > 0 && done === total;
  return (
    <View style={[styles.row, { marginBottom: t.spacing.xs }]} accessibilityRole="header">
      <View style={[styles.dot, { backgroundColor: aisleColors[aisle] ?? aisleColors.autre }]} />
      <Text variant="overline" color="textSecondary" style={styles.flex}>
        {AISLE_LABELS[aisle]}
      </Text>
      <Text variant="caption" color={complete ? 'success' : 'textSecondary'} tabular accessibilityLabel={`${done} sur ${total} articles pris`}>
        {complete ? '✓ ' : ''}
        {done}/{total}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  flex: { flex: 1 },
});

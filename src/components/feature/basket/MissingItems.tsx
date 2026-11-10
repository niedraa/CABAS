/**
 * Articles introuvables, dits honnêtement : absents de toutes les enseignes
 * (« à acheter à part ») ou seulement absents des magasins du panier (avec
 * le meilleur prix ailleurs).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SearchX } from 'lucide-react-native';

import { Text } from '@/components/ui';
import type { Store } from '@/core';
import { formatPrice } from '@/core';
import { useTheme } from '@/theme';

import { plural, storeShortName, type MissingRow } from './basketView';

export interface MissingItemsProps {
  rows: MissingRow[];
  storesById: Record<string, Store>;
  testID?: string;
}

export function missingReason(row: MissingRow, storesById: Record<string, Store>): string {
  if (row.reason === 'nowhere' || !row.elsewhere) return 'Introuvable dans nos enseignes : à acheter à part.';
  return `Pas dans tes magasins. Dispo chez ${storeShortName(storesById[row.elsewhere.storeId])} à ${formatPrice(row.elsewhere.totalCents)}.`;
}

export function MissingItems({ rows, storesById, testID }: MissingItemsProps) {
  const t = useTheme();
  const c = t.colors;
  if (rows.length === 0) return null;
  return (
    <View
      testID={testID}
      style={[
        styles.box,
        { borderColor: c.border, borderRadius: t.radius.lg, padding: t.spacing.lg, gap: t.spacing.md },
      ]}
    >
      <View style={[styles.row, { gap: t.spacing.sm }]}>
        <View style={[styles.icon, { backgroundColor: c.backgroundAlt, borderRadius: t.radius.sm, width: t.controlHeight.sm, height: t.controlHeight.sm }]}>
          <SearchX size={t.iconSize.md} color={c.textSecondary} />
        </View>
        <View style={styles.flex}>
          <Text variant="headline" accessibilityRole="header">
            {plural(rows.length, 'article introuvable', 'articles introuvables')}
          </Text>
          <Text variant="footnote" color="textSecondary">
            {rows.length > 1 ? 'Ils ne sont pas comptés dans le total.' : 'Il n’est pas compté dans le total.'}
          </Text>
        </View>
      </View>
      {rows.map((r) => (
        <View key={r.itemId} style={{ gap: t.spacing.xxs }} accessible accessibilityLabel={`${r.label} : ${missingReason(r, storesById)}`}>
          <Text variant="bodyMedium">{r.label}</Text>
          <Text variant="footnote" color="textSecondary">
            {missingReason(r, storesById)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: StyleSheet.hairlineWidth * 2, borderStyle: 'dashed' },
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  icon: { alignItems: 'center', justifyContent: 'center' },
});

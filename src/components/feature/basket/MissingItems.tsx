/**
 * Articles introuvables, dits honnêtement : absents de toutes les enseignes
 * (« à acheter à part »), écartés pour une allergie déclarée, écartés pour le
 * minimum de commande d'un de tes magasins, ou seulement absents des magasins
 * du panier (avec le meilleur prix ailleurs, « prix estimé » s'il l'est).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SearchX } from 'lucide-react-native';

import { Text } from '@/components/ui';
import type { Store } from '@/core';
import { formatPrice, storeDisplayName } from '@/core';
import { useTheme } from '@/theme';

import { plural, type MissingRow } from './basketView';

export interface MissingItemsProps {
  rows: MissingRow[];
  storesById: Record<string, Store>;
  testID?: string;
}

export function missingReason(row: MissingRow, storesById: Record<string, Store>): string {
  if (row.reason === 'allergen') {
    return 'Les produits que nous connaissons contiennent un de tes allergènes : vérifie l’étiquette d’un autre produit.';
  }
  if (row.reason === 'min_order' && row.minOrder) {
    const store = storeDisplayName(storesById[row.minOrder.storeId], { short: true });
    return `Chez ${store}, mais ta commande y resterait sous son minimum de ${formatPrice(row.minOrder.minOrderCents)}.`;
  }
  if (row.reason === 'nowhere' || !row.elsewhere) return 'Pas de prix connu dans nos enseignes : à acheter à part.';
  // Une estimation est toujours dite (« prix estimé »).
  const estimated = row.elsewhere.estimated ? ' (prix estimé)' : '';
  return `Pas dans tes magasins. Dispo chez ${storeDisplayName(storesById[row.elsewhere.storeId], { short: true })} à ${formatPrice(row.elsewhere.totalCents)}${estimated}.`;
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

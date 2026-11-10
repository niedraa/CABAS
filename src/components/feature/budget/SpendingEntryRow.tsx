/**
 * Ligne de dépense : monogramme de l'enseigne, libellé, jour et origine
 * (commande / ajout manuel), montant, économie éventuelle, bouton supprimer.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { PenLine, ShoppingCart, Trash2 } from 'lucide-react-native';

import { IconButton, StoreBadge, Text } from '@/components/ui';
import { formatPrice, type SpendingEntry, type Store } from '@/core';
import { formatPriceForA11y } from '@/lib/a11y';
import { useTheme } from '@/theme';

import { entryDayLabel, entryTexts } from './budgetView';

export interface SpendingEntryRowProps {
  entry: SpendingEntry;
  storesById: Record<string, Store | undefined>;
  today: string;
  onRemove: () => void;
  testID?: string;
}

export function SpendingEntryRow({ entry, storesById, today, onRemove, testID }: SpendingEntryRowProps) {
  const t = useTheme();
  const { title, day, source, store: storeName } = entryTexts(entry, storesById, today);
  const SourceIcon = entry.source === 'order' ? ShoppingCart : PenLine;
  const store = storesById[entry.storeId];
  return (
    <View style={[styles.row, { gap: t.spacing.md, paddingVertical: t.spacing.md, paddingLeft: t.spacing.lg, paddingRight: t.spacing.xs }]} testID={testID}>
      <View
        style={[styles.row, styles.flex, { gap: t.spacing.md }]}
        accessible
        accessibilityLabel={`${title}${title === storeName ? '' : `, ${storeName}`}, ${entryDayLabel(entry)}, ${source}, ${formatPriceForA11y(entry.totalCents)}${entry.savingsCents > 0 ? `, ${formatPriceForA11y(entry.savingsCents)} économisés` : ''}`}
      >
        <StoreBadge chain={store?.chain ?? entry.storeId} name={store?.name} size="md" />
        <View style={styles.flex}>
          <Text variant="bodyMedium" numberOfLines={2}>
            {title}
          </Text>
          <View style={[styles.row, { gap: t.spacing.xs }]}>
            <SourceIcon size={t.iconSize.xs} color={t.colors.textSecondary} />
            <Text variant="footnote" color="textSecondary" numberOfLines={1} style={styles.flex}>
              {day}
            </Text>
          </View>
        </View>
        <View style={styles.amounts}>
          <Text variant="price" tabular>
            {formatPrice(entry.totalCents)}
          </Text>
          {entry.savingsCents > 0 ? (
            <Text variant="caption" color="savings" tabular>
              {formatPrice(-entry.savingsCents)}
            </Text>
          ) : null}
        </View>
      </View>
      <IconButton
        icon={Trash2}
        size="sm"
        variant="plain"
        color={t.colors.textSecondary}
        accessibilityLabel={`Supprimer la dépense ${title}`}
        onPress={onRemove}
        testID={testID ? `${testID}-remove` : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  amounts: { alignItems: 'flex-end' },
});

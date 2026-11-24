/**
 * Ligne du comparateur : article, meilleure enseigne (monogramme), prix,
 * nombre d'enseignes comparées, économie MDD possible. Toucher = détail.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { Badge, PressableScale, PriceTag, StoreBadge, Text } from '@/components/ui';
import { formatPrice, type ItemComparison, type Store } from '@/core';
import { useTheme } from '@/theme';

export interface ItemPriceRowProps {
  comparison: ItemComparison;
  bestStore?: Store;
  bestStoreName?: string;
  productName?: string;
  /** Prix de la meilleure offre relevé en magasin (sinon estimé). */
  measured?: boolean;
  onPress: () => void;
  testID?: string;
}

export function ItemPriceRow({ comparison: c, bestStore, bestStoreName, productName, measured, onPress, testID }: ItemPriceRowProps) {
  const t = useTheme();
  const best = c.best;
  const spread = c.offers.length > 1 ? c.offers[c.offers.length - 1].totalCents - c.offers[0].totalCents : 0;
  const label = best
    ? `${c.label} : ${formatPrice(best.totalCents)} chez ${bestStoreName ?? ''}, ${c.offers.length} enseignes comparées`
    : `${c.label} : introuvable dans tes enseignes`;
  return (
    <PressableScale
      onPress={onPress}
      haptic="tap"
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Voir le détail des prix"
      style={[styles.row, { paddingVertical: t.spacing.sm, minHeight: t.layout.minTouchTarget }]}
      testID={testID}
    >
      {bestStore ? <StoreBadge chain={bestStore.chain} name={bestStoreName} size="sm" /> : <View style={styles.badgeSpacer} />}
      <View style={styles.flex}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {c.label}
        </Text>
        <Text variant="footnote" color="textSecondary" numberOfLines={1}>
          {best
            ? `${best.packs} × ${productName ?? 'produit'}${best.isStoreBrand ? ' (MDD)' : ''}`
            : 'Introuvable dans tes enseignes'}
        </Text>
        <View style={[styles.badges, { marginTop: 2 }]}>
          {best ? <Badge label={measured ? 'Relevé' : 'Estimé'} tone={measured ? 'success' : 'neutral'} size="sm" /> : null}
          {best?.isPromo ? <Badge label="Promo" tone="danger" size="sm" /> : null}
          {spread > 0 ? <Badge label={`jusqu’à ${formatPrice(spread)} d’écart`} tone="neutral" size="sm" /> : null}
          {c.cheaperAlternative ? <Badge label={`MDD −${formatPrice(c.cheaperAlternative.savingsCents)}`} tone="success" size="sm" /> : null}
        </View>
      </View>
      {best ? <PriceTag cents={best.totalCents} size="sm" best align="right" /> : null}
      <ChevronRight size={t.iconSize.sm} color={t.colors.textTertiary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, gap: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  badgeSpacer: { width: 28 },
});

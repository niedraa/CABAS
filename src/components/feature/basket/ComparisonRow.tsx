/**
 * Une ligne du comparateur : article, meilleure offre mise en avant
 * (`priceBest`, prix au kilo), nombre d'enseignes comparées, promo, MDD
 * moins chère, et le prix payé dans le panier s'il diffère. Toucher la
 * ligne ouvre le détail des prix de l'article.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ChevronRight, Lightbulb, ShoppingBasket } from 'lucide-react-native';

import { Badge, PressableScale, StoreBadge, Text } from '@/components/ui';
import type { Store } from '@/core';
import { formatPrice, formatPricePerUnit } from '@/core';
import { formatPriceForA11y } from '@/lib/a11y';
import { useTheme } from '@/theme';

import { plural, savingsLabel, storeShortName, type ComparisonRowData } from './basketView';

export interface ComparisonRowProps {
  row: ComparisonRowData;
  storesById: Record<string, Store>;
  /** Nombre d'enseignes comparées en tout (le compte n'est rappelé que s'il est inférieur). */
  totalStores?: number;
  onPress: () => void;
  testID?: string;
}

export function ComparisonRow({ row, storesById, totalStores = 0, onPress, testID }: ComparisonRowProps) {
  const t = useTheme();
  const c = t.colors;
  const bestStore = storesById[row.bestStoreId];
  const bestName = storeShortName(bestStore);
  const perUnit = formatPricePerUnit(row.best.pricePerBaseUnitCents, row.best.referenceUnit);
  const basketStore = row.basket ? storesById[row.basket.storeId] : undefined;
  const mdd = row.mdd;
  const mddStore = mdd ? storeShortName(storesById[mdd.storeId]) : '';

  const a11y = [
    row.label,
    `meilleur prix ${formatPriceForA11y(row.best.totalCents)} chez ${bestName}`,
    plural(row.stores, 'enseigne comparée', 'enseignes comparées'),
    row.best.isPromo ? 'en promo' : '',
    row.basket ? `dans ton panier : ${formatPriceForA11y(row.basket.totalCents)} chez ${storeShortName(basketStore)}` : '',
    mdd?.kind === 'chosen' ? `marque distributeur, ${formatPriceForA11y(mdd.savingsCents)} de moins que la marque` : '',
    mdd?.kind === 'available' ? `marque distributeur moins chère chez ${mddStore}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.985}
      dimOnPress
      accessibilityLabel={a11y}
      accessibilityHint="Voir toutes les offres"
      testID={testID}
      style={[styles.row, { gap: t.spacing.md, paddingVertical: t.spacing.md, minHeight: t.layout.minTouchTarget }]}
    >
      <StoreBadge chain={bestStore?.chain ?? row.bestStoreId} name={bestStore?.name} size="sm" />
      <View style={[styles.body, { gap: t.spacing.xxs }]}>
        <View style={[styles.titleRow, { gap: t.spacing.sm }]}>
          <Text variant="bodyMedium" numberOfLines={2} style={styles.flex}>
            {row.label}
          </Text>
          <Text variant="price" color="priceBest" tabular>
            {formatPrice(row.best.totalCents)}
          </Text>
        </View>
        <Text variant="footnote" color="textSecondary" numberOfLines={1} tabular>
          {bestName} · {perUnit}
          {row.stores < totalStores ? ` · ${plural(row.stores, 'enseigne')}` : ''}
        </Text>
        {row.basket ? (
          <View style={[styles.hint, { gap: t.spacing.xs }]}>
            <ShoppingBasket size={t.iconSize.xs} color={c.textSecondary} />
            <Text variant="footnote" color="textSecondary" numberOfLines={1} tabular style={styles.flex}>
              {storeShortName(basketStore)} {formatPrice(row.basket.totalCents)}
              {row.basket.extraCents > 0 ? ` (+${formatPrice(row.basket.extraCents)})` : ''}
            </Text>
          </View>
        ) : null}
        {row.best.isPromo || mdd ? (
          <View style={[styles.badges, { gap: t.spacing.xs, marginTop: t.spacing.xxs }]}>
            {row.best.isPromo ? <Badge label="Promo" tone="accent" size="sm" /> : null}
            {mdd?.kind === 'chosen' ? (
              <Badge label={`MDD ${savingsLabel(mdd.savingsCents)}`} tone="danger" size="sm" accessibilityLabel="Marque distributeur moins chère" />
            ) : null}
            {mdd?.kind === 'available' ? (
              <View style={[styles.hint, { gap: t.spacing.xxs }]}>
                <Lightbulb size={t.iconSize.xs} color={c.accentText} strokeWidth={2.4} />
                <Text variant="caption" color="accentText" numberOfLines={1}>
                  MDD moins chère : {savingsLabel(mdd.savingsCents)}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      <ChevronRight size={t.iconSize.sm} color={c.textTertiary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  flex: { flex: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  hint: { flexDirection: 'row', alignItems: 'center' },
});

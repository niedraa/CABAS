/**
 * « Ton panier dans chaque enseigne » : barres horizontales (moins cher en
 * premier), articles manquants signalés, enseigne choisie mise en avant.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated';

import { StoreBadge, Text } from '@/components/ui';
import { formatPrice, type Store, type StoreTotal } from '@/core';
import { useTheme } from '@/theme';

export interface StoreTotalsChartProps {
  totals: (StoreTotal & { store: Store; name: string })[];
  itemCount: number;
  highlightStoreIds?: string[];
  testID?: string;
}

export function StoreTotalsChart({ totals, itemCount, highlightStoreIds = [], testID }: StoreTotalsChartProps) {
  const t = useTheme();
  const full = totals.filter((x) => x.missingItemIds.length === 0);
  const ranked = [...totals].sort(
    (a, b) => a.missingItemIds.length - b.missingItemIds.length || a.totalCents - b.totalCents,
  );
  const max = Math.max(1, ...ranked.map((x) => x.totalCents));
  const cheapestFull = full.length > 0 ? Math.min(...full.map((x) => x.totalCents)) : null;
  return (
    <View style={{ gap: t.spacing.md }} testID={testID}>
      {ranked.map((x) => (
        <Bar
          key={x.storeId}
          name={x.name}
          store={x.store}
          totalCents={x.totalCents}
          ratio={x.totalCents / max}
          missing={x.missingItemIds.length}
          itemCount={itemCount}
          best={cheapestFull !== null && x.totalCents === cheapestFull && x.missingItemIds.length === 0}
          highlighted={highlightStoreIds.includes(x.storeId)}
        />
      ))}
    </View>
  );
}

function Bar({
  name,
  store,
  totalCents,
  ratio,
  missing,
  itemCount,
  best,
  highlighted,
}: {
  name: string;
  store: Store;
  totalCents: number;
  ratio: number;
  missing: number;
  itemCount: number;
  best: boolean;
  highlighted: boolean;
}) {
  const t = useTheme();
  const c = t.colors;
  const w = useDerivedValue(() => withSpring(Math.max(0.04, Math.min(1, ratio)), t.motion.spring), [ratio]);
  const barStyle = useAnimatedStyle(() => ({ width: `${w.get() * 100}%` }));
  const color = best ? c.priceBest : highlighted ? c.primary : c.borderStrong;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${name} : ${formatPrice(totalCents)}${missing > 0 ? `, ${missing} article${missing > 1 ? 's' : ''} introuvable${missing > 1 ? 's' : ''}` : ''}${best ? ', le moins cher' : ''}`}
    >
      <StoreBadge chain={store.chain} name={name} size="sm" />
      <View style={styles.flex}>
        <View style={styles.head}>
          <Text variant="subhead" numberOfLines={1} style={styles.flexShrink}>
            {name}
          </Text>
          <Text variant="subhead" tabular color={best ? 'priceBest' : 'text'}>
            {formatPrice(totalCents)}
          </Text>
        </View>
        <View style={[styles.track, { backgroundColor: c.backgroundAlt, borderRadius: t.radius.pill }]}>
          <Animated.View style={[styles.fill, { backgroundColor: color, borderRadius: t.radius.pill }, barStyle]} />
        </View>
        {missing > 0 ? (
          <Text variant="caption" color="textSecondary">
            {itemCount - missing}/{itemCount} articles trouvés
          </Text>
        ) : best ? (
          <Text variant="caption" color="priceBest">
            Le moins cher pour toute ta liste
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, gap: 4 },
  flexShrink: { flexShrink: 1 },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  track: { height: 8, overflow: 'hidden' },
  fill: { height: 8 },
});

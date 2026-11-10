/**
 * Rappel de la dernière commande de la semaine : enseigne, total, statut.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, StoreBadge, Text } from '@/components/ui';
import type { OrderHandoff, Store } from '@/core';
import { formatPrice } from '@/core';
import { formatPriceForA11y } from '@/lib/a11y';
import { useTheme } from '@/theme';

import { CHANNEL_LABELS, plural, storeShortName } from '../basket/basketView';
import { ORDER_STATUS_LABELS } from './orderView';

export interface OrderHistoryRowProps {
  order: Pick<OrderHandoff, 'status' | 'totalCents' | 'channel' | 'lines'>;
  store: Store | undefined;
  /** « Validée aujourd’hui ». */
  when: string;
  testID?: string;
}

export function OrderHistoryRow({ order, store, when, testID }: OrderHistoryRowProps) {
  const t = useTheme();
  const c = t.colors;
  const name = storeShortName(store);
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`Dernière commande : ${name}, ${formatPriceForA11y(order.totalCents)}, ${when}`}
      style={[styles.row, { gap: t.spacing.md, padding: t.spacing.lg, borderRadius: t.radius.lg, backgroundColor: c.surface }]}
    >
      <StoreBadge chain={store?.chain ?? 'default'} name={store?.name} size="md" />
      <View style={styles.flex}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {name} · {CHANNEL_LABELS[order.channel]}
        </Text>
        <Text variant="footnote" color="textSecondary">
          {when} · {plural(order.lines.length, 'article')}
        </Text>
      </View>
      <View style={[styles.end, { gap: t.spacing.xs }]}>
        <Text variant="subhead" tabular>
          {formatPrice(order.totalCents)}
        </Text>
        <Badge
          label={ORDER_STATUS_LABELS[order.status]}
          tone={order.status === 'confirmed' ? 'success' : order.status === 'opened' ? 'accent' : 'neutral'}
          size="sm"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  end: { alignItems: 'flex-end' },
});

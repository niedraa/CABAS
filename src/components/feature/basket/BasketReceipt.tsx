/**
 * Ticket dentelé du panier : magasins retenus, sous-totaux, frais, économie
 * chiffrée (« −7,14 € ») et total qui défile au ressort quand il change.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ReceiptCard } from '@/components/brand';
import { AnimatedPrice, Badge, Divider, KeyValueRow, StoreBadgeStack, Text } from '@/components/ui';
import type { OrderChannel } from '@/core';
import { formatPrice } from '@/core';
import { formatPriceForA11y } from '@/lib/a11y';
import { useTheme } from '@/theme';

import { feesLabel, feesValue, MODE_COPY, plural, type ReceiptSummary } from './basketView';

export interface BasketReceiptProps {
  summary: ReceiptSummary;
  channel: OrderChannel;
  /** En-tête du ticket (« Semaine du 9 – 15 nov. »). */
  header?: string;
  /** Un recalcul est en cours (le ticket reste affiché). */
  updating?: boolean;
  testID?: string;
}

export function BasketReceipt({ summary, channel, header, updating, testID }: BasketReceiptProps) {
  const t = useTheme();
  const multi = summary.parts.length > 1;
  return (
    <View testID={testID} accessibilityState={{ busy: !!updating }}>
      <ReceiptCard header={header ? `Ticket · ${header}` : 'Ticket'} edges="bottom">
        <View style={[styles.row, { gap: t.spacing.sm }]}>
          {summary.chains.length > 0 ? <StoreBadgeStack chains={summary.chains} size="sm" /> : null}
          <Text variant="headline" style={styles.flex} numberOfLines={1}>
            {summary.parts.length > 0 ? plural(summary.parts.length, 'magasin') : 'Aucun magasin'}
          </Text>
          <Badge
            label={summary.mode === 'cheapest' ? MODE_COPY.cheapest.label : multi ? 'Optimisé' : 'Meilleur total'}
            tone="success"
            size="sm"
          />
        </View>
        <Divider variant="dashed" spacing={t.spacing.xs} />
        {summary.parts.map((p) => (
          <KeyValueRow
            key={p.storeId}
            label={p.name}
            hint={plural(p.items, 'article')}
            value={formatPrice(p.subtotalCents)}
            leader
          />
        ))}
        <KeyValueRow
          label={feesLabel(channel)}
          value={feesValue(summary.feesCents)}
          valueColor={summary.feesCents > 0 ? 'text' : 'success'}
          leader
        />
        {summary.savingsCents > 0 ? (
          <View
            style={[styles.row, { gap: t.spacing.sm }]}
            accessible
            accessibilityLabel={`Économie : ${formatPriceForA11y(summary.savingsCents)} par rapport au magasin le plus cher`}
            testID={testID ? `${testID}-savings` : undefined}
          >
            <View style={styles.flex}>
              <Text variant="callout" color="textSecondary">
                Économie
              </Text>
              <Text variant="caption" color="textTertiary">
                vs. le magasin le plus cher
              </Text>
            </View>
            <AnimatedPrice cents={-summary.savingsCents} variant="price" color="savings" />
          </View>
        ) : null}
        <Divider variant="dashed" spacing={t.spacing.xs} />
        <View
          style={[styles.row, { gap: t.spacing.sm }]}
          accessible
          accessibilityLabel={`Total : ${formatPriceForA11y(summary.totalCents)}${summary.feesCents > 0 ? ', frais compris' : ''}`}
        >
          <View style={styles.flex}>
            <Text variant="headline">Total</Text>
            <Text variant="caption" color="textSecondary">
              {summary.missing > 0
                ? `${plural(summary.items, 'article')} · ${summary.missing} introuvable${summary.missing > 1 ? 's' : ''}`
                : `${plural(summary.items, 'article')}, frais compris`}
            </Text>
          </View>
          <AnimatedPrice cents={summary.totalCents} variant="priceLarge" testID={testID ? `${testID}-total` : undefined} />
        </View>
      </ReceiptCard>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});

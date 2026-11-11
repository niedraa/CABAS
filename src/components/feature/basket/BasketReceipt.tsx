/**
 * Ticket dentelé du panier : magasins retenus, sous-totaux, frais, économie
 * chiffrée (« −7,14 € ») et total qui défile au ressort quand il change.
 * Les prix estimés (sans relevé dans l'enseigne) sont comptés : « dont 2 prix
 * estimés ». Courses uniquement en magasin (Lidl, Aldi, Netto) : pas de ligne
 * « frais de retrait ».
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ReceiptCard } from '@/components/brand';
import { AnimatedPrice, Badge, Divider, StoreBadge, StoreBadgeStack, Text } from '@/components/ui';
import type { OrderChannel } from '@/core';
import { isInStoreOnly } from '@/core';
import { formatPriceForA11y } from '@/lib/a11y';
import { useTheme } from '@/theme';

import { estimatedNote, feesLabel, feesValue, MODE_COPY, plural, type ReceiptSummary } from './basketView';
import { ReceiptLine } from './ReceiptLine';

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
  const inStoreOnly = summary.parts.length > 0 && summary.parts.every((p) => isInStoreOnly(p.store, channel));
  return (
    <View testID={testID} accessibilityState={{ busy: !!updating }} style={{ opacity: updating ? t.opacity.pressed : 1 }}>
      <ReceiptCard header={header ? `Ticket · ${header}` : 'Ticket'} edges="bottom">
        <View style={[styles.row, { gap: t.spacing.sm }]}>
          {summary.chains.length > 0 ? <StoreBadgeStack chains={summary.chains} size="sm" /> : null}
          <Text variant="headline" style={styles.flex} numberOfLines={1}>
            {summary.parts.length > 0 ? plural(summary.parts.length, 'magasin') : 'Aucun magasin'}
          </Text>
          <Badge
            label={updating ? 'Mise à jour…' : summary.mode === 'cheapest' ? MODE_COPY.cheapest.label : multi ? 'Optimisé' : 'Meilleur total'}
            tone={updating ? 'neutral' : 'success'}
            size="sm"
          />
        </View>
        <Divider variant="dashed" spacing={t.spacing.xs} />
        {summary.parts.map((p) => (
          <ReceiptLine
            key={p.storeId}
            left={<StoreBadge chain={p.store?.chain ?? p.storeId} name={p.name} size="xs" />}
            label={p.name}
            hint={[plural(p.items, 'article'), estimatedNote(p.estimated)].filter(Boolean).join(', ')}
            value={<AnimatedPrice cents={p.subtotalCents} variant="bodyMedium" />}
            accessibilityValue={formatPriceForA11y(p.subtotalCents)}
            testID={testID ? `${testID}-store-${p.storeId}` : undefined}
          />
        ))}
        {inStoreOnly && summary.feesCents === 0 ? null : (
          <ReceiptLine
            label={feesLabel(channel)}
            value={feesValue(summary.feesCents)}
            valueColor={summary.feesCents > 0 ? 'text' : 'success'}
          />
        )}
        {summary.savingsCents > 0 ? (
          <ReceiptLine
            label="Économie"
            hint="vs. le magasin le plus cher"
            value={<AnimatedPrice cents={-summary.savingsCents} variant="price" color="savings" />}
            accessibilityValue={`moins ${formatPriceForA11y(summary.savingsCents)}`}
            testID={testID ? `${testID}-savings` : undefined}
          />
        ) : null}
        <Divider variant="dashed" spacing={t.spacing.xs} />
        <View
          style={[styles.row, { gap: t.spacing.sm }]}
          accessible
          accessibilityLabel={`Total : ${formatPriceForA11y(summary.totalCents)}${summary.feesCents > 0 ? ', frais compris' : ''}${
            summary.estimated > 0 ? `, ${estimatedNote(summary.estimated)}` : ''
          }`}
        >
          <View style={styles.flex}>
            <Text variant="headline">Total</Text>
            <Text variant="caption" color="textSecondary" testID={testID ? `${testID}-total-detail` : undefined}>
              {summary.missing > 0
                ? `${nb(plural(summary.items, 'article'))} · ${nb(plural(summary.missing, 'introuvable'))}`
                : `${nb(plural(summary.items, 'article'))}, frais compris`}
              {summary.estimated > 0 ? ` · ${nb(estimatedNote(summary.estimated))}` : ''}
            </Text>
          </View>
          <AnimatedPrice cents={summary.totalCents} variant="priceLarge" testID={testID ? `${testID}-total` : undefined} />
        </View>
      </ReceiptCard>
    </View>
  );
}

/** « 44 articles » ne se coupe pas entre le nombre et le mot. */
const nb = (s: string) => s.replace(' ', '\u00A0');

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});

/**
 * Ticket du panier optimisé : total (animé), économie, une section par
 * magasin (articles, sous-total, frais) avec le bouton « Commander chez … ».
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ShoppingBag } from 'lucide-react-native';

import { ReceiptCard } from '@/components/brand';
import { AnimatedPrice, Badge, Button, Divider, KeyValueRow, StoreBadge, Text } from '@/components/ui';
import { formatPrice, type BasketPlan, type OrderChannel, type Store } from '@/core';
import { useTheme } from '@/theme';

export interface BasketReceiptProps {
  plan: BasketPlan;
  storesById: Record<string, Store>;
  nameOf: (store: Store) => string;
  channel: OrderChannel;
  onOrder: (storeId: string) => void;
  /** Commande déjà préparée / confirmée pour ce magasin. */
  orderStatusOf?: (storeId: string) => 'prepared' | 'opened' | 'confirmed' | null;
  header?: string;
  testID?: string;
}

export function BasketReceipt({ plan, storesById, nameOf, channel, onOrder, orderStatusOf, header, testID }: BasketReceiptProps) {
  const t = useTheme();
  const feeLabel = channel === 'delivery' ? 'Livraison' : 'Retrait';
  return (
    <ReceiptCard header={header} testID={testID} style={styles.full}>
      <View style={styles.totalRow}>
        <View style={styles.flex}>
          <Text variant="overline" color="textSecondary">
            Total estimé
          </Text>
          <AnimatedPrice cents={plan.totalCents} variant="hero" testID={`${testID}-total`} />
        </View>
        {plan.savingsCents > 0 ? (
          <Badge label={`−${formatPrice(plan.savingsCents)}`} tone="danger" variant="solid" accessibilityLabel={`${formatPrice(plan.savingsCents)} d’économie`} />
        ) : null}
      </View>
      {plan.savingsCents > 0 ? (
        <Text variant="footnote" color="savings">
          {formatPrice(plan.savingsCents)} économisés par rapport à ton enseigne la plus chère.
        </Text>
      ) : null}

      {plan.parts.map((part) => {
        const store = storesById[part.storeId];
        if (!store) return null;
        const name = nameOf(store);
        const status = orderStatusOf?.(part.storeId) ?? null;
        return (
          <View key={part.storeId} style={{ gap: t.spacing.sm, marginTop: t.spacing.md }} testID={`basket-part-${part.storeId}`}>
            <Divider />
            <View style={[styles.storeRow, { marginTop: t.spacing.sm }]}>
              <StoreBadge chain={store.chain} name={name} size="md" />
              <View style={styles.flex}>
                <Text variant="headline">{name}</Text>
                <Text variant="footnote" color="textSecondary">
                  {part.lines.length} article{part.lines.length > 1 ? 's' : ''} · {store.city}
                </Text>
              </View>
              {status === 'confirmed' ? <Badge label="Commandé" tone="success" size="sm" /> : null}
            </View>
            <KeyValueRow label="Articles" value={formatPrice(part.subtotalCents)} leader />
            <KeyValueRow
              label={channel === 'drive' && !store.hasDrive ? 'Courses en magasin' : feeLabel}
              value={part.feesCents > 0 ? formatPrice(part.feesCents) : 'Gratuit'}
              valueColor={part.feesCents > 0 ? 'text' : 'success'}
              leader
            />
            <KeyValueRow label="Sous-total" value={formatPrice(part.subtotalCents + part.feesCents)} emphasis />
            <Button
              label={
                status === 'confirmed'
                  ? `Revoir la commande ${name}`
                  : channel === 'drive' && !store.hasDrive
                    ? `Ma liste pour ${name}`
                    : `Commander chez ${name}`
              }
              leftIcon={ShoppingBag}
              fullWidth
              variant={status === 'confirmed' ? 'tonal' : 'primary'}
              onPress={() => onOrder(part.storeId)}
              testID={`order-${part.storeId}`}
            />
          </View>
        );
      })}
    </ReceiptCard>
  );
}

const styles = StyleSheet.create({
  full: { width: '100%' },
  flex: { flex: 1 },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});

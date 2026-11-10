/**
 * Commande validée : bandeau héros, économies chiffrées d'abord (« −3,54 € »),
 * dépense ajoutée au budget et reste de la semaine.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { CircleCheck } from 'lucide-react-native';

import { CircleDecor } from '@/components/brand';
import { AnimatedPrice, Text } from '@/components/ui';
import { formatPrice } from '@/core';
import { formatPriceForA11y } from '@/lib/a11y';
import { useTheme } from '@/theme';

export interface OrderConfirmedCardProps {
  storeName: string;
  totalCents: number;
  savingsCents: number;
  /** Budget hebdo : reste après cette commande (null si pas de budget). */
  remainingCents?: number | null;
  /** Libellé de date (« Validée aujourd’hui »). */
  when: string;
  testID?: string;
}

export function OrderConfirmedCard({ storeName, totalCents, savingsCents, remainingCents, when, testID }: OrderConfirmedCardProps) {
  const t = useTheme();
  const c = t.colors;
  const on = { color: c.heroText };
  const soft = { color: c.heroText, opacity: t.opacity.pressed };
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`Commande validée chez ${storeName}. ${
        savingsCents > 0 ? `${formatPriceForA11y(savingsCents)} économisés. ` : ''
      }${formatPriceForA11y(totalCents)} ajoutés à ton budget.`}
      style={[styles.card, { backgroundColor: c.hero, borderRadius: t.radius.xl, padding: t.spacing.xl, gap: t.spacing.md }]}
    >
      <CircleDecor tone="hero" placement="topRight" scale={0.5} />
      <View style={[styles.row, { gap: t.spacing.sm }]}>
        <CircleCheck size={t.iconSize.md} color={c.accent} strokeWidth={2.4} />
        <Text variant="overline" style={on}>
          {when}
        </Text>
      </View>
      <Text variant="title2" style={on} accessibilityRole="header">
        Commande validée !
      </Text>
      {savingsCents > 0 ? (
        <View style={{ gap: t.spacing.xxs }}>
          <AnimatedPrice cents={-savingsCents} variant="priceLarge" style={{ color: c.accent }} testID={testID ? `${testID}-savings` : undefined} />
          <Text variant="callout" style={soft}>
            économisés grâce au comparateur
          </Text>
        </View>
      ) : null}
      <Text variant="footnote" style={soft}>
        {formatPrice(totalCents)} chez {storeName}, ajoutés à ton suivi du budget.
        {remainingCents != null ? ` Il te reste ${formatPrice(remainingCents)} cette semaine.` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center' },
});

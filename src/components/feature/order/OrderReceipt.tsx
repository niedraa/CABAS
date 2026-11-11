/**
 * Ticket de la commande d'un magasin : lignes (article, produit, quantité,
 * prix — « prix estimé » signalé), sous-total (« dont 2 prix estimés »),
 * frais (aucune ligne « frais de retrait » pour des courses en magasin),
 * économie et total. Repliée au-delà de 6 lignes.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { ChevronDown, ChevronUp } from 'lucide-react-native';

import { ReceiptCard } from '@/components/brand';
import { AnimatedPrice, Divider, PressableScale, Text } from '@/components/ui';
import type { OrderChannel } from '@/core';
import { formatPrice } from '@/core';
import { formatPriceForA11y } from '@/lib/a11y';
import { useTheme } from '@/theme';

import { CHANNEL_LABELS, estimatedNote, feesLabel, feesValue, plural } from '../basket/basketView';
import { ReceiptLine } from '../basket/ReceiptLine';
import type { OrderLineView } from './orderView';

export interface OrderReceiptProps {
  lines: OrderLineView[];
  subtotalCents: number;
  feesCents: number;
  totalCents: number;
  savingsCents: number;
  channel: OrderChannel;
  /** Service rendu (« Drive », « Click & collect », « En magasin »…) ; défaut : le canal. */
  service?: string;
  /** Courses en magasin (enseigne sans retrait en ligne) : pas de ligne de frais de retrait. */
  inStoreOnly?: boolean;
  testID?: string;
}

export const ORDER_COLLAPSED_LINES = 6;

export function OrderReceipt({
  lines,
  subtotalCents,
  feesCents,
  totalCents,
  savingsCents,
  channel,
  service,
  inStoreOnly,
  testID,
}: OrderReceiptProps) {
  const t = useTheme();
  const c = t.colors;
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? lines : lines.slice(0, ORDER_COLLAPSED_LINES);
  const hidden = lines.length - ORDER_COLLAPSED_LINES;
  const estimated = lines.filter((l) => l.isEstimate).length;

  return (
    <Animated.View testID={testID} layout={LinearTransition.springify().damping(t.motion.spring.damping)}>
      <ReceiptCard header={`Ticket · ${service ?? CHANNEL_LABELS[channel]} · ${plural(lines.length, 'article')}`} edges="both">
        {shown.map((l, i) => {
          const detail = [l.productName, l.brand, l.quantity, l.isEstimate ? 'prix estimé' : null].filter(Boolean).join(' · ');
          return (
            <Animated.View
              key={l.key}
              entering={i >= ORDER_COLLAPSED_LINES ? FadeIn.delay((i - ORDER_COLLAPSED_LINES) * t.motion.stagger * 0.5) : undefined}
              style={[styles.line, { gap: t.spacing.md }]}
              accessible
              accessibilityLabel={`${l.label}, ${detail}, ${formatPriceForA11y(l.totalCents)}`}
              testID={testID ? `${testID}-line-${i}` : undefined}
            >
              <View style={styles.flex}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {l.label}
                </Text>
                <Text variant="caption" color="textSecondary" numberOfLines={2} tabular>
                  {detail}
                </Text>
              </View>
              <Text variant="subhead" tabular>
                {formatPrice(l.totalCents)}
              </Text>
            </Animated.View>
          );
        })}
        {hidden > 0 ? (
          <PressableScale
            onPress={() => setExpanded((v) => !v)}
            haptic="select"
            accessibilityLabel={expanded ? 'Replier le ticket' : `Voir les ${lines.length} articles`}
            accessibilityState={{ expanded }}
            style={[styles.toggle, { gap: t.spacing.xs, minHeight: t.layout.minTouchTarget }]}
            testID={testID ? `${testID}-toggle` : undefined}
          >
            <Text variant="subhead" color="primary" style={{ fontFamily: t.typography.headline.fontFamily }}>
              {expanded ? 'Replier' : `+ ${plural(hidden, 'autre article', 'autres articles')}`}
            </Text>
            {expanded ? (
              <ChevronUp size={t.iconSize.sm} color={c.primary} strokeWidth={2.4} />
            ) : (
              <ChevronDown size={t.iconSize.sm} color={c.primary} strokeWidth={2.4} />
            )}
          </PressableScale>
        ) : null}
        <Divider variant="dashed" spacing={t.spacing.xs} />
        <ReceiptLine label="Sous-total" hint={estimatedNote(estimated) || undefined} value={formatPrice(subtotalCents)} />
        {inStoreOnly && feesCents === 0 ? null : (
          <ReceiptLine label={feesLabel(channel)} value={feesValue(feesCents)} valueColor={feesCents > 0 ? 'text' : 'success'} />
        )}
        {savingsCents > 0 ? (
          <ReceiptLine
            label="Économie"
            hint="grâce au comparateur"
            value={formatPrice(-savingsCents)}
            accessibilityValue={`moins ${formatPriceForA11y(savingsCents)}`}
            valueColor="savings"
          />
        ) : null}
        <Divider variant="dashed" spacing={t.spacing.xs} />
        <View style={[styles.line, { gap: t.spacing.sm }]} accessible accessibilityLabel={`Total : ${formatPriceForA11y(totalCents)}`}>
          <Text variant="headline" style={styles.flex}>
            Total
          </Text>
          <AnimatedPrice cents={totalCents} variant="priceLarge" testID={testID ? `${testID}-total` : undefined} />
        </View>
      </ReceiptCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
});

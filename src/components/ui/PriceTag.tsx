/**
 * Étiquette de prix « marché » : euros en grand, centimes surélevés,
 * ancien prix barré, prix au kilo, mise en avant « meilleur prix ».
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { formatPriceChangeForA11y } from '@/lib/a11y';
import { formatCents, formatCentsPerUnit, formatDiscount, splitCents } from '@/lib/format';
import { useTheme } from '@/theme';

import { Text } from './Text';

export type PriceTagSize = 'sm' | 'md' | 'lg' | 'xl';

export interface PriceTagProps {
  cents: number;
  /** Ancien prix (barré) — affiche aussi la remise « −12 % ». */
  oldCents?: number | null;
  /** Prix de référence (« 3,20 €/kg »). */
  perUnit?: { cents: number; unit: 'kg' | 'l' | 'piece' } | null;
  size?: PriceTagSize;
  /** Meilleur prix du comparateur : couleur verte + pastille. */
  best?: boolean;
  align?: 'left' | 'right' | 'center';
  /** Style « étiquette » : centimes surélevés (défaut pour lg/xl). */
  split?: boolean;
  /** Couleur forcée (ex. sur fond héros). */
  color?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const SIZE: Record<PriceTagSize, { euros: number; cents: number; line: number }> = {
  sm: { euros: 15, cents: 15, line: 20 },
  md: { euros: 17, cents: 17, line: 22 },
  lg: { euros: 26, cents: 15, line: 30 },
  xl: { euros: 40, cents: 20, line: 44 },
};

export function PriceTag({
  cents,
  oldCents,
  perUnit,
  size = 'md',
  best,
  align = 'left',
  split,
  color,
  style,
  testID,
}: PriceTagProps) {
  const t = useTheme();
  const c = t.colors;
  const dims = SIZE[size];
  const useSplit = split ?? (size === 'lg' || size === 'xl');
  const fg = color ?? (best ? c.priceBest : c.text);
  const discount = oldCents != null ? formatDiscount(oldCents, cents) : '';
  const alignItems = align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start';
  const family = size === 'xl' ? t.typography.priceLarge.fontFamily : t.typography.price.fontFamily;
  const priceText: TextStyle = {
    fontFamily: family,
    color: fg,
    fontVariant: ['tabular-nums'],
    letterSpacing: size === 'xl' ? -1 : -0.3,
  };
  const parts = splitCents(cents);

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={
        formatPriceChangeForA11y(cents, oldCents) +
        (best ? ', meilleur prix' : '') +
        (perUnit ? `, soit ${formatCentsPerUnit(perUnit.cents, perUnit.unit)}` : '')
      }
      style={[{ alignItems }, style]}
    >
      <View style={styles.line}>
        {useSplit ? (
          <View style={styles.split}>
            <Text style={[priceText, { fontSize: dims.euros, lineHeight: dims.line }]}>
              {parts.sign ? '−' : ''}
              {parts.euros}
            </Text>
            <Text style={[priceText, { fontSize: dims.cents, lineHeight: dims.cents + 4, marginTop: 2 }]}>
              ,{parts.decimals}
              {' '}€
            </Text>
          </View>
        ) : (
          <Text style={[priceText, { fontSize: dims.euros, lineHeight: dims.line }]}>{formatCents(cents)}</Text>
        )}
      </View>
      {oldCents != null && oldCents !== cents ? (
        <View style={styles.meta}>
          <Text variant="footnote" color="textSecondary" strike tabular>
            {formatCents(oldCents)}
          </Text>
          {discount ? (
            <View style={[styles.discount, { backgroundColor: c.dangerSoft, borderRadius: t.radius.xs }]}>
              <Text variant="caption" color="savings" tabular>
                {discount}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {perUnit ? (
        <Text variant="caption" color="textSecondary" tabular style={styles.perUnit}>
          {formatCentsPerUnit(perUnit.cents, perUnit.unit)}
        </Text>
      ) : null}
      {best ? (
        <View style={[styles.best, { backgroundColor: c.successSoft, borderRadius: t.radius.pill }]}>
          <Text variant="caption" color="success" style={styles.bestText}>
            Meilleur prix
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'flex-start' },
  split: { flexDirection: 'row', alignItems: 'flex-start' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  discount: { paddingHorizontal: 5, paddingVertical: 1 },
  perUnit: { marginTop: 2 },
  best: { marginTop: 4, paddingHorizontal: 8, paddingVertical: 2 },
  bestText: { fontSize: 11 },
});

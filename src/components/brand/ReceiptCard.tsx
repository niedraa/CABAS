/**
 * Carte « ticket » : papier aux bords dentelés pour les récapitulatifs de
 * prix, le panier optimisé et la commande.
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

import { ReceiptEdge } from './ReceiptEdge';

export interface ReceiptCardProps {
  children?: React.ReactNode;
  edges?: 'top' | 'bottom' | 'both';
  /** En-tête façon ticket (« TICKET N° 0042 · 10/11 »). */
  header?: string;
  color?: string;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

export function ReceiptCard({ children, edges = 'bottom', header, color, style, contentStyle }: ReceiptCardProps) {
  const t = useTheme();
  const bg = color ?? t.colors.surface;
  const top = edges === 'top' || edges === 'both';
  const bottom = edges === 'bottom' || edges === 'both';
  return (
    <View style={style}>
      {top ? <ReceiptEdge position="top" color={bg} /> : null}
      <View
        style={[
          {
            backgroundColor: bg,
            padding: t.spacing.xl,
            borderTopLeftRadius: top ? 0 : t.radius.lg,
            borderTopRightRadius: top ? 0 : t.radius.lg,
            borderBottomLeftRadius: bottom ? 0 : t.radius.lg,
            borderBottomRightRadius: bottom ? 0 : t.radius.lg,
            gap: t.spacing.sm,
          },
          contentStyle,
        ]}
      >
        {header ? (
          <Text variant="overline" color="textSecondary" align="center" style={{ marginBottom: t.spacing.xs }}>
            {header}
          </Text>
        ) : null}
        {children}
      </View>
      {bottom ? <ReceiptEdge position="bottom" color={bg} /> : null}
    </View>
  );
}

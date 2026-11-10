/**
 * Ligne de ticket « libellé · · · · · montant » des récapitulatifs de prix.
 * Les pointillés remplissent l'espace et sont coupés net (une seule ligne
 * visible, sans « … » sur le web), le montant reste en chiffres tabulaires.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, type ThemeColorKey } from '@/components/ui';
import { useTheme } from '@/theme';

export interface ReceiptLineProps {
  label: string;
  hint?: string;
  /** Montant affiché (texte ou nœud, ex. `AnimatedPrice`). */
  value: React.ReactNode;
  /** Valeur lue par le lecteur d'écran (obligatoire si `value` n'est pas du texte). */
  accessibilityValue?: string;
  valueColor?: ThemeColorKey;
  /** Élément à gauche (monogramme d'enseigne). */
  left?: React.ReactNode;
  testID?: string;
}

const LEADER = '· '.repeat(80);

export function ReceiptLine({ label, hint, value, accessibilityValue, valueColor = 'text', left, testID }: ReceiptLineProps) {
  const t = useTheme();
  const spoken = accessibilityValue ?? (typeof value === 'string' ? value : '');
  return (
    <View
      style={[styles.row, { gap: t.spacing.sm, minHeight: t.spacing.xxl + t.spacing.xs }]}
      accessible
      accessibilityLabel={spoken ? `${label}${hint ? `, ${hint}` : ''} : ${spoken}` : label}
      testID={testID}
    >
      {left}
      <View style={styles.label}>
        <Text variant="callout" color="textSecondary" numberOfLines={1}>
          {label}
        </Text>
        {hint ? (
          <Text variant="caption" color="textTertiary" numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      <View style={[styles.leader, { height: t.typography.caption.lineHeight }]} importantForAccessibility="no-hide-descendants">
        <Text variant="caption" style={{ color: t.colors.borderStrong }}>
          {LEADER}
        </Text>
      </View>
      {typeof value === 'string' ? (
        <Text variant="bodyMedium" color={valueColor} tabular>
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  label: { flexShrink: 1 },
  leader: { flex: 1, overflow: 'hidden' },
});

/**
 * Petit graphique en barres (Views, sans dépendance) : dépenses par semaine
 * ou par mois. Barres qui poussent au ressort, période en cours en moutarde,
 * ligne pointillée du budget de référence, montant au-dessus des barres.
 * Chaque barre est lue en clair par les lecteurs d'écran.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, useReducedMotion, withDelay, withSpring } from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { formatPrice } from '@/core';
import { formatPriceForA11y } from '@/lib/a11y';
import { useTheme } from '@/theme';

import type { ChartBar } from './budgetView';

export interface SpendingChartProps {
  bars: readonly ChartBar[];
  maxCents: number;
  /** Ligne de référence (budget hebdo), ou null. */
  referenceCents?: number | null;
  referenceLabel?: string;
  height?: number;
  testID?: string;
}

const LABEL_H = 18;

export function SpendingChart({
  bars,
  maxCents,
  referenceCents = null,
  referenceLabel = 'Budget hebdo',
  height = 150,
  testID = 'spending-chart',
}: SpendingChartProps) {
  const t = useTheme();
  const c = t.colors;
  const plotH = height - LABEL_H * 2;
  const refY = referenceCents && referenceCents > 0 && maxCents > 0 ? Math.min(1, referenceCents / maxCents) * plotH : null;

  return (
    <View testID={testID}>
      <View style={[styles.plot, { height: height - LABEL_H, gap: t.spacing.xs }]}>
        {bars.map((b, i) => (
          <Bar key={b.key} bar={b} index={i} maxCents={maxCents} plotH={plotH} />
        ))}
        {refY !== null ? (
          <View pointerEvents="none" style={[styles.ref, { bottom: refY }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={[styles.refLine, { borderColor: c.textTertiary }]} />
          </View>
        ) : null}
      </View>
      <View style={[styles.labels, { gap: t.spacing.xs }]}>
        {bars.map((b) => (
          <Text
            key={b.key}
            variant="caption"
            color={b.current ? 'text' : 'textSecondary'}
            align="center"
            numberOfLines={1}
            style={styles.flex}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {b.shortLabel}
          </Text>
        ))}
      </View>
      {refY !== null && referenceCents ? (
        <View style={[styles.legend, { gap: t.spacing.sm, marginTop: t.spacing.sm }]} testID={`${testID}-legend`}>
          <View style={[styles.legendLine, { borderColor: c.textTertiary }]} />
          <Text variant="caption" color="textSecondary">
            {referenceLabel} : {formatPrice(referenceCents, { compact: true })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Bar({ bar, index, maxCents, plotH }: { bar: ChartBar; index: number; maxCents: number; plotH: number }) {
  const t = useTheme();
  const c = t.colors;
  const reduced = useReducedMotion();
  const empty = bar.totalCents <= 0;
  const target = empty ? 4 : Math.max(8, (bar.totalCents / Math.max(1, maxCents)) * plotH);
  const h = useDerivedValue(
    () => (reduced ? target : withDelay(Math.min(400, index * t.motion.stagger), withSpring(target, t.motion.spring))),
    [target, reduced],
  );
  const barStyle = useAnimatedStyle(() => ({ height: h.get() }));
  const color = empty ? c.border : bar.current ? c.accent : c.primary;
  const a11y = empty
    ? `${bar.label} : aucune dépense`
    : `${bar.label} : ${formatPriceForA11y(bar.totalCents)}${bar.savingsCents > 0 ? `, dont ${formatPriceForA11y(bar.savingsCents)} économisés` : ''}`;

  return (
    <View style={styles.col} accessible accessibilityRole="text" accessibilityLabel={a11y} testID={`bar-${bar.key}`}>
      {!empty ? (
        <Text variant="caption" color={bar.current ? 'accentText' : 'textSecondary'} numberOfLines={1} style={styles.value} tabular>
          {formatPrice(Math.round(bar.totalCents / 100) * 100, { compact: true })}
        </Text>
      ) : null}
      <Animated.View style={[styles.bar, { backgroundColor: color, borderRadius: t.radius.xs }, barStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  plot: { flexDirection: 'row', alignItems: 'flex-end' },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  value: { marginBottom: 3 },
  bar: { width: '72%', maxWidth: 34 },
  labels: { flexDirection: 'row', height: LABEL_H, alignItems: 'flex-end' },
  ref: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  refLine: { flex: 1, borderTopWidth: 1.5, borderStyle: 'dashed' },
  legend: { flexDirection: 'row', alignItems: 'center' },
  legendLine: { width: 18, borderTopWidth: 1.5, borderStyle: 'dashed' },
});

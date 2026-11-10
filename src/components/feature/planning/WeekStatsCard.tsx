/**
 * Bandeau héros de la semaine : nombre de repas, budget estimé, temps moyen,
 * et jauge du budget hebdo. Les chiffres défilent au ressort (AnimatedNumber).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { CircleDecor } from '@/components/brand';
import { AnimatedNumber, ProgressBar, Text } from '@/components/ui';
import { formatPrice, NNBSP } from '@/core';
import { formatPriceForA11y } from '@/lib/a11y';
import { useTheme } from '@/theme';

import type { WeekStats } from './weekStats';

export interface WeekStatsCardProps {
  stats: WeekStats;
  /** Budget hebdomadaire du profil (centimes), pour la jauge. */
  weeklyBudgetCents?: number;
  testID?: string;
}

export function WeekStatsCard({ stats, weeklyBudgetCents, testID }: WeekStatsCardProps) {
  const t = useTheme();
  const c = t.colors;
  const ratio = weeklyBudgetCents && weeklyBudgetCents > 0 ? stats.budgetCents / weeklyBudgetCents : null;
  const left = weeklyBudgetCents ? weeklyBudgetCents - stats.budgetCents : 0;
  const statColor = { color: c.heroText };
  const labelColor = { color: c.heroText, opacity: 0.78 };

  return (
    <View
      testID={testID}
      style={[styles.card, { backgroundColor: c.hero, borderRadius: t.radius.xl, padding: t.spacing.xl }]}
    >
      <CircleDecor tone="hero" placement="topRight" scale={0.42} />
      <View style={styles.row} accessible accessibilityLabel={a11ySummary(stats)}>
        <View style={styles.stat}>
          <AnimatedNumber value={stats.meals} variant="title2" style={statColor} />
          <Text variant="caption" style={labelColor}>
            repas
          </Text>
        </View>
        <View style={[styles.sep, { backgroundColor: c.heroText }]} />
        <View style={styles.stat}>
          <View style={styles.inline}>
            {stats.budgetIsEstimate && stats.budgetCents > 0 ? (
              <Text variant="title3" style={[statColor, styles.approx]}>
                ≈
              </Text>
            ) : null}
            <AnimatedNumber
              value={Math.round(stats.budgetCents / 100)}
              format={(n) => `${n}${NNBSP}€`}
              variant="title2"
              style={statColor}
            />
          </View>
          <Text variant="caption" style={labelColor}>
            {stats.budgetIsEstimate ? 'budget estimé' : 'panier'}
          </Text>
        </View>
        <View style={[styles.sep, { backgroundColor: c.heroText }]} />
        <View style={styles.stat}>
          <View style={styles.inline}>
            <AnimatedNumber value={stats.avgMinutes} variant="title2" style={statColor} />
            <Text variant="callout" style={[statColor, styles.unit]}>
              min
            </Text>
          </View>
          <Text variant="caption" style={labelColor}>
            en moyenne
          </Text>
        </View>
      </View>

      {ratio !== null && stats.meals > 0 ? (
        <View style={[styles.budget, { marginTop: t.spacing.lg }]}>
          <ProgressBar
            progress={Math.min(1, ratio)}
            tone={ratio > 1 ? 'danger' : 'accent'}
            height={6}
            accessibilityLabel="Budget de la semaine utilisé"
          />
          <Text variant="footnote" style={[labelColor, { marginTop: t.spacing.xs }]}>
            {left >= 0
              ? `Il te reste ${formatPrice(left)} sur ton budget de ${formatPrice(weeklyBudgetCents ?? 0)}.`
              : `${formatPrice(-left)} au-dessus de ton budget : le comparateur va t’aider.`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function a11ySummary(s: WeekStats): string {
  return `${s.meals} repas, ${s.budgetIsEstimate ? 'budget estimé' : 'panier'} ${formatPriceForA11y(s.budgetCents)}, ${s.avgMinutes} minutes en moyenne`;
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  inline: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  approx: { marginRight: 2 },
  unit: { marginLeft: 2 },
  sep: { width: StyleSheet.hairlineWidth * 2, height: 36, opacity: 0.25 },
  budget: {},
});

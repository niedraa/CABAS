/**
 * Semaine en cours vs budget : anneau de progression (pourcentage au centre),
 * montant dépensé qui défile, budget de référence et message bienveillant
 * (chiffres d'abord, jamais de reproche). Au-delà du budget, l'anneau reste
 * plein en moutarde : pas d'alarme rouge.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AnimatedPrice, Card, ProgressRing, Text } from '@/components/ui';
import { formatPrice, formatWeekRange } from '@/core';
import { formatPriceForA11y } from '@/lib/a11y';
import { useTheme } from '@/theme';

import { budgetMessage, type BudgetStatusLike } from './budgetView';

export interface BudgetWeekCardProps {
  status: BudgetStatusLike;
  weekStart: string;
  testID?: string;
}

export function BudgetWeekCard({ status, weekStart, testID = 'budget-week' }: BudgetWeekCardProps) {
  const t = useTheme();
  const msg = budgetMessage(status);
  const hasBudget = status.budgetCents > 0;
  const pct = hasBudget ? Math.round(status.ratio * 100) : 0;
  const tone = msg.tone === 'accent' ? 'accent' : 'success';

  return (
    <Card variant="elevated" padding="xl" radius="xl" testID={testID}>
      <View style={{ gap: t.spacing.lg }}>
        <Text variant="overline" color="textSecondary">
          Cette semaine · {formatWeekRange(weekStart)}
        </Text>
        <View style={[styles.row, { gap: t.spacing.xl }]}>
          <ProgressRing
            progress={hasBudget ? Math.min(1, status.ratio) : 0}
            size={104}
            strokeWidth={11}
            tone={tone}
            accessibilityLabel={hasBudget ? `${pct} % du budget de la semaine` : 'Pas de budget défini'}
          >
            <Text variant="title3" tabular testID={`${testID}-pct`}>
              {hasBudget ? `${pct} %` : '—'}
            </Text>
          </ProgressRing>
          <View
            style={styles.flex}
            accessible
            accessibilityLabel={`Dépensé : ${formatPriceForA11y(status.spentCents)}${hasBudget ? ` sur ${formatPriceForA11y(status.budgetCents)} de budget` : ''}`}
          >
            <Text variant="footnote" color="textSecondary">
              Dépensé
            </Text>
            <AnimatedPrice cents={status.spentCents} variant="priceLarge" testID={`${testID}-spent`} />
            {hasBudget ? (
              <Text variant="footnote" color="textSecondary">
                sur {formatPrice(status.budgetCents, { compact: true })} de budget
              </Text>
            ) : null}
          </View>
        </View>
        <View style={[styles.message, { backgroundColor: msg.tone === 'accent' ? t.colors.accentSoft : msg.tone === 'success' ? t.colors.successSoft : t.colors.backgroundAlt, borderRadius: t.radius.md, padding: t.spacing.md }]}>
          <Text variant="headline" color={msg.tone === 'accent' ? 'accentText' : msg.tone === 'success' ? 'success' : 'text'} testID={`${testID}-title`}>
            {msg.title}
          </Text>
          <Text variant="footnote" color="textSecondary">
            {msg.body}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  message: { gap: 2 },
});

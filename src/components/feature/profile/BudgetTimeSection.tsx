/**
 * Section « Budget & temps » : budget courses hebdo (curseur aimanté) et
 * temps de cuisine maximum en semaine / le week-end. Composant contrôlé.
 *
 * Les temps sont toujours émis ramenés sur les tuiles affichées
 * (`normalizeCookTimes`) : un 60 min stocké s'affiche « 60+ » et devient 120
 * dès qu'on touche la section, pour que le moteur applique ce qui est montré.
 */
import React from 'react';

import { Card, SectionHeader, Stack, Text } from '@/components/ui';
import type { Household } from '@/core';

import { BudgetSlider } from './BudgetSlider';
import { ChoiceTiles } from './ChoiceTiles';
import { BUDGET_RANGE, COOK_TIME_CHOICES, budgetHint, nearestCookTime, normalizeCookTimes, snapBudgetCents } from './profileOptions';

export interface BudgetTimeValue {
  weeklyBudgetCents: number;
  maxCookTimeWeekdayMin: number;
  maxCookTimeWeekendMin: number;
}

export interface BudgetTimeSectionProps {
  value: BudgetTimeValue;
  onChange: (value: BudgetTimeValue) => void;
  /** Foyer (pour un commentaire de budget adapté). */
  household?: Household;
  testID?: string;
}

export function BudgetTimeSection({ value, onChange, household = { adults: 2, children: 0 }, testID = 'budget-time' }: BudgetTimeSectionProps) {
  const budget = snapBudgetCents(value.weeklyBudgetCents, BUDGET_RANGE);
  const emit = (patch: Partial<BudgetTimeValue>) => {
    const next = normalizeCookTimes({ ...value, ...patch });
    const changed =
      next.weeklyBudgetCents !== value.weeklyBudgetCents ||
      next.maxCookTimeWeekdayMin !== value.maxCookTimeWeekdayMin ||
      next.maxCookTimeWeekendMin !== value.maxCookTimeWeekendMin;
    if (changed) onChange(next);
  };
  return (
    <Stack gap="xxl" testID={testID}>
      <Stack gap="md">
        <SectionHeader title="Budget courses" subtitle="Pour toute la semaine, frais de drive compris." />
        <Card variant="elevated" padding="lg">
          <Stack gap="md">
            <BudgetSlider value={budget} onChange={(weeklyBudgetCents) => emit({ weeklyBudgetCents })} testID={`${testID}-slider`} />
            <Text variant="footnote" color="textSecondary" align="center">
              {budgetHint(budget, household)}
            </Text>
          </Stack>
        </Card>
      </Stack>

      <Stack gap="md">
        <SectionHeader title="En semaine" subtitle="Temps max en cuisine, préparation comprise." />
        <ChoiceTiles
          options={COOK_TIME_CHOICES}
          value={nearestCookTime(value.maxCookTimeWeekdayMin)}
          onChange={(maxCookTimeWeekdayMin) => emit({ maxCookTimeWeekdayMin })}
          accessibilityLabel="Temps en semaine"
          testID={`${testID}-weekday`}
        />
      </Stack>

      <Stack gap="md">
        <SectionHeader title="Le week-end" subtitle="On peut prendre un peu plus son temps ?" />
        <ChoiceTiles
          options={COOK_TIME_CHOICES}
          value={nearestCookTime(value.maxCookTimeWeekendMin)}
          onChange={(maxCookTimeWeekendMin) => emit({ maxCookTimeWeekendMin })}
          accessibilityLabel="Temps le week-end"
          testID={`${testID}-weekend`}
        />
      </Stack>
    </Stack>
  );
}

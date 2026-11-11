/**
 * Aperçu du suivi du budget pour l'offre gratuite : un graphique d'exemple
 * flouté (aucune donnée personnelle), la promesse, et l'invitation à essayer
 * Premium. Si Cabas t'a déjà fait économiser, on le dit (chiffres d'abord).
 *
 * Android : le flou exige une cible (`BlurTargetView`) et une méthode native
 * (sinon simple voile translucide). Avant Android 12 (SDK 31), la méthode
 * retombe sur ce voile : l'exemple n'affiche donc aucun montant, pour ne pas
 * être pris pour les chiffres de l'utilisateur.
 */
import { BlurTargetView, BlurView } from 'expo-blur';
import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Crown, Lock } from 'lucide-react-native';

import { Badge, Button, Card, staggerEntering, Text } from '@/components/ui';
import { FEATURE_COPY, formatPrice } from '@/core';
import { useTheme } from '@/theme';

import type { ChartBar } from './budgetView';
import { SpendingChart } from './SpendingChart';

/** Barres d'exemple (purement illustratives). */
export const SAMPLE_BARS: readonly ChartBar[] = [9800, 11200, 8700, 10400, 9300, 6100].map((totalCents, i, all) => ({
  key: `sample-${i}`,
  shortLabel: ' ',
  label: 'Exemple',
  totalCents,
  savingsCents: 0,
  count: 1,
  current: i === all.length - 1,
}));

export interface BudgetTeaserProps {
  /** Économies déjà réalisées (accroche), en centimes. */
  savingsCents: number;
  trialDays: number | null;
  onUpgrade: () => void;
  testID?: string;
}

export function BudgetTeaser({ savingsCents, trialDays, onUpgrade, testID = 'budget-teaser' }: BudgetTeaserProps) {
  const t = useTheme();
  const c = t.colors;
  const copy = FEATURE_COPY.budget_tracking;
  const blurTarget = useRef<React.ComponentRef<typeof View>>(null);
  return (
    <View style={{ gap: t.spacing.lg }} testID={testID}>
      <Animated.View entering={staggerEntering(0)}>
        <Card variant="elevated" padding="xl" radius="xl">
          <BlurTargetView ref={blurTarget} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <SpendingChart bars={SAMPLE_BARS} maxCents={12000} referenceCents={10000} height={150} hideAmounts testID="teaser-chart" />
          </BlurTargetView>
          <BlurView
            intensity={28}
            tint={t.scheme === 'dark' ? 'dark' : 'light'}
            blurTarget={blurTarget}
            blurMethod="dimezisBlurViewSdk31Plus"
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, styles.center]}>
            <View style={[styles.lock, { backgroundColor: c.hero }]}>
              <Lock size={t.iconSize.lg} color={c.accent} strokeWidth={2.4} />
            </View>
          </View>
        </Card>
      </Animated.View>

      <Animated.View entering={staggerEntering(1)} style={{ gap: t.spacing.sm }}>
        <Badge label="Premium" tone="premium" icon={Crown} />
        <Text variant="title2" accessibilityRole="header">
          {copy.title}, en douceur
        </Text>
        <Text variant="callout" color="textSecondary">
          {copy.description} Sans jugement : juste tes chiffres, clairs.
        </Text>
      </Animated.View>

      {savingsCents > 0 ? (
        <Animated.View entering={staggerEntering(2)}>
          <Card variant="accent" padding="lg" accessible accessibilityLabel={`Tu as déjà économisé ${formatPrice(savingsCents)} avec Cabas.`}>
            <Text variant="headline" color="accentText">
              {formatPrice(savingsCents)} déjà économisés avec Cabas
            </Text>
            <Text variant="footnote" color="textSecondary">
              Premium te montre tout ça, semaine après semaine.
            </Text>
          </Card>
        </Animated.View>
      ) : null}

      <Animated.View entering={staggerEntering(3)}>
        <Button
          label={trialDays ? `Essayer ${trialDays} jours gratuits` : 'Découvrir Premium'}
          size="lg"
          fullWidth
          onPress={onUpgrade}
          testID={`${testID}-cta`}
        />
      </Animated.View>
    </View>
  );
}

const LOCK = 56;

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  lock: { width: LOCK, height: LOCK, borderRadius: LOCK / 2, alignItems: 'center', justifyContent: 'center' },
});

/**
 * Suivi du budget (Premium : `budget_tracking`) : semaine en cours vs budget,
 * économies réalisées, dépenses par semaine / par mois (petit graphique en
 * barres), historique avec ajout manuel et suppression annulable.
 * Offre gratuite : aperçu flouté + invitation à essayer Premium.
 */
import { router, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { Plus } from 'lucide-react-native';

import { EmptyList } from '@/components/brand';
import {
  AddSpendingSheet,
  averageCents,
  BudgetTeaser,
  BudgetWeekCard,
  chartMaxCents,
  monthlyBars,
  SavingsCard,
  SpendingChart,
  SpendingEntryRow,
  spendingAddedMessage,
  weeklyBars,
  type AddSpendingInput,
  type ChartPeriod,
} from '@/components/feature/budget';
import { offeredTrialDays, premiumHref } from '@/components/feature/premium';
import { Button, Card, EmptyState, Screen, SegmentedControl, staggerEntering, Text, useToast } from '@/components/ui';
import { formatPrice, type SpendingEntry, type Store } from '@/core';
import { useSubscription } from '@/hooks';
import { haptics } from '@/lib/haptics';
import { useCatalog } from '@/services/catalog';
import { useBudgetStatus, useBudgetStore, useProfileStore, useSubscriptionStore, useTotalSavings, useWeekStore } from '@/stores';
import { useTheme } from '@/theme';

export default function BudgetScreen() {
  const sub = useSubscription();
  const premium = sub.canUse('budget_tracking');
  const savings = useTotalSavings();
  const offerings = useSubscriptionStore((s) => s.offerings);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profil' as Href));
  const trialDays = offeredTrialDays(offerings);

  if (!premium) {
    return (
      <Screen title="Budget" onBack={back} testID="budget-screen">
        <BudgetTeaser savingsCents={savings} trialDays={trialDays} onUpgrade={() => router.push(premiumHref('budget_tracking') as Href)} />
      </Screen>
    );
  }
  return <BudgetTracker onBack={back} />;
}

function BudgetTracker({ onBack }: { onBack: () => void }) {
  const t = useTheme();
  const toast = useToast();
  const catalog = useCatalog();
  const today = useWeekStore((s) => s.today);
  const currentWeek = useWeekStore((s) => s.currentWeekStart);
  const status = useBudgetStatus(currentWeek);
  const savings = useTotalSavings();
  const entries = useBudgetStore((s) => s.entries);
  const preferred = useProfileStore((s) => s.profile?.preferredStoreIds);
  const [period, setPeriod] = useState<ChartPeriod>('week');
  const [adding, setAdding] = useState(false);

  const bars = useMemo(
    () => (period === 'week' ? weeklyBars(entries, currentWeek) : monthlyBars(entries, today)),
    [period, entries, currentWeek, today],
  );
  const reference = period === 'week' && status.budgetCents > 0 ? status.budgetCents : null;
  const max = chartMaxCents(bars, reference ?? 0);
  const avg = averageCents(bars);
  const orders = useMemo(() => entries.filter((e) => e.source === 'order').length, [entries]);

  // Enseignes de la saisie : magasins préférés d'abord.
  const stores = useMemo(() => {
    const pref = new Set(preferred ?? []);
    return [...catalog.stores].sort((a: Store, b: Store) => Number(pref.has(b.id)) - Number(pref.has(a.id)));
  }, [catalog.stores, preferred]);

  const add = (input: AddSpendingInput) => {
    const entry = useBudgetStore.getState().addManualEntry(input);
    setAdding(false);
    toast.show({
      title: 'Dépense ajoutée',
      message: spendingAddedMessage(entry.totalCents, entry.date, currentWeek),
      tone: 'success',
    });
  };

  const remove = (entry: SpendingEntry) => {
    haptics.impact();
    useBudgetStore.getState().removeEntry(entry.id);
    toast.show({
      title: 'Dépense supprimée',
      message: formatPrice(entry.totalCents),
      tone: 'neutral',
      action: {
        label: 'Annuler',
        onPress: () => {
          haptics.select();
          useBudgetStore.getState().addEntry(entry);
        },
      },
    });
  };

  return (
    <>
      <Screen title="Budget" onBack={onBack} testID="budget-screen">
        <View style={{ gap: t.spacing.xl }}>
          <Animated.View entering={staggerEntering(0)}>
            <BudgetWeekCard status={status} weekStart={currentWeek} />
          </Animated.View>

          <Animated.View entering={staggerEntering(1)}>
            <SavingsCard savingsCents={savings} orders={orders} />
          </Animated.View>

          <Animated.View entering={staggerEntering(2)}>
            <Card variant="plain" padding="lg" radius="xl">
              <View style={{ gap: t.spacing.lg }}>
                <View style={[styles.rowBetween, { gap: t.spacing.md }]}>
                  <View style={styles.flex}>
                    <Text variant="title3" accessibilityRole="header">
                      Tes dépenses
                    </Text>
                    <Text variant="footnote" color="textSecondary">
                      {avg !== null
                        ? `En moyenne ${formatPrice(avg, { compact: true })} par ${period === 'week' ? 'semaine' : 'mois'}`
                        : 'Tes premières dépenses dessineront la courbe.'}
                    </Text>
                  </View>
                </View>
                <SegmentedControl<ChartPeriod>
                  size="md"
                  options={[
                    { value: 'week', label: 'Semaines' },
                    { value: 'month', label: 'Mois' },
                  ]}
                  value={period}
                  onChange={setPeriod}
                  accessibilityLabel="Période du graphique"
                  testID="budget-period"
                />
                <SpendingChart key={period} bars={bars} maxCents={max} referenceCents={reference} />
              </View>
            </Card>
          </Animated.View>

          <Animated.View entering={staggerEntering(3)} style={{ gap: t.spacing.sm }}>
            <View style={[styles.rowBetween, { gap: t.spacing.md }]}>
              <Text variant="title3" accessibilityRole="header" style={styles.flex}>
                Historique
              </Text>
              {/* Tailles « md » ici et sur le sélecteur de période : cibles ≥ 44 pt. */}
              <Button label="Ajouter" size="md" variant="tonal" leftIcon={Plus} onPress={() => setAdding(true)} testID="budget-add" />
            </View>
            {entries.length === 0 ? (
              <EmptyState
                compact
                illustration={<EmptyList size={110} />}
                title="Aucune dépense pour l’instant"
                body="Tes commandes Cabas s’ajoutent seules. Un passage au marché ? Ajoute-le ici."
                action={{ label: 'Ajouter une dépense', leftIcon: Plus, onPress: () => setAdding(true) }}
              />
            ) : (
              <Card variant="plain" padding="none" style={[styles.outlined, { borderColor: t.colors.border }]}>
                {entries.map((e, i) => (
                  <Animated.View
                    key={e.id}
                    entering={staggerEntering(Math.min(i, 8), t.motion.stagger, t.motion.duration.base)}
                    exiting={FadeOut.duration(t.motion.duration.fast)}
                    layout={LinearTransition.springify().damping(t.motion.spring.damping).stiffness(t.motion.spring.stiffness)}
                    style={i > 0 ? [styles.separator, { borderTopColor: t.colors.border }] : undefined}
                  >
                    <SpendingEntryRow
                      entry={e}
                      storesById={catalog.storesById}
                      today={today}
                      onRemove={() => remove(e)}
                      testID={`spending-${e.id}`}
                    />
                  </Animated.View>
                ))}
              </Card>
            )}
          </Animated.View>
        </View>
      </Screen>

      <AddSpendingSheet visible={adding} onClose={() => setAdding(false)} onSubmit={add} stores={stores} today={today} />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center' },
  outlined: { borderWidth: StyleSheet.hairlineWidth * 2 },
  separator: { borderTopWidth: StyleSheet.hairlineWidth * 2 },
});

/**
 * Suivi du budget : la semaine en cours face au budget du profil, les
 * économies réalisées grâce au comparateur, l'historique par semaine et
 * les dépenses (commandes confirmées + saisies manuelles).
 * L'historique et les économies cumulées sont Premium ; la semaine en cours
 * reste visible pour tous.
 */
import { router, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Crown, Plus, Trash2 } from 'lucide-react-native';

import {
  Button,
  Card,
  Chip,
  EmptyState,
  IconButton,
  InfoBanner,
  ProgressBar,
  Screen,
  SectionHeader,
  Sheet,
  Stack,
  StoreBadge,
  Text,
  TextField,
  useToast,
} from '@/components/ui';
import { addDays, formatDayLabel, formatPrice, parseISODate, parsePriceToCents, storeDisplayName, todayISO } from '@/core';
import { useSubscription } from '@/hooks';
import { haptics } from '@/lib/haptics';
import { useCatalog } from '@/services/catalog';
import { useBudgetStatus, useBudgetStore, useProfileStore, useSpendingByWeek, useTotalSavings } from '@/stores';
import { useTheme } from '@/theme';

export default function BudgetScreen() {
  const t = useTheme();
  const c = t.colors;
  const toast = useToast();
  const sub = useSubscription();
  const catalog = useCatalog();
  const status = useBudgetStatus();
  const weeks = useSpendingByWeek();
  const savings = useTotalSavings();
  const entries = useBudgetStore((s) => s.entries);
  const [adding, setAdding] = useState(false);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/profil' as Href));
  const premium = sub.canUse('budget_tracking');

  // Les 8 dernières semaines (semaines sans dépense comprises), de la plus ancienne à l'actuelle.
  const lastWeeks = useMemo(() => {
    const byKey = new Map(weeks.map((w) => [w.key, w]));
    return Array.from({ length: 8 }, (_, i) => {
      const key = addDays(status.weekStart, (i - 7) * 7);
      const d = parseISODate(key);
      return { key, label: `${d.getDate()}/${d.getMonth() + 1}`, totalCents: byKey.get(key)?.totalCents ?? 0 };
    });
  }, [weeks, status.weekStart]);
  const maxWeek = Math.max(status.budgetCents, ...lastWeeks.map((w) => w.totalCents), 1);

  return (
    <Screen title="Budget" subtitle="Tes courses, semaine après semaine." onBack={close} bottomInset="safe" testID="budget-screen">
      <View style={{ gap: t.spacing.xl, paddingBottom: t.spacing.xl }}>
        <Card variant="hero" padding="lg" radius="xl" testID="budget-week">
          <Text variant="overline" color="heroText">
            Cette semaine
          </Text>
          <Text variant="hero" color="heroText" tabular>
            {formatPrice(status.spentCents)}
          </Text>
          <Text variant="footnote" color="heroText">
            {status.budgetCents > 0
              ? status.over
                ? `${formatPrice(status.spentCents - status.budgetCents)} au-dessus de ton budget de ${formatPrice(status.budgetCents, { compact: true })}`
                : `Il te reste ${formatPrice(status.remainingCents)} sur ${formatPrice(status.budgetCents, { compact: true })}`
              : 'Aucun budget défini'}
          </Text>
          <ProgressBar
            progress={Math.min(1, status.ratio)}
            tone={status.over ? 'danger' : 'accent'}
            height={10}
            style={{ marginTop: t.spacing.md }}
            accessibilityLabel={`${Math.round(status.ratio * 100)} % du budget utilisé`}
          />
        </Card>

        {premium ? (
          <>
            <View style={styles.statsRow}>
              <Card variant="plain" padding="lg" radius="lg" style={styles.flex}>
                <Text variant="overline" color="textSecondary">
                  Économisé
                </Text>
                <Text variant="title2" color="savings" tabular testID="budget-savings">
                  {formatPrice(savings)}
                </Text>
                <Text variant="caption" color="textSecondary">
                  grâce au comparateur
                </Text>
              </Card>
              <Card variant="plain" padding="lg" radius="lg" style={styles.flex}>
                <Text variant="overline" color="textSecondary">
                  Moyenne
                </Text>
                <Text variant="title2" tabular>
                  {formatPrice(weeks.length > 0 ? Math.round(weeks.reduce((s, w) => s + w.totalCents, 0) / weeks.length) : 0)}
                </Text>
                <Text variant="caption" color="textSecondary">
                  par semaine
                </Text>
              </Card>
            </View>

            {weeks.length > 0 ? (
              <View>
                <SectionHeader title="Par semaine" subtitle="Le trait pointillé, c’est ton budget" />
                <Card variant="plain" padding="lg" radius="lg">
                  <View style={[styles.chart, { height: 140 }]} accessibilityLabel="Dépenses des dernières semaines">
                    {status.budgetCents > 0 ? (
                      <View
                        style={[styles.budgetLine, { bottom: (status.budgetCents / maxWeek) * 120 + 18, borderColor: c.accentText }]}
                      />
                    ) : null}
                    {lastWeeks.map((w) => {
                      const over = status.budgetCents > 0 && w.totalCents > status.budgetCents;
                      return (
                        <View key={w.key} style={styles.barCol} accessible accessibilityLabel={`Semaine du ${w.label} : ${formatPrice(w.totalCents)}`}>
                          <View
                            style={{
                              height: w.totalCents > 0 ? Math.max(4, (w.totalCents / maxWeek) * 120) : 3,
                              width: '70%',
                              maxWidth: 28,
                              backgroundColor: w.totalCents === 0 ? c.backgroundAlt : over ? c.danger : w.key === status.weekStart ? c.accent : c.primary,
                              borderRadius: t.radius.xs,
                            }}
                          />
                          <Text variant="caption" color={w.key === status.weekStart ? 'text' : 'textSecondary'} numberOfLines={1}>
                            {w.label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </Card>
              </View>
            ) : null}
          </>
        ) : (
          <InfoBanner
            tone="premium"
            icon={Crown}
            title="Ton historique avec Premium"
            message="Tes dépenses semaine après semaine et tout ce que Cabas t’a fait économiser."
            action={{ label: 'Essayer 7 jours', onPress: () => router.push('/premium' as Href) }}
          />
        )}

        <View>
          <SectionHeader
            title="Dépenses"
            right={<Button label="Ajouter" size="sm" variant="tonal" leftIcon={Plus} onPress={() => setAdding(true)} testID="budget-add" />}
          />
          {entries.length === 0 ? (
            <EmptyState
              compact
              title="Aucune dépense notée"
              body="Elles s’ajoutent quand tu confirmes une commande. Tu peux aussi noter tes courses à la main."
            />
          ) : (
            <Card variant="plain" padding="sm" radius="lg">
              {(premium ? entries : entries.filter((e) => e.date >= status.weekStart)).slice(0, 30).map((e) => {
                const store = catalog.storesById[e.storeId];
                const name = store ? storeDisplayName(store) : e.storeId;
                return (
                  <View key={e.id} style={[styles.row, { padding: t.spacing.sm }]}>
                    {store ? <StoreBadge chain={store.chain} name={name} size="sm" /> : null}
                    <View style={styles.flex}>
                      <Text variant="bodyMedium" numberOfLines={1}>
                        {e.label ?? `Courses ${name}`}
                      </Text>
                      <Text variant="footnote" color="textSecondary">
                        {formatDayLabel(e.date, 'long')}
                        {e.savingsCents > 0 ? ` · ${formatPrice(e.savingsCents)} économisés` : ''}
                      </Text>
                    </View>
                    <Text variant="callout" tabular>
                      {formatPrice(e.totalCents)}
                    </Text>
                    <IconButton
                      icon={Trash2}
                      size="sm"
                      variant="plain"
                      accessibilityLabel="Supprimer cette dépense"
                      onPress={() => {
                        useBudgetStore.getState().removeEntry(e.id);
                        toast.show({
                          title: 'Dépense supprimée',
                          tone: 'neutral',
                          action: { label: 'Annuler', onPress: () => useBudgetStore.getState().addEntry(e) },
                        });
                      }}
                    />
                  </View>
                );
              })}
            </Card>
          )}
        </View>
      </View>
      <AddSpendingSheet visible={adding} onClose={() => setAdding(false)} />
    </Screen>
  );
}

function AddSpendingSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const toast = useToast();
  const catalog = useCatalog();
  const preferred = useProfileStore((s) => s.profile?.preferredStoreIds ?? []);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const cents = parsePriceToCents(amount);
  const sid = storeId ?? preferred[0] ?? null;
  const valid = !!sid && cents !== null && cents > 0;

  const save = () => {
    if (!valid || !sid || cents === null) return;
    useBudgetStore.getState().addManualEntry({ date: todayISO(), storeId: sid, totalCents: cents });
    haptics.success();
    toast.show({ title: `${formatPrice(cents)} ajoutés`, tone: 'success', duration: 1800 });
    setAmount('');
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Noter des courses"
      subtitle="Aujourd’hui"
      footer={<Button label="Ajouter" fullWidth disabled={!valid} onPress={save} testID="spending-save" />}
    >
      <Stack gap="lg">
        <TextField
          label="Montant"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="Ex. 62,40"
          right={<Text color="textSecondary">€</Text>}
          testID="spending-amount"
        />
        <View style={{ gap: t.spacing.sm }}>
          <Text variant="subhead">Magasin</Text>
          <View style={styles.chips}>
            {preferred.map((id) => {
              const s = catalog.storesById[id];
              if (!s) return null;
              return <Chip key={id} label={storeDisplayName(s)} size="sm" role="radio" selected={sid === id} onPress={() => setStoreId(id)} />;
            })}
          </View>
        </View>
      </Stack>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  statsRow: { flexDirection: 'row', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  barCol: { flex: 1, alignItems: 'center', gap: 4, justifyContent: 'flex-end' },
  budgetLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1.5, borderStyle: 'dashed' },
});

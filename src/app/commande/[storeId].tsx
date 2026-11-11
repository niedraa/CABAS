/**
 * Commande chez une enseigne (modale) — étape 4 du parcours.
 *
 * Ticket du magasin (lignes, quantités, prix, frais, total, économie), puis
 * `prepareOrder(part, storeId, channel)` au premier geste et « Ouvrir
 * <enseigne> » (`openOrder`) : en Premium, commande en un clic (liste copiée
 * et site ouvert d'un seul geste) ; en gratuit, liste à copier + ouverture du
 * site et invitation Premium sobre. Au retour : « J’ai validé ma commande »
 * (`confirmOrder` → dépense au budget) → célébration et économies chiffrées.
 * Rappel de la dernière commande de la semaine.
 *
 * La commande est rangée sous la semaine du PANIER (`basket.weekStart`, comme
 * `prepareOrder`), pas sous la semaine active, qui peut changer pendant qu'on
 * est chez l'enseigne (passage à minuit le dimanche).
 */
import { router, useLocalSearchParams, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { ArrowLeft, CircleCheck, ExternalLink, RotateCcw } from 'lucide-react-native';

import { Celebration, EmptyBasket } from '@/components/brand';
import { CHANNEL_LABELS, plural, storeShortName } from '@/components/feature/basket';
import {
  historyOrder,
  OrderActions,
  OrderConfirmedCard,
  OrderHistoryRow,
  orderBudgetView,
  orderBudgetWeek,
  orderLineViews,
  orderMatchesPart,
  OrderReceipt,
  orderStage,
  orderTotals,
  orderWhenLabel,
  partSavingsCents,
} from '@/components/feature/order';
import {
  Badge,
  Button,
  EmptyState,
  Screen,
  SectionHeader,
  staggerEntering,
  StoreBadge,
  Text,
  ToastProvider,
  useSafeInsets,
  useToast,
} from '@/components/ui';
import type { OrderChannel } from '@/core';
import { formatPrice, formatWeekRange } from '@/core';
import { useSubscription } from '@/hooks';
import { useCatalog } from '@/services/catalog';
import {
  activeWeek,
  lastOrderForWeek,
  useBasketStore,
  useBudgetStatus,
  useLastOrderForWeek,
  useOrderStore,
  useWeekStore,
  type StoredOrder,
} from '@/stores';
import { useTheme } from '@/theme';

/**
 * Route modale. Sur iOS, la feuille vit dans son propre contrôleur natif,
 * au-dessus de la vue racine : elle mesure sa PROPRE zone sûre (elle commence
 * déjà sous la barre d'état : pas de marge du haut, comme React Navigation
 * pour ses modales) et affiche ses toasts elle-même (ceux de la racine
 * resteraient cachés dessous).
 */
export default function OrderRoute() {
  const parent = useSafeInsets();
  const { width, height } = useWindowDimensions();
  // Valeurs de départ, remplacées par la mesure native de la modale.
  const initialMetrics: Metrics = {
    insets: Platform.OS === 'ios' ? { ...parent, top: 0 } : parent,
    frame: { x: 0, y: 0, width, height },
  };
  return (
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ToastProvider>
        <OrderScreen />
      </ToastProvider>
    </SafeAreaProvider>
  );
}

function OrderScreen() {
  const t = useTheme();
  const toast = useToast();
  const sub = useSubscription();
  const catalog = useCatalog();
  const { storeId = '' } = useLocalSearchParams<{ storeId?: string }>();
  const store = catalog.storesById[storeId];
  const short = storeShortName(store);

  const ws = useWeekStore((s) => s.activeWeekStart);
  const today = useWeekStore((s) => s.today);
  const currentWeek = useWeekStore((s) => s.currentWeekStart);
  const plan = useBasketStore((s) => s.plan);
  const channel = useBasketStore((s) => s.channel);
  // Semaine où `prepareOrder` range la commande : celle du panier.
  const orderWeek = useBasketStore((s) => s.weekStart) ?? ws;
  const part = useMemo(() => plan?.parts.find((p) => p.storeId === storeId) ?? null, [plan, storeId]);
  const order = useLastOrderForWeek(orderWeek, storeId);
  const lastOfWeek = useLastOrderForWeek(orderWeek);
  // La dépense est datée du jour de validation : on lit le budget de CETTE semaine-là.
  const budgetWeek = orderBudgetWeek(order, order?.weekStart ?? orderWeek);
  const budget = useBudgetStatus(budgetWeek);

  const oneClick = sub.canUse('one_click_order');
  const [reordering, setReordering] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<'copy' | 'open' | null>(null);
  const [celebrate, setCelebrate] = useState(0);
  const [celebrating, setCelebrating] = useState(false);

  const stage = orderStage(order, reordering);
  // Ce qui est montré : le panier actuel tant que rien n'est parti, sinon ce qui a été transmis.
  const shown = stage === 'ready' ? part : order;
  const lines = useMemo(() => (shown ? orderLineViews(shown.lines, catalog.productsById) : []), [shown, catalog]);
  const totals = useMemo(() => {
    if (stage === 'ready' && part) return { subtotalCents: part.subtotalCents, feesCents: part.feesCents, totalCents: part.subtotalCents + part.feesCents };
    return order ? orderTotals(order.lines, order.totalCents) : { subtotalCents: 0, feesCents: 0, totalCents: 0 };
  }, [stage, part, order]);
  const savings = stage === 'ready' ? (part ? partSavingsCents(plan, part) : 0) : (order?.savingsCents ?? 0);
  const shownChannel = stage === 'ready' ? channel : (order?.channel ?? channel);
  const history = historyOrder(lastOfWeek, order, stage);
  const canReorder = stage === 'confirmed' && !!part && !!order && !orderMatchesPart(order, part, channel);

  // ── Actions ───────────────────────────────────────────────────────────────
  const close = () => (router.canGoBack() ? router.back() : router.replace('/panier' as Href));

  /** Commande correspondant au panier (préparée au premier geste, réutilisée ensuite). */
  const ensureOrder = (): StoredOrder | null => {
    const s = useOrderStore.getState();
    const week = useBasketStore.getState().weekStart ?? activeWeek();
    const current = lastOrderForWeek(s.orders, week, storeId);
    if (current && current.status !== 'confirmed') {
      // Déjà ouverte chez l'enseigne : on la garde ; préparée : seulement si elle colle au panier.
      if (current.status === 'opened' || !part || orderMatchesPart(current, part, channel)) return current;
    }
    return part ? s.prepareOrder(part, storeId, channel) : null;
  };

  const copy = async () => {
    const o = ensureOrder();
    if (!o) return;
    setBusy('copy');
    const ok = await useOrderStore.getState().copyOrderText(o.id);
    setBusy(null);
    if (ok) {
      setCopied(true);
      toast.show({ title: 'Liste copiée', message: `Colle-la dans la recherche de ${short}.`, tone: 'success' });
    } else {
      toast.show({ title: 'Copie impossible', message: 'Réessaie dans un instant.', tone: 'danger' });
    }
  };

  const open = async () => {
    const o = ensureOrder();
    if (!o) return;
    setBusy('open');
    // Premium : la liste part aussi dans le presse-papiers, en filet de sécurité.
    if (oneClick && (await useOrderStore.getState().copyOrderText(o.id))) setCopied(true);
    const ok = await useOrderStore.getState().openOrder(o.id);
    setBusy(null);
    if (!ok) {
      toast.show({ title: `Impossible d’ouvrir ${short}`, message: 'Copie ta liste et réessaie dans un instant.', tone: 'danger' });
    }
  };

  const confirm = () => {
    if (!order) return;
    const entry = useOrderStore.getState().confirmOrder(order.id);
    if (!entry) {
      toast.show({ title: 'Oups', message: 'Cette commande est introuvable.', tone: 'danger' });
      return;
    }
    setReordering(false);
    setCelebrate((n) => n + 1);
    setCelebrating(true);
  };

  const reorder = () => {
    setCopied(false);
    setReordering(true);
  };

  const goPremium = () => router.push('/premium' as Href);

  // ── Rendu ─────────────────────────────────────────────────────────────────
  if (!store || (!shown && stage === 'ready')) {
    return (
      <Screen onBack={close} backIcon="close" testID="order-screen">
        <EmptyState
          illustration={<EmptyBasket size={130} />}
          title={store ? `Rien à commander chez ${short}` : 'Magasin introuvable'}
          body={store ? 'Ce magasin n’est plus dans ton panier. Reviens aux prix pour voir où commander.' : 'Il a peut-être quitté le catalogue.'}
          action={{ label: 'Retour aux prix', leftIcon: ArrowLeft, onPress: close }}
        />
      </Screen>
    );
  }

  const footer =
    stage === 'ready' ? (
      <Button
        label={`Ouvrir ${short}`}
        size="lg"
        rightIcon={ExternalLink}
        fullWidth
        loading={busy === 'open'}
        onPress={() => void open()}
        accessibilityHint={oneClick ? 'Copie ta liste et ouvre le site de l’enseigne' : 'Ouvre le site de l’enseigne'}
        testID="order-open"
      />
    ) : stage === 'opened' ? (
      <Button label="J’ai validé ma commande" size="lg" leftIcon={CircleCheck} fullWidth onPress={confirm} haptic="impact" testID="order-confirm" />
    ) : (
      <Button label="Retour à mes prix" size="lg" variant="secondary" leftIcon={ArrowLeft} fullWidth onPress={close} testID="order-done" />
    );

  return (
    <View style={styles.root} testID="order-screen">
      {/* Nouvelle clé une fois validée : on remonte en haut, sur la bonne nouvelle. */}
      <Screen
        key={stage === 'confirmed' ? 'confirmed' : 'live'}
        title={`Chez ${short}`}
        eyebrow={`${CHANNEL_LABELS[shownChannel]} · semaine du ${formatWeekRange(order?.weekStart ?? orderWeek)}`}
        onBack={close}
        backIcon="close"
        footer={footer}
      >
        <View style={{ gap: t.spacing.xl }}>
          {/* En-tête magasin */}
          <Animated.View entering={staggerEntering(0)} style={[styles.row, { gap: t.spacing.md }]}>
            <StoreBadge chain={store.chain} name={store.name} size="xl" />
            <View style={[styles.flex, { gap: t.spacing.xs }]}>
              <Text variant="headline" numberOfLines={1}>
                {store.name}
              </Text>
              <Text variant="footnote" color="textSecondary">
                {plural(lines.length, 'article')} · {feesLine(shownChannel, totals.feesCents)}
              </Text>
              {stage !== 'ready' ? (
                <Badge
                  label={stage === 'confirmed' ? 'Validée' : 'En cours chez l’enseigne'}
                  tone={stage === 'confirmed' ? 'success' : 'accent'}
                  size="sm"
                />
              ) : null}
            </View>
          </Animated.View>

          {stage === 'confirmed' && order ? (
            <Animated.View entering={FadeInDown.springify().damping(t.motion.springBouncy.damping)}>
              <OrderConfirmedCard
                storeName={short}
                totalCents={order.totalCents}
                savingsCents={order.savingsCents}
                budget={orderBudgetView(budget, budget.budgetCents, budgetWeek, currentWeek)}
                when={orderWhenLabel(order, today)}
                testID="order-confirmed"
              />
            </Animated.View>
          ) : null}

          <Animated.View entering={staggerEntering(1)} layout={LinearTransition}>
            <OrderReceipt
              lines={lines}
              subtotalCents={totals.subtotalCents}
              feesCents={totals.feesCents}
              totalCents={totals.totalCents}
              savingsCents={savings}
              channel={shownChannel}
              testID="order-receipt"
            />
          </Animated.View>

          {stage !== 'confirmed' ? (
            <Animated.View key={stage} entering={FadeInDown.springify().damping(t.motion.spring.damping)}>
              <OrderActions
                stage={stage}
                oneClick={oneClick}
                storeName={short}
                copied={copied}
                busy={busy}
                onCopy={() => void copy()}
                onOpen={() => void open()}
                onPremium={goPremium}
                testID="order-actions"
              />
            </Animated.View>
          ) : canReorder ? (
            <Animated.View entering={FadeIn}>
              <Button
                label="Préparer une nouvelle commande"
                variant="ghost"
                leftIcon={RotateCcw}
                onPress={reorder}
                style={styles.center}
                testID="order-reorder"
              />
            </Animated.View>
          ) : null}

          {history ? (
            <Animated.View entering={FadeIn.delay(t.motion.duration.base)} style={{ gap: t.spacing.sm }}>
              <SectionHeader title="Cette semaine" kind="overline" />
              <OrderHistoryRow
                order={history}
                store={catalog.storesById[history.storeId]}
                when={orderWhenLabel(history, today)}
                testID="order-history"
              />
            </Animated.View>
          ) : null}
        </View>
      </Screen>

      {celebrating ? (
        <Animated.View pointerEvents="none" style={styles.celebrate} exiting={FadeOut.duration(t.motion.duration.slow)}>
          <Celebration
            size={240}
            playKey={celebrate}
            accessibilityLabel="Commande validée"
            onDone={() => setTimeout(() => setCelebrating(false), t.motion.duration.slow)}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** « retrait offert », « livraison : 5,99 € ». */
function feesLine(channel: OrderChannel, feesCents: number): string {
  if (feesCents > 0) return `${channel === 'delivery' ? 'livraison' : 'retrait'} : ${formatPrice(feesCents)}`;
  return channel === 'delivery' ? 'livraison offerte' : 'retrait offert';
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  center: { alignSelf: 'center' },
  celebrate: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});

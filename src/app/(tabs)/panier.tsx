/**
 * « Prix » — étape 3 du parcours : comparateur et panier optimisé.
 *
 * Calcul à l'arrivée si la liste a changé (squelettes, erreur avec
 * « Réessayer »), mode « Un seul magasin » (gratuit) / « Le moins cher »
 * (Premium : 2 magasins max, frais inclus — un compte gratuit reçoit une
 * invitation Premium chiffrée), canal drive / livraison, ticket dentelé
 * (total, frais, économie), magasins du panier avec « Commander chez … »,
 * comparaison article par article et articles introuvables.
 */
import { router, useIsFocused, type Href } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { CalendarDays, Crown, ListChecks, RotateCcw } from 'lucide-react-native';

import { CookingPot, EmptyBasket, EmptyList } from '@/components/brand';
import {
  BasketControls,
  BasketReceipt,
  BasketSkeleton,
  basketScreenState,
  cheapestGainCents,
  ComparisonRow,
  comparisonRows,
  comparedStoreIds,
  emptyBasketReason,
  MissingItems,
  missingRows,
  plural,
  receiptSummary,
  savingsLabel,
  StorePartCard,
} from '@/components/feature/basket';
import {
  Divider,
  EmptyState,
  InfoBanner,
  Screen,
  SectionHeader,
  staggerEntering,
  StoreBadgeStack,
  Text,
} from '@/components/ui';
import type { BasketMode, OrderChannel } from '@/core';
import { formatWeekRange, PREMIUM_PRICING } from '@/core';
import { useHydrated, useSubscription } from '@/hooks';
import { haptics } from '@/lib/haptics';
import { useCatalog } from '@/services/catalog';
import {
  basketRightsChanged,
  lastOrderForWeek,
  useBasketIsStale,
  useBasketStore,
  useOrderStore,
  useWeekList,
  useWeekStore,
} from '@/stores';
import { useTheme } from '@/theme';

export default function PriceScreen() {
  const t = useTheme();
  const hydrated = useHydrated();
  const isFocused = useIsFocused();
  const sub = useSubscription();
  const catalog = useCatalog();

  const ws = useWeekStore((s) => s.activeWeekStart);
  const list = useWeekList(ws);
  const mode = useBasketStore((s) => s.mode);
  const channel = useBasketStore((s) => s.channel);
  const plan = useBasketStore((s) => s.plan);
  const comparisons = useBasketStore((s) => s.comparisons);
  const status = useBasketStore((s) => s.status);
  const downgraded = useBasketStore((s) => s.downgraded);
  const basketWeek = useBasketStore((s) => s.weekStart);
  const storeIds = useBasketStore((s) => s.storeIds);
  const computedEntitlement = useBasketStore((s) => s.entitlement);
  const orders = useOrderStore((s) => s.orders);
  const stale = useBasketIsStale();
  const weekOrder = lastOrderForWeek(orders, ws);

  const hasUnchecked = useMemo(() => (list?.items ?? []).some((i) => !i.checked), [list]);
  // Droits changés depuis le calcul (Premium souscrit, ou expiré) : un seul recalcul,
  // même si le serveur, pas encore au courant, rétrograde encore le panier.
  const rightsChanged = basketRightsChanged({ plan, entitlement: computedEntitlement }, sub.entitlement);

  // Calcul à l'arrivée (et au retour sur l'onglet) si la liste ou les magasins ont changé depuis.
  useEffect(() => {
    if (!hydrated || !isFocused || !hasUnchecked) return;
    if ((stale || rightsChanged) && status !== 'computing' && status !== 'error') {
      void useBasketStore.getState().compute();
    }
  }, [hydrated, isFocused, hasUnchecked, stale, rightsChanged, status]);

  const state = basketScreenState({ hydrated, list, status, plan, otherWeek: basketWeek !== ws });
  const updating = state === 'ready' && status === 'computing';

  const summary = useMemo(() => (plan ? receiptSummary(plan, catalog.storesById) : null), [plan, catalog]);
  const rows = useMemo(() => comparisonRows(comparisons, plan), [comparisons, plan]);
  const missing = useMemo(() => missingRows(plan, comparisons), [plan, comparisons]);
  const comparedChains = useMemo(
    () => comparedStoreIds(comparisons).map((id) => catalog.storesById[id]?.chain ?? id),
    [comparisons, catalog],
  );
  const gain = useMemo(
    () => (downgraded && !sub.isPremium ? cheapestGainCents(comparisons, plan, catalog.stores, { channel, storeIds }) : null),
    [downgraded, sub.isPremium, comparisons, plan, catalog, channel, storeIds],
  );
  const emptyReason = useMemo(
    () => (plan && plan.parts.length === 0 ? emptyBasketReason(comparisons, catalog.stores, { channel, storeIds }) : null),
    [plan, comparisons, catalog, channel, storeIds],
  );

  // ── Actions ───────────────────────────────────────────────────────────────
  const changeMode = async (next: BasketMode) => {
    await useBasketStore.getState().setMode(next);
    if (next === 'cheapest' && useBasketStore.getState().downgraded) haptics.warning();
  };
  const changeChannel = (next: OrderChannel) => void useBasketStore.getState().setChannel(next);
  // (Le retour haptique des boutons vient du kit : pas de doublon ici.)
  const retry = () => void useBasketStore.getState().compute();
  const goPremium = () => router.push('/premium' as Href);
  const openItem = (itemId: string) =>
    router.push({ pathname: '/comparateur/[itemId]', params: { itemId } } as unknown as Href);
  const openOrder = (storeId: string) =>
    router.push({ pathname: '/commande/[storeId]', params: { storeId } } as unknown as Href);

  // ── Rendu ─────────────────────────────────────────────────────────────────
  const subtitle =
    state === 'ready' && comparedChains.length > 0
      ? `${plural(rows.length, 'article comparé', 'articles comparés')} dans ${plural(comparedChains.length, 'enseigne')}`
      : undefined;

  return (
    <Screen
      title="Prix"
      eyebrow={`Semaine du ${formatWeekRange(ws)}`}
      subtitle={subtitle}
      bottomInset="none"
      contentContainerStyle={{ paddingBottom: t.spacing.xxxl }}
      testID="price-screen"
    >
      {state === 'loading' || state === 'computing' ? (
        <BasketSkeleton />
      ) : state === 'empty' ? (
        <EmptyState
          illustration={<EmptyBasket size={140} />}
          title="Rien à comparer"
          body="Planifie ta semaine : Cabas fait ta liste et compare les prix dans tes enseignes."
          action={{ label: 'Planifier ma semaine', leftIcon: CalendarDays, onPress: () => router.navigate('/' as Href) }}
          secondaryAction={{ label: 'Ajouter des articles', onPress: () => router.navigate('/liste' as Href) }}
        />
      ) : state === 'allChecked' ? (
        <EmptyState
          illustration={<EmptyList size={140} />}
          title="Tout est dans ton cabas"
          body="Tous les articles de ta liste sont cochés : rien à commander cette semaine."
          action={{ label: 'Voir ma liste', leftIcon: ListChecks, variant: 'secondary', onPress: () => router.navigate('/liste' as Href) }}
          secondaryAction={weekOrder ? { label: 'Voir ma commande', onPress: () => openOrder(weekOrder.storeId) } : undefined}
        />
      ) : state === 'error' ? (
        <EmptyState
          illustration={<CookingPot size={130} />}
          title="Les prix se font attendre"
          body="La comparaison n’a pas abouti. Ta liste, elle, reste dispo hors-ligne."
          action={{ label: 'Réessayer', leftIcon: RotateCcw, onPress: retry }}
        />
      ) : plan && summary ? (
        <View style={{ gap: t.spacing.xl }} testID="price-ready">
          <Animated.View entering={staggerEntering(0)}>
            <BasketControls
              mode={mode}
              channel={channel}
              isPremium={sub.isPremium}
              onModeChange={(m) => void changeMode(m)}
              onChannelChange={changeChannel}
              testID="basket-controls"
            />
          </Animated.View>

          {downgraded && sub.isPremium ? (
            // Premium tout juste souscrit : le serveur ne le sait pas encore.
            <Animated.View entering={FadeInDown.springify().damping(t.motion.spring.damping)} layout={LinearTransition}>
              <InfoBanner
                tone="info"
                title="Ton Premium s’active"
                message="Le panier le moins cher arrive dans un instant."
                action={{ label: 'Actualiser', onPress: retry }}
              />
            </Animated.View>
          ) : downgraded ? (
            <Animated.View entering={FadeInDown.springify().damping(t.motion.spring.damping)} layout={LinearTransition}>
              <InfoBanner
                tone="premium"
                icon={Crown}
                title="Le moins cher, c’est Premium"
                message={
                  gain
                    ? `${savingsLabel(gain)} cette semaine en répartissant tes courses sur 2 magasins, frais compris. En attendant, voici ton meilleur magasin.`
                    : 'Cabas répartit tes courses sur 2 magasins pour payer le moins possible. En attendant, voici ton meilleur magasin.'
                }
                action={{ label: `Essayer Premium ${PREMIUM_PRICING.trialDays} jours`, onPress: goPremium }}
              />
            </Animated.View>
          ) : null}

          {status === 'error' ? (
            <InfoBanner tone="danger" title="Prix pas à jour" message="Le dernier calcul a échoué." action={{ label: 'Réessayer', onPress: retry }} />
          ) : null}

          {emptyReason === 'not_in_catalog' ? (
            <InfoBanner tone="info" title="Rien à comparer" message="Ces articles ne sont pas encore dans notre catalogue." />
          ) : emptyReason ? (
            <InfoBanner
              tone="warning"
              title={emptyReason === 'no_delivery' ? 'Pas de livraison ici' : 'Aucun magasin disponible'}
              message={
                emptyReason === 'no_delivery'
                  ? 'Aucun de tes magasins ne livre. Passe en drive ou ajoute un magasin dans ton profil.'
                  : channel === 'delivery'
                    ? 'Tes magasins qui livrent ne vendent pas ces articles. Passe en drive ou ajoute un magasin dans ton profil.'
                    : 'Aucun de tes magasins ne vend ces articles. Ajoute un magasin dans ton profil.'
              }
              action={channel === 'delivery' ? { label: 'Passer en drive', onPress: () => changeChannel('drive') } : undefined}
            />
          ) : (
            <Animated.View entering={staggerEntering(1)}>
              <BasketReceipt summary={summary} channel={channel} header={MODE_HEADER[plan.mode]} updating={updating} testID="basket-receipt" />
            </Animated.View>
          )}

          {plan.parts.length > 0 ? (
            <View style={{ gap: t.spacing.md }}>
              <Animated.View entering={staggerEntering(2)}>
                <SectionHeader
                  title={plan.parts.length > 1 ? 'Tes magasins' : 'Ton magasin'}
                  subtitle={plan.parts.length > 1 ? 'Une commande par magasin.' : 'Le meilleur total pour toute ta liste.'}
                />
              </Animated.View>
              {plan.parts.map((part, i) => (
                <Animated.View key={part.storeId} entering={staggerEntering(3 + i)} layout={LinearTransition}>
                  <StorePartCard
                    part={part}
                    store={catalog.storesById[part.storeId]}
                    channel={channel}
                    productsById={catalog.productsById}
                    orderStatus={lastOrderForWeek(orders, ws, part.storeId)?.status ?? null}
                    onOrder={() => openOrder(part.storeId)}
                    onOpenItem={openItem}
                    testID={`store-part-${part.storeId}`}
                  />
                </Animated.View>
              ))}
            </View>
          ) : null}

          {rows.length > 0 ? (
            <View style={{ gap: t.spacing.md }}>
              <Animated.View entering={staggerEntering(4)}>
                <SectionHeader
                  title="Article par article"
                  subtitle="Meilleur prix, toutes enseignes."
                  right={comparedChains.length > 0 ? <StoreBadgeStack chains={comparedChains} size="xs" max={5} /> : null}
                />
              </Animated.View>
              <View
                style={[styles.card, { backgroundColor: t.colors.surface, borderRadius: t.radius.lg, paddingHorizontal: t.spacing.lg }]}
                testID="comparison-list"
              >
                {rows.map((row, i) => (
                  <Animated.View key={row.itemId} entering={staggerEntering(5 + i)}>
                    {i > 0 ? <Divider /> : null}
                    <ComparisonRow
                      row={row}
                      storesById={catalog.storesById}
                      totalStores={comparedChains.length}
                      onPress={() => openItem(row.itemId)}
                      testID={`compare-${i}`}
                    />
                  </Animated.View>
                ))}
              </View>
            </View>
          ) : null}

          {missing.length > 0 ? (
            <Animated.View entering={FadeIn.delay(t.motion.duration.slow)}>
              <MissingItems rows={missing} storesById={catalog.storesById} testID="missing-items" />
            </Animated.View>
          ) : null}

          <Text variant="footnote" color="textTertiary" align="center">
            Prix relevés en ligne, promos comprises. Ils peuvent varier en magasin.
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

const MODE_HEADER: Record<BasketMode, string> = {
  single_store: 'Un seul magasin',
  cheapest: 'Panier le moins cher',
};

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
});

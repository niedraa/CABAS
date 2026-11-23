/**
 * « Prix » — étape 4 du parcours : le comparateur de prix et le panier.
 *
 * - Panier « un seul magasin » (gratuit) ou « le moins cher » réparti sur
 *   2 magasins (Premium), frais de retrait / livraison compris ;
 * - ticket du panier : total, économie, une section par magasin → commande ;
 * - « Ta liste dans chaque enseigne » : total par magasin choisi ;
 * - détail article par article (meilleur prix, écart, MDD moins chère).
 * Les prix comparés sont ceux du ou des pays de tes magasins (France / Espagne).
 * Recalcul automatique dès que la liste change.
 */
import { router, useFocusEffect, type Href } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Crown, ListChecks, RefreshCw, Settings2, Store as StoreIcon, Truck } from 'lucide-react-native';

import { EmptyBasket } from '@/components/brand';
import { BasketReceipt, ItemPriceRow, StoreTotalsChart } from '@/components/feature/prices';
import {
  Button,
  Card,
  EmptyState,
  IconButton,
  InfoBanner,
  Screen,
  SectionHeader,
  SegmentedControl,
  Skeleton,
  Text,
} from '@/components/ui';
import {
  COUNTRY_FLAGS,
  COUNTRY_LABELS,
  formatPrice,
  restrictComparisons,
  storeDisplayName,
  storeTotals,
  type BasketMode,
  type OrderChannel,
} from '@/core';
import { useCurrentWeek, useSubscription } from '@/hooks';
import { haptics } from '@/lib/haptics';
import { useCatalog } from '@/services/catalog';
import { DEMO_DATA_NOTICE } from '@/data';
import { lastOrderForWeek, useBasketIsStale, useBasketStore, useOrderStore, useProfileStore, useWeekList } from '@/stores';
import { useTheme } from '@/theme';

const ITEMS_PREVIEW = 8;

export default function PricesScreen() {
  const t = useTheme();
  const catalog = useCatalog();
  const sub = useSubscription();
  const week = useCurrentWeek();
  const ws = week.activeWeekStart;
  const profile = useProfileStore((s) => s.profile);
  const list = useWeekList(ws);
  const basket = useBasketStore();
  const stale = useBasketIsStale();
  const orders = useOrderStore((s) => s.orders);
  const [showAllItems, setShowAllItems] = useState(false);

  const toBuy = useMemo(() => (list?.items ?? []).filter((i) => !i.checked), [list]);
  const preferred = useMemo(
    () => (profile?.preferredStoreIds ?? []).map((id) => catalog.storesById[id]).filter((s): s is NonNullable<typeof s> => !!s),
    [profile, catalog],
  );
  const countries = Array.from(new Set(preferred.map((s) => s.country)));

  // Recalcul automatique à l'arrivée sur l'écran si la liste a changé.
  useFocusEffect(
    useCallback(() => {
      const s = useBasketStore.getState();
      if (toBuy.length > 0 && stale && s.status !== 'computing') void s.compute();
    }, [toBuy.length, stale]),
  );

  const preferredComparisons = useMemo(
    () => restrictComparisons(basket.comparisons, preferred.map((s) => s.id)),
    [basket.comparisons, preferred],
  );
  const totals = useMemo(
    () =>
      storeTotals(preferredComparisons, preferred, { channel: basket.channel }).map((x) => {
        const store = catalog.storesById[x.storeId];
        return { ...x, store, name: storeDisplayName(store) };
      }),
    [preferredComparisons, preferred, basket.channel, catalog],
  );
  const sortedItems = useMemo(
    () => [...basket.comparisons].sort((a, b) => (a.best ? 0 : 1) - (b.best ? 0 : 1) || (b.best?.totalCents ?? 0) - (a.best?.totalCents ?? 0)),
    [basket.comparisons],
  );
  const alternativesSavings = basket.comparisons.reduce((s, c) => s + (c.cheaperAlternative?.savingsCents ?? 0), 0);

  const setMode = (mode: BasketMode) => {
    haptics.select();
    void useBasketStore.getState().setMode(mode);
  };
  const setChannel = (channel: OrderChannel) => {
    haptics.select();
    void useBasketStore.getState().setChannel(channel);
  };
  const order = (storeId: string) => {
    haptics.impact();
    router.push({ pathname: '/commande/[storeId]', params: { storeId } } as unknown as Href);
  };

  const subtitle =
    countries.length > 0
      ? `Prix ${countries.map((ct) => `${COUNTRY_FLAGS[ct]} ${COUNTRY_LABELS[ct]}`).join(' + ')} · ${preferred.length} enseigne${preferred.length > 1 ? 's' : ''}`
      : undefined;
  const headerRight = (
    <IconButton
      icon={Settings2}
      accessibilityLabel="Choisir mes magasins"
      variant="tonal"
      onPress={() => router.push('/parametres/magasins' as Href)}
      testID="prices-stores"
    />
  );

  if (toBuy.length === 0) {
    return (
      <Screen title="Prix" subtitle={subtitle} headerRight={headerRight} bottomInset="tabBar" testID="prices-screen">
        <EmptyState
          illustration={<EmptyBasket size={150} />}
          title={(list?.items.length ?? 0) > 0 ? 'Tout est dans le cabas' : 'Rien à comparer'}
          body={
            (list?.items.length ?? 0) > 0
              ? 'Tous les articles de ta liste sont cochés. Bonnes courses !'
              : 'Ta liste de courses est vide. Planifie tes repas : Cabas compare ensuite les prix de tes enseignes.'
          }
          action={{ label: 'Voir ma liste', leftIcon: ListChecks, onPress: () => router.navigate('/liste' as Href) }}
          style={{ marginTop: t.spacing.xl }}
        />
      </Screen>
    );
  }

  const computing = basket.status === 'computing';
  const plan = basket.plan;

  return (
    <Screen title="Prix" subtitle={subtitle} headerRight={headerRight} bottomInset="tabBar" testID="prices-screen">
      <View style={{ gap: t.spacing.lg }}>
        <SegmentedControl<BasketMode>
          options={[
            { value: 'single_store', label: 'Un seul magasin', icon: StoreIcon },
            { value: 'cheapest', label: 'Le moins cher', icon: sub.isPremium ? undefined : Crown },
          ]}
          value={basket.mode}
          onChange={setMode}
          accessibilityLabel="Type de panier"
          testID="basket-mode"
        />
        <SegmentedControl<OrderChannel>
          options={[
            { value: 'drive', label: 'Drive / magasin', icon: StoreIcon },
            { value: 'delivery', label: 'Livraison', icon: Truck },
          ]}
          value={basket.channel}
          onChange={setChannel}
          size="sm"
          accessibilityLabel="Retrait ou livraison"
          testID="basket-channel"
        />

        {basket.downgraded ? (
          <InfoBanner
            tone="premium"
            icon={Crown}
            title="Paye encore moins avec Premium"
            message="Le panier « le moins cher » répartit tes courses entre 2 magasins. En gratuit, Cabas choisit le meilleur magasin unique."
            action={{ label: 'Essayer 7 jours', onPress: () => router.push('/premium' as Href) }}
          />
        ) : null}

        {basket.status === 'error' ? (
          <InfoBanner
            tone="danger"
            title="Comparaison impossible"
            message={basket.error ?? 'Réessaie dans un instant.'}
            action={{ label: 'Réessayer', onPress: () => void useBasketStore.getState().compute() }}
          />
        ) : null}

        {/* Ticket du panier */}
        {computing && !plan ? (
          <View style={{ gap: t.spacing.md }} accessibilityLabel="Comparaison des prix en cours">
            <Skeleton height={180} radius={t.radius.lg} />
            <Skeleton height={60} radius={t.radius.lg} />
          </View>
        ) : plan && plan.parts.length > 0 ? (
          <Animated.View entering={FadeIn} style={{ opacity: computing ? 0.6 : 1 }}>
            <BasketReceipt
              plan={plan}
              storesById={catalog.storesById}
              nameOf={storeDisplayName}
              channel={basket.channel}
              onOrder={order}
              orderStatusOf={(storeId) => lastOrderForWeek(orders, ws, storeId)?.status ?? null}
              header={plan.mode === 'cheapest' ? 'Panier le moins cher' : 'Ton meilleur magasin'}
              testID="basket-receipt"
            />
          </Animated.View>
        ) : plan ? (
          <InfoBanner
            tone="warning"
            title={basket.channel === 'delivery' ? 'Pas de livraison possible' : 'Aucun magasin disponible'}
            message={
              basket.channel === 'delivery'
                ? 'Aucune de tes enseignes ne livre ce panier (minimum de commande ou livraison indisponible). Essaie le drive.'
                : 'Ajoute d’autres enseignes pour comparer les prix.'
            }
            action={basket.channel === 'delivery' ? { label: 'Passer en drive', onPress: () => setChannel('drive') } : undefined}
          />
        ) : null}

        {plan && plan.missingItemIds.length > 0 ? (
          <InfoBanner
            tone="info"
            title={`${plan.missingItemIds.length} article${plan.missingItemIds.length > 1 ? 's' : ''} hors panier`}
            message={`Introuvable${plan.missingItemIds.length > 1 ? 's' : ''} dans le magasin retenu : ${plan.missingItemIds
              .map((id) => basket.comparisons.find((c) => c.itemId === id)?.label ?? toBuy.find((i) => i.id === id)?.label)
              .filter(Boolean)
              .slice(0, 4)
              .join(', ')}${plan.missingItemIds.length > 4 ? '…' : ''}.`}
          />
        ) : null}

        {/* Totaux par enseigne */}
        {totals.length > 1 && basket.comparisons.length > 0 ? (
          <View>
            <SectionHeader title="Ta liste dans chaque enseigne" subtitle={basket.channel === 'delivery' ? 'Frais de livraison compris' : 'Frais de retrait compris'} />
            <Card variant="plain" padding="lg" radius="lg">
              <StoreTotalsChart
                totals={totals}
                itemCount={basket.comparisons.length}
                highlightStoreIds={plan?.parts.map((p) => p.storeId)}
                testID="store-totals"
              />
            </Card>
          </View>
        ) : null}

        {alternativesSavings > 0 ? (
          <InfoBanner
            tone="tip"
            title={`Jusqu’à ${formatPrice(alternativesSavings)} de plus à économiser`}
            message="Les marques distributeur (MDD) sont souvent aussi bonnes et moins chères. Touche un article pour choisir."
          />
        ) : null}

        {/* Article par article */}
        {basket.comparisons.length > 0 ? (
          <View>
            <SectionHeader
              title="Article par article"
              subtitle={`${basket.comparisons.length} article${basket.comparisons.length > 1 ? 's' : ''} comparé${basket.comparisons.length > 1 ? 's' : ''}`}
              right={
                <IconButton
                  icon={RefreshCw}
                  accessibilityLabel="Recalculer les prix"
                  variant="plain"
                  size="sm"
                  disabled={computing}
                  onPress={() => void useBasketStore.getState().compute()}
                />
              }
            />
            <Card variant="plain" padding="md" radius="lg">
              {(showAllItems ? sortedItems : sortedItems.slice(0, ITEMS_PREVIEW)).map((c) => {
                const best = c.best;
                const store = best ? catalog.storesById[best.storeId] : undefined;
                return (
                  <ItemPriceRow
                    key={c.itemId}
                    comparison={c}
                    bestStore={store}
                    bestStoreName={store ? storeDisplayName(store) : undefined}
                    productName={best ? catalog.productsById[best.productId]?.name : undefined}
                    onPress={() =>
                      router.push({ pathname: '/comparateur/[itemId]', params: { itemId: c.itemId } } as unknown as Href)
                    }
                    testID={`price-item-${c.itemId}`}
                  />
                );
              })}
              {sortedItems.length > ITEMS_PREVIEW ? (
                <Button
                  label={showAllItems ? 'Voir moins' : `Voir les ${sortedItems.length} articles`}
                  variant="ghost"
                  size="sm"
                  onPress={() => setShowAllItems((v) => !v)}
                  style={{ marginTop: t.spacing.xs }}
                  testID="prices-show-all"
                />
              ) : null}
            </Card>
          </View>
        ) : null}

        {catalog.source === 'local' ? (
          <Text variant="caption" color="textSecondary" align="center" style={{ marginTop: t.spacing.sm }}>
            {DEMO_DATA_NOTICE}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

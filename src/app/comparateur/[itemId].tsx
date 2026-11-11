/**
 * Détail des prix d'un article (feuille modale) : meilleure offre et écart
 * entre enseignes, une offre par enseigne (prix total, au kilo / litre,
 * promo, MDD, « meilleur prix », « dans ton panier », provenance : « Relevé le
 * 5 nov. · 3 relevés » ou « Estimé »), enseignes sans prix connu, puis choix
 * du produit dans le magasin du panier (`selectAlternative(itemId, productId |
 * null)` : le panier se recalcule) — jamais un produit contenant un allergène
 * déclaré du profil. Fiche Open Food Facts d'un produit à code-barres.
 */
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { RotateCcw, X } from 'lucide-react-native';

import { EmptyBasket } from '@/components/brand';
import {
  lineForItem,
  mddSignal,
  needLabel,
  OfferRow,
  plural,
  priceSpread,
  ProductChoiceRow,
  productChoices,
  savingsLabel,
  selectionFor,
  storeOfferRows,
  storesWithoutItem,
} from '@/components/feature/basket';
import { Button, EmptyState, IconButton, InfoBanner, PriceTag, SectionHeader, Sheet, staggerEntering, Text } from '@/components/ui';
import { allOffersForItem, formatPrice, formatPricePerUnit, hasEstimatedPrice, joinFr, storeDisplayName } from '@/core';
import { haptics } from '@/lib/haptics';
import { openExternalUrl } from '@/lib/links';
import { catalogIndexWithoutAllergens, useCatalog } from '@/services/catalog';
import { comparisonFor, useBasketStore, useProfileStore, useWeekList, useWeekStore } from '@/stores';
import { useTheme } from '@/theme';

const IS_WEB = Platform.OS === 'web';

export default function ComparatorScreen() {
  const t = useTheme();
  const c = t.colors;
  const { itemId = '' } = useLocalSearchParams<{ itemId?: string }>();
  const catalog = useCatalog();
  const ws = useWeekStore((s) => s.activeWeekStart);
  const today = useWeekStore((s) => s.today);
  const allergens = useProfileStore((s) => s.profile?.allergens);
  const list = useWeekList(ws);
  const comparison = useBasketStore((s) => comparisonFor(s, itemId));
  const plan = useBasketStore((s) => s.plan);
  const hasChoice = useBasketStore((s) => !!s.selectedAlternatives[itemId]);
  const computing = useBasketStore((s) => s.status === 'computing');
  const [visible, setVisible] = useState(true);

  const item = useMemo(() => list?.items.find((i) => i.id === itemId), [list, itemId]);
  const line = useMemo(() => lineForItem(plan, itemId), [plan, itemId]);
  // Index SANS les produits contenant un allergène déclaré : jamais proposés au choix.
  const safeIndex = useMemo(() => catalogIndexWithoutAllergens(catalog, allergens), [catalog, allergens]);
  const allOffers = useMemo(
    () => (item ? allOffersForItem(item, safeIndex, undefined, { excludeAllergens: allergens }) : []),
    [item, safeIndex, allergens],
  );
  const rows = useMemo(
    () => (comparison ? storeOfferRows(comparison, catalog.storesById, catalog.productsById, line) : []),
    [comparison, catalog, line],
  );
  const without = useMemo(() => (comparison ? storesWithoutItem(comparison, catalog.stores) : []), [comparison, catalog]);
  const choices = useMemo(
    () => (line ? productChoices(allOffers, line.storeId, catalog.productsById, line.productId, allergens ?? []) : []),
    [allOffers, line, catalog, allergens],
  );
  const mdd = comparison ? mddSignal(comparison) : null;

  const leaving = useRef(false);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/panier' as Href));
  /** Ferme la feuille (animation de sortie sur le web) puis la route. */
  const close = () => {
    if (leaving.current) return;
    leaving.current = true;
    if (!IS_WEB) {
      leave();
      return;
    }
    setVisible(false);
    setTimeout(leave, t.motion.duration.base + t.motion.stagger);
  };

  const choose = async (productId: string | null) => {
    await useBasketStore.getState().selectAlternative(itemId, productId);
    haptics.success();
  };
  const openProduct = (url: string) => void openExternalUrl(url);

  const best = comparison?.best ?? comparison?.offers[0];
  const bestStore = best ? catalog.storesById[best.storeId] : undefined;
  const lineStore = line ? catalog.storesById[line.storeId] : undefined;
  const lineStoreName = storeDisplayName(lineStore, { short: true });
  const spread = comparison ? priceSpread(comparison) : 0;
  const title = comparison?.label ?? item?.label ?? 'Article';
  const subtitle = item
    ? `Besoin : ${needLabel(item)}${item.recipeIds.length > 0 ? ` · ${plural(item.recipeIds.length, 'recette')}` : ''}`
    : undefined;

  const content =
    !comparison || !best ? (
      <EmptyState
        compact
        illustration={<EmptyBasket size={110} />}
        title={comparison ? 'Introuvable partout' : 'Article introuvable'}
        body={
          comparison
            ? 'Aucune de nos enseignes ne le vend : pense à l’acheter à part.'
            : 'Il a été coché ou retiré de ta liste entre-temps.'
        }
        action={{ label: 'Retour aux prix', onPress: close }}
      />
    ) : (
      <View style={{ gap: t.spacing.xl }} testID="comparator-content">
        {/* Résumé : meilleur prix et écart */}
        <Animated.View
          entering={staggerEntering(0)}
          style={[styles.summary, { backgroundColor: c.surface, borderRadius: t.radius.lg, padding: t.spacing.lg, gap: t.spacing.lg }]}
        >
          <View style={[styles.flex, { gap: t.spacing.xxs }]}>
            <Text variant="overline" color="textSecondary">
              Meilleur prix
            </Text>
            <PriceTag cents={best.totalCents} size="lg" best={false} color={c.priceBest} />
            <Text variant="footnote" color="textSecondary" tabular>
              chez {storeDisplayName(bestStore, { short: true })} · {formatPricePerUnit(best.pricePerBaseUnitCents, best.referenceUnit)}
              {hasEstimatedPrice(best) ? ' · estimé' : ''}
            </Text>
          </View>
          {spread > 0 ? (
            <View style={[styles.spread, { gap: t.spacing.xxs }]} accessible accessibilityLabel={`Jusqu’à ${formatPrice(spread)} d’écart entre ${comparison.offers.length} enseignes`}>
              <Text variant="overline" color="textSecondary" align="right">
                Écart
              </Text>
              <Text variant="title3" color="savings" tabular align="right">
                {formatPrice(spread)}
              </Text>
              <Text variant="footnote" color="textSecondary" align="right">
                sur {comparison.offers.length} enseignes
              </Text>
            </View>
          ) : null}
        </Animated.View>

        {/* Alternative MDD */}
        {mdd ? (
          <Animated.View entering={staggerEntering(1)} layout={LinearTransition}>
            {mdd.kind === 'available' ? (
              <InfoBanner
                tone="tip"
                title="Une marque distributeur moins chère"
                message={`${catalog.productsById[mdd.productId]?.name ?? 'La MDD'} chez ${storeDisplayName(catalog.storesById[mdd.storeId], {
                  short: true,
                })} : ${savingsLabel(mdd.savingsCents)} par rapport à la marque.`}
                action={{ label: 'Choisir la MDD', onPress: () => void choose(mdd.productId) }}
              />
            ) : (
              <InfoBanner
                tone="success"
                message={`Chez ${storeDisplayName(catalog.storesById[mdd.storeId], { short: true })}, la marque distributeur coûte ${formatPrice(
                  mdd.savingsCents,
                )} de moins que la marque.`}
              />
            )}
          </Animated.View>
        ) : null}

        {/* Offres par enseigne */}
        <View style={{ gap: t.spacing.sm }}>
          <SectionHeader title="Par enseigne" subtitle="Prix pour la quantité dont tu as besoin." />
          {rows.map((r, i) => (
            <Animated.View key={r.offer.storeId} entering={staggerEntering(2 + i)} layout={LinearTransition.springify().damping(t.motion.spring.damping)}>
              <OfferRow row={r} today={today} onOpenProduct={openProduct} testID={`offer-${r.offer.storeId}`} />
            </Animated.View>
          ))}
          {without.length > 0 ? (
            <Text variant="footnote" color="textSecondary" testID="comparator-without">
              Pas de prix connu chez {joinFr(without.map((s) => storeDisplayName(s, { short: true })))}.
            </Text>
          ) : null}
        </View>

        {/* Choix du produit dans le magasin du panier */}
        {line && choices.length > 1 ? (
          <View style={{ gap: t.spacing.sm }} accessibilityRole="radiogroup" accessibilityLabel={`Ton produit chez ${lineStoreName}`}>
            <SectionHeader title={`Ton produit chez ${lineStoreName}`} subtitle="Ton choix s’applique partout où il est vendu." />
            {choices.map((ch, i) => (
              <Animated.View key={ch.productId} entering={staggerEntering(4 + rows.length + i)}>
                <ProductChoiceRow
                  choice={ch}
                  today={today}
                  onOpenProduct={openProduct}
                  disabled={computing}
                  onPress={() => {
                    if (!ch.selected) void choose(selectionFor(ch));
                  }}
                  testID={`choice-${i}`}
                />
              </Animated.View>
            ))}
            {hasChoice ? (
              <Animated.View entering={FadeIn}>
                <Button
                  label="Revenir au moins cher"
                  variant="ghost"
                  size="sm"
                  leftIcon={RotateCcw}
                  onPress={() => void choose(null)}
                  hitSlop={(t.layout.minTouchTarget - t.controlHeight.sm) / 2}
                  style={styles.center}
                  testID="choice-reset"
                />
              </Animated.View>
            ) : null}
          </View>
        ) : null}

        {!line ? (
          <InfoBanner
            tone="neutral"
            title="Pas dans ton panier"
            message="Pas de prix connu dans tes magasins. Il reste dans ta liste : achète-le ailleurs."
          />
        ) : null}
      </View>
    );

  if (!IS_WEB) {
    // Natif : la route est déjà une feuille (formSheet, voir le layout racine).
    return (
      <ScrollView
        style={{ backgroundColor: c.surfaceElevated }}
        contentContainerStyle={{ padding: t.spacing.xl, paddingBottom: t.spacing.huge }}
        testID="comparator-sheet"
      >
        <View style={[styles.header, { marginBottom: t.spacing.lg, gap: t.spacing.md }]}>
          <View style={styles.flex}>
            <Text variant="title3" accessibilityRole="header">
              {title}
            </Text>
            {subtitle ? (
              <Text variant="footnote" color="textSecondary">
                {subtitle}
              </Text>
            ) : null}
          </View>
          <IconButton icon={X} variant="tonal" size="sm" accessibilityLabel="Fermer" onPress={close} />
        </View>
        {content}
      </ScrollView>
    );
  }

  // Web : fond transparent (l'onglet Prix reste visible) + feuille du kit.
  return (
    <View style={styles.root} pointerEvents="box-none">
      <Stack.Screen options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
      <Sheet visible={visible} onClose={close} title={title} subtitle={subtitle} snapPoints={[0.88]} scrollable testID="comparator-sheet">
        {content}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start' },
  summary: { flexDirection: 'row', alignItems: 'flex-start' },
  spread: { alignItems: 'flex-end' },
  center: { alignSelf: 'center' },
});

/**
 * Détail des prix d'un article (feuille) : besoin (quantité), offres de
 * chaque enseigne comparée (prix, prix au kilo, promo, MDD), et choix du
 * produit à mettre dans le panier (ex. marque distributeur moins chère).
 */
import { type Href } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Check, ExternalLink, RotateCcw } from 'lucide-react-native';

import { EmptyBasket } from '@/components/brand';
import { SheetRoute, useSheetRouteClose } from '@/components/feature/common';
import { itemQuantityLabel } from '@/components/feature/list';
import { Badge, Button, Card, EmptyState, PressableScale, PriceTag, StoreBadge, Text, useToast } from '@/components/ui';
import { allOffersForItem, formatPrice, storeDisplayName, type Price, type Product, type Store, type StoreOffer } from '@/core';
import { haptics } from '@/lib/haptics';
import { comparisonScope } from '@/services/basket';
import { useCatalog } from '@/services/catalog';
import { openProductOnStoreSite } from '@/services/order';
import { useBasketStore, useProfileStore, useWeekList } from '@/stores';
import { useTheme } from '@/theme';

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** « 12 oct. 2026 » à partir d'un horodatage ISO. */
function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '';
}

export default function ItemPricesScreen() {
  const t = useTheme();
  const c = t.colors;
  const toast = useToast();
  const { itemId } = useLocalSearchParams<{ itemId?: string }>();
  const { visible, close } = useSheetRouteClose('/panier' as Href);
  const catalog = useCatalog();
  const list = useWeekList();
  const profile = useProfileStore((s) => s.profile);
  const chosen = useBasketStore((s) => (itemId ? s.selectedAlternatives[itemId] : undefined));
  const item = list?.items.find((i) => i.id === itemId) ?? null;
  const preferred = useMemo(() => new Set(profile?.preferredStoreIds ?? []), [profile]);

  const offers = useMemo(() => {
    if (!item) return [] as StoreOffer[];
    const scope = new Set(comparisonScope(profile?.preferredStoreIds ?? [], catalog));
    return allOffersForItem(item, catalog.index).filter((o) => scope.has(o.storeId));
  }, [item, profile, catalog]);

  // Un produit par ligne : meilleure offre parmi TES enseignes, sinon toutes.
  const products = useMemo(() => {
    const byProduct = new Map<string, StoreOffer[]>();
    for (const o of offers) {
      const l = byProduct.get(o.productId);
      if (l) l.push(o);
      else byProduct.set(o.productId, [o]);
    }
    return Array.from(byProduct.entries())
      .map(([productId, list]) => {
        const mine = list.filter((o) => preferred.has(o.storeId));
        const best = (mine.length > 0 ? mine : list)[0];
        return { productId, best, inMyStores: mine.length > 0, storeCount: list.length };
      })
      .sort((a, b) => Number(b.inMyStores) - Number(a.inMyStores) || a.best.totalCents - b.best.totalCents);
  }, [offers, preferred]);

  // Meilleure offre par enseigne.
  const byStore = useMemo(() => {
    const seen = new Set<string>();
    const out: StoreOffer[] = [];
    for (const o of offers) {
      if (seen.has(o.storeId)) continue;
      seen.add(o.storeId);
      out.push(o);
    }
    return out;
  }, [offers]);
  const cheapest = byStore[0]?.totalCents ?? 0;
  // Relevé (source, date) de chaque prix affiché.
  const priceIndex = useMemo(() => {
    const ids = new Set(offers.map((o) => o.productId));
    const map = new Map<string, Price>();
    for (const p of catalog.prices) if (ids.has(p.productId)) map.set(`${p.productId}|${p.storeId}`, p);
    return map;
  }, [offers, catalog]);
  const openOnSite = async (store: Store, product: Product) => {
    const ok = await openProductOnStoreSite(store, product);
    if (!ok) toast.show({ title: 'Impossible d’ouvrir le site', tone: 'danger' });
  };

  const choose = (productId: string | null) => {
    if (!itemId) return;
    haptics.success();
    void useBasketStore.getState().selectAlternative(itemId, productId);
    const p = productId ? catalog.productsById[productId] : null;
    toast.show({
      title: productId ? 'Produit choisi' : 'Meilleur prix rétabli',
      message: p ? `${p.name} (${p.brand}) dans ton panier.` : undefined,
      tone: 'success',
    });
    close();
  };

  const title = item?.label ?? 'Article';
  const subtitle = item ? `Besoin : ${itemQuantityLabel(item)} · ${byStore.length} enseigne${byStore.length > 1 ? 's' : ''}` : undefined;

  return (
    <SheetRoute visible={visible} onClose={close} title={title} subtitle={subtitle} testID="item-prices">
      {!item || offers.length === 0 ? (
        <EmptyState
          compact
          illustration={<EmptyBasket size={110} />}
          title={item ? 'Introuvable dans tes enseignes' : 'Cet article n’est plus dans ta liste'}
          body={item ? 'Aucun magasin comparé ne référence ce produit. Ajoute d’autres enseignes pour élargir la recherche.' : undefined}
          action={{ label: 'Fermer', onPress: close }}
        />
      ) : (
        <View style={{ gap: t.spacing.xl }}>
          <View style={{ gap: t.spacing.sm }}>
            <Text variant="overline" color="textSecondary">
              Prix par enseigne
            </Text>
            <Card variant="plain" padding="md" radius="lg">
              {byStore.map((o) => {
                const store = catalog.storesById[o.storeId];
                const product = catalog.productsById[o.productId];
                if (!store || !product) return null;
                const name = storeDisplayName(store);
                const mine = preferred.has(store.id);
                const price = priceIndex.get(`${o.productId}|${o.storeId}`);
                const provenance = price && price.source !== 'demo' ? `Relevé le ${formatDateShort(price.updatedAt)}` : 'Prix estimé';
                return (
                  <PressableScale
                    key={o.storeId}
                    onPress={() => void openOnSite(store, product)}
                    haptic="tap"
                    scaleTo={0.98}
                    accessibilityRole="link"
                    accessibilityLabel={`${name} : ${formatPrice(o.totalCents)}, ${product.name}. ${provenance}. Ouvrir sur le site.`}
                    style={[styles.row, { paddingVertical: t.spacing.sm }]}
                    testID={`store-offer-${o.storeId}`}
                  >
                    <StoreBadge chain={store.chain} name={name} size="sm" />
                    <View style={styles.flex}>
                      <View style={styles.inline}>
                        <Text variant="bodyMedium" numberOfLines={1} style={styles.shrink}>
                          {name}
                        </Text>
                        {mine ? <Badge label="Mon magasin" size="sm" tone="success" /> : null}
                      </View>
                      <Text variant="footnote" color="textSecondary" numberOfLines={1}>
                        {o.packs} × {product.name} · {product.brand}
                      </Text>
                      <View style={[styles.inline, { marginTop: 2 }]}>
                        <Text variant="caption" color={price && price.source !== 'demo' ? 'success' : 'textSecondary'}>
                          {provenance}
                        </Text>
                        <ExternalLink size={t.iconSize.xs} color={c.textSecondary} />
                        <Text variant="caption" color="textSecondary">
                          Voir sur le site
                        </Text>
                      </View>
                    </View>
                    <PriceTag
                      cents={o.totalCents}
                      size="sm"
                      align="right"
                      best={o.totalCents === cheapest}
                      perUnit={{ cents: o.pricePerBaseUnitCents, unit: o.referenceUnit }}
                    />
                  </PressableScale>
                );
              })}
            </Card>
          </View>

          <View style={{ gap: t.spacing.sm }}>
            <Text variant="overline" color="textSecondary">
              Choisir le produit
            </Text>
            {products.map(({ productId, best, inMyStores, storeCount }) => {
              const p = catalog.productsById[productId];
              const store = catalog.storesById[best.storeId];
              if (!p || !store) return null;
              const selected = chosen === productId;
              return (
                <PressableScale
                  key={productId}
                  onPress={() => choose(productId)}
                  haptic="none"
                  scaleTo={0.98}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`${p.name}, ${p.brand}, ${formatPrice(best.totalCents)} chez ${storeDisplayName(store)}`}
                  style={[
                    styles.product,
                    {
                      borderRadius: t.radius.lg,
                      padding: t.spacing.md,
                      backgroundColor: selected ? c.primarySoft : c.surface,
                      borderColor: selected ? c.primary : c.border,
                      opacity: inMyStores ? 1 : 0.75,
                    },
                  ]}
                  testID={`product-${productId}`}
                >
                  <View style={styles.flex}>
                    <Text variant="bodyMedium" numberOfLines={2}>
                      {p.name}
                    </Text>
                    <Text variant="footnote" color="textSecondary">
                      {p.brand} · {inMyStores ? `chez ${storeDisplayName(store)}` : 'pas dans tes enseignes'}
                      {storeCount > 1 ? ` · ${storeCount} enseignes` : ''}
                    </Text>
                    <View style={[styles.inline, { marginTop: 4 }]}>
                      {p.verified ? <Badge label="Produit réel" tone="success" size="sm" /> : null}
                      {p.isStoreBrand ? <Badge label="Marque distributeur" tone="info" size="sm" /> : null}
                      {p.organic ? <Badge label="Bio" tone="success" size="sm" emoji="🌱" /> : null}
                      {p.nutriScore ? <Badge label={`Nutri-Score ${p.nutriScore}`} size="sm" /> : null}
                      {best.isPromo ? <Badge label="Promo" tone="danger" size="sm" /> : null}
                    </View>
                  </View>
                  <View style={styles.right}>
                    <PriceTag cents={best.totalCents} size="sm" align="right" />
                    {selected ? <Check size={t.iconSize.sm} color={c.primary} /> : null}
                  </View>
                </PressableScale>
              );
            })}
            {chosen ? (
              <Button label="Revenir au meilleur prix" variant="ghost" leftIcon={RotateCcw} onPress={() => choose(null)} testID="reset-choice" />
            ) : null}
          </View>
        </View>
      )}
    </SheetRoute>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, gap: 2 },
  shrink: { flexShrink: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  product: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
});

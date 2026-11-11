/**
 * Détail d'un article : une offre par enseigne (prix total, prix au kilo /
 * litre, promo, MDD, « dans ton panier », « meilleur prix ») avec la
 * PROVENANCE du prix (« Relevé le 5 nov. · 3 relevés », badge « Estimé »), et
 * une ligne de choix de produit (bouton radio) pour la sélection d'une
 * alternative. Un produit à code-barres ouvre sa fiche Open Food Facts
 * (bouton à part, jamais imbriqué dans la ligne lue).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated';
import { Info, ShoppingBasket } from 'lucide-react-native';

import { Badge, IconButton, PressableScale, PriceTag, StoreBadge, Text } from '@/components/ui';
import type { Product } from '@/core';
import { formatPrice, formatPricePerUnit, storeDisplayName } from '@/core';
import { formatPriceForA11y } from '@/lib/a11y';
import { useTheme } from '@/theme';

import { packsLabel } from './basketView';
import type { ProductChoice, StoreOfferRow } from './comparatorView';
import { offProductUrl, priceProvenance } from './provenanceView';

/** Bouton « Fiche Open Food Facts » (cible ≥ 44 pt), si le produit a un code-barres. */
function ProductSheetLink({ product, onOpen, testID }: { product: Product | undefined; onOpen?: (url: string) => void; testID?: string }) {
  const t = useTheme();
  const url = offProductUrl(product);
  if (!url || !onOpen || !product) return null;
  return (
    <IconButton
      icon={Info}
      size="sm"
      variant="plain"
      color={t.colors.textSecondary}
      accessibilityRole="link"
      accessibilityLabel={`Fiche Open Food Facts : ${product.name}`}
      accessibilityHint="Ouvre la fiche du produit dans ton navigateur"
      onPress={() => onOpen(url)}
      testID={testID}
    />
  );
}

export interface OfferRowProps {
  row: StoreOfferRow;
  /** Jour ISO courant (dates relatives des relevés). */
  today: string;
  /** Ouvre un lien externe (fiche Open Food Facts) ; sans lui, pas de bouton. */
  onOpenProduct?: (url: string) => void;
  testID?: string;
}

export function OfferRow({ row, today, onOpenProduct, testID }: OfferRowProps) {
  const t = useTheme();
  const c = t.colors;
  const { offer, store, product } = row;
  const name = storeDisplayName(store, { short: true, fallback: offer.storeId });
  const qty = packsLabel(offer.packs, product);
  const prov = priceProvenance(offer, today);
  const estimated = prov.kind === 'estimate';
  const a11y = [
    name,
    product ? `${product.name}${product.brand ? `, ${product.brand}` : ''}` : '',
    qty,
    formatPriceForA11y(offer.totalCents),
    row.isBest ? 'meilleur prix' : row.extraCents > 0 ? `${formatPriceForA11y(row.extraCents)} de plus` : '',
    prov.a11y ?? '',
    offer.isPromo ? 'en promo' : '',
    offer.isStoreBrand ? 'marque distributeur' : '',
    row.inBasket ? 'dans ton panier' : '',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <View
      testID={testID}
      style={[
        styles.row,
        {
          gap: t.spacing.xs,
          padding: t.spacing.md,
          borderRadius: t.radius.lg,
          borderWidth: t.spacing.xxs,
          backgroundColor: c.surface,
          borderColor: row.inBasket ? c.primary : c.surface,
        },
      ]}
    >
      <View accessible accessibilityLabel={a11y} style={[styles.row, styles.flex, { gap: t.spacing.md }]}>
        <StoreBadge chain={store?.chain ?? offer.storeId} name={store?.name} size="md" />
        <View style={[styles.flex, { gap: t.spacing.xxs }]}>
          <Text variant="headline" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="footnote" color="textSecondary" numberOfLines={1}>
            {product?.brand ? `${product.brand} · ${qty}` : qty}
          </Text>
          {prov.text ? (
            <Text variant="caption" color="textSecondary" numberOfLines={1} testID={testID ? `${testID}-provenance` : undefined}>
              {prov.text}
            </Text>
          ) : null}
          {estimated || offer.isPromo || offer.isStoreBrand || row.inBasket ? (
            <View style={[styles.badges, { gap: t.spacing.xs, marginTop: t.spacing.xxs }]}>
              {row.inBasket ? <Badge label="Dans ton panier" icon={ShoppingBasket} tone="info" size="sm" /> : null}
              {estimated ? <Badge label="Estimé" tone="neutral" size="sm" accessibilityLabel="Prix estimé" /> : null}
              {offer.isPromo ? <Badge label="Promo" tone="accent" size="sm" /> : null}
              {offer.isStoreBrand ? <Badge label="MDD" size="sm" accessibilityLabel="Marque distributeur" /> : null}
            </View>
          ) : null}
        </View>
        <View style={styles.price}>
          <PriceTag
            cents={offer.totalCents}
            size="md"
            best={row.isBest}
            align="right"
            perUnit={{ cents: offer.pricePerBaseUnitCents, unit: offer.referenceUnit }}
          />
          {!row.isBest && row.extraCents > 0 ? (
            <Text variant="caption" color="textSecondary" tabular>
              +{formatPrice(row.extraCents)}
            </Text>
          ) : null}
        </View>
      </View>
      <ProductSheetLink product={product} onOpen={onOpenProduct} testID={testID ? `${testID}-sheet` : undefined} />
    </View>
  );
}

export interface ProductChoiceRowProps {
  choice: ProductChoice;
  onPress: () => void;
  /** Jour ISO courant (dates relatives des relevés). */
  today: string;
  /** Ouvre un lien externe (fiche Open Food Facts) ; sans lui, pas de bouton. */
  onOpenProduct?: (url: string) => void;
  disabled?: boolean;
  testID?: string;
}

export function ProductChoiceRow({ choice, onPress, today, onOpenProduct, disabled, testID }: ProductChoiceRowProps) {
  const t = useTheme();
  const c = t.colors;
  const { offer, product } = choice;
  const dot = useDerivedValue(() => withSpring(choice.selected ? 1 : 0, t.motion.springBouncy), [choice.selected]);
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: dot.get() }], opacity: dot.get() }));
  const title = product?.name ?? 'Produit';
  const qty = packsLabel(offer.packs, product);
  const prov = priceProvenance(offer, today);
  const estimated = prov.kind === 'estimate';
  const a11y = [
    title,
    product?.brand ?? '',
    qty,
    formatPriceForA11y(offer.totalCents),
    choice.isAuto ? 'le moins cher' : '',
    prov.a11y ?? '',
    product?.organic ? 'bio' : '',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <View
      style={[
        styles.row,
        {
          gap: t.spacing.xs,
          paddingRight: t.spacing.xs,
          borderRadius: t.radius.lg,
          borderWidth: t.spacing.xxs,
          backgroundColor: c.surface,
          borderColor: choice.selected ? c.primary : c.border,
          opacity: disabled ? t.opacity.disabled : 1,
        },
      ]}
    >
      <PressableScale
        onPress={onPress}
        disabled={disabled}
        haptic="select"
        scaleTo={0.98}
        accessibilityRole="radio"
        accessibilityState={{ checked: choice.selected, disabled: !!disabled }}
        accessibilityLabel={a11y}
        testID={testID}
        style={[styles.row, styles.flex, { gap: t.spacing.md, padding: t.spacing.md, minHeight: t.layout.minTouchTarget }]}
      >
        <View
          style={[
            styles.radio,
            {
              width: t.iconSize.lg,
              height: t.iconSize.lg,
              borderRadius: t.radius.pill,
              borderWidth: t.spacing.xxs,
              borderColor: choice.selected ? c.primary : c.borderStrong,
            },
          ]}
        >
          <Animated.View
            style={[
              { width: t.iconSize.xs - t.spacing.xxs, height: t.iconSize.xs - t.spacing.xxs, borderRadius: t.radius.pill, backgroundColor: c.primary },
              dotStyle,
            ]}
          />
        </View>
        <View style={[styles.flex, { gap: t.spacing.xxs }]}>
          <Text variant="bodyMedium" numberOfLines={2}>
            {title}
          </Text>
          <Text variant="footnote" color="textSecondary" numberOfLines={1}>
            {product?.brand ? `${product.brand} · ${qty}` : qty}
          </Text>
          {prov.text ? (
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {prov.text}
            </Text>
          ) : null}
          {choice.isAuto || estimated || offer.isStoreBrand || offer.isPromo || product?.organic ? (
            <View style={[styles.badges, { gap: t.spacing.xs, marginTop: t.spacing.xxs }]}>
              {choice.isAuto ? <Badge label="Le moins cher" tone="success" size="sm" /> : null}
              {estimated ? <Badge label="Estimé" tone="neutral" size="sm" accessibilityLabel="Prix estimé" /> : null}
              {offer.isPromo ? <Badge label="Promo" tone="accent" size="sm" /> : null}
              {offer.isStoreBrand ? <Badge label="MDD" size="sm" accessibilityLabel="Marque distributeur" /> : null}
              {product?.organic ? <Badge label="Bio" tone="success" size="sm" /> : null}
            </View>
          ) : null}
        </View>
        <View style={styles.price}>
          <Text variant="price" tabular color={choice.isAuto ? 'priceBest' : 'text'}>
            {formatPrice(offer.totalCents)}
          </Text>
          <Text variant="caption" color="textSecondary" tabular>
            {formatPricePerUnit(offer.pricePerBaseUnitCents, offer.referenceUnit)}
          </Text>
        </View>
      </PressableScale>
      <ProductSheetLink product={product} onOpen={onOpenProduct} testID={testID ? `${testID}-sheet` : undefined} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  price: { alignItems: 'flex-end' },
  radio: { alignItems: 'center', justifyContent: 'center' },
});

/**
 * Détail d'un article : une offre par enseigne (prix total, prix au kilo /
 * litre, promo, MDD, « dans ton panier », « meilleur prix »), et une ligne
 * de choix de produit (bouton radio) pour la sélection d'une alternative.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated';
import { ShoppingBasket } from 'lucide-react-native';

import { Badge, PressableScale, PriceTag, StoreBadge, Text } from '@/components/ui';
import { formatPrice, formatPricePerUnit } from '@/core';
import { formatPriceForA11y } from '@/lib/a11y';
import { useTheme } from '@/theme';

import { packsLabel, storeShortName } from './basketView';
import type { ProductChoice, StoreOfferRow } from './comparatorView';

export function OfferRow({ row, testID }: { row: StoreOfferRow; testID?: string }) {
  const t = useTheme();
  const c = t.colors;
  const { offer, store, product } = row;
  const name = storeShortName(store);
  const qty = packsLabel(offer.packs, product);
  const a11y = [
    name,
    product ? `${product.name}${product.brand ? `, ${product.brand}` : ''}` : '',
    qty,
    formatPriceForA11y(offer.totalCents),
    row.isBest ? 'meilleur prix' : row.extraCents > 0 ? `${formatPriceForA11y(row.extraCents)} de plus` : '',
    offer.isPromo ? 'en promo' : '',
    offer.isStoreBrand ? 'marque distributeur' : '',
    row.inBasket ? 'dans ton panier' : '',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={a11y}
      style={[
        styles.row,
        {
          gap: t.spacing.md,
          padding: t.spacing.md,
          borderRadius: t.radius.lg,
          borderWidth: t.spacing.xxs,
          backgroundColor: c.surface,
          borderColor: row.inBasket ? c.primary : c.surface,
        },
      ]}
    >
      <StoreBadge chain={store?.chain ?? offer.storeId} name={store?.name} size="md" />
      <View style={[styles.flex, { gap: t.spacing.xxs }]}>
        <Text variant="headline" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="footnote" color="textSecondary" numberOfLines={1}>
          {product ? `${product.brand} · ${qty}` : qty}
        </Text>
        {offer.isPromo || offer.isStoreBrand || row.inBasket ? (
          <View style={[styles.badges, { gap: t.spacing.xs, marginTop: t.spacing.xxs }]}>
            {row.inBasket ? <Badge label="Dans ton panier" icon={ShoppingBasket} tone="info" size="sm" /> : null}
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
  );
}

export interface ProductChoiceRowProps {
  choice: ProductChoice;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

export function ProductChoiceRow({ choice, onPress, disabled, testID }: ProductChoiceRowProps) {
  const t = useTheme();
  const c = t.colors;
  const { offer, product } = choice;
  const dot = useDerivedValue(() => withSpring(choice.selected ? 1 : 0, t.motion.springBouncy), [choice.selected]);
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: dot.get() }], opacity: dot.get() }));
  const title = product?.name ?? 'Produit';
  const qty = packsLabel(offer.packs, product);
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic="select"
      scaleTo={0.98}
      accessibilityRole="radio"
      accessibilityState={{ checked: choice.selected, disabled: !!disabled }}
      accessibilityLabel={`${title}${product?.brand ? `, ${product.brand}` : ''}, ${qty}, ${formatPriceForA11y(offer.totalCents)}${
        choice.isAuto ? ', le moins cher' : ''
      }`}
      testID={testID}
      style={[
        styles.row,
        {
          gap: t.spacing.md,
          padding: t.spacing.md,
          minHeight: t.layout.minTouchTarget,
          borderRadius: t.radius.lg,
          borderWidth: t.spacing.xxs,
          backgroundColor: c.surface,
          borderColor: choice.selected ? c.primary : c.border,
          opacity: disabled ? t.opacity.disabled : 1,
        },
      ]}
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
        {choice.isAuto || offer.isStoreBrand || offer.isPromo || product?.organic ? (
          <View style={[styles.badges, { gap: t.spacing.xs, marginTop: t.spacing.xxs }]}>
            {choice.isAuto ? <Badge label="Le moins cher" tone="success" size="sm" /> : null}
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
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  price: { alignItems: 'flex-end' },
  radio: { alignItems: 'center', justifyContent: 'center' },
});

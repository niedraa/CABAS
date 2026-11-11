/**
 * Un magasin du panier : monogramme, nombre d'articles (« dont 2 prix
 * estimés »), service (drive, click & collect, en magasin, livraison),
 * sous-total, lignes (repliées au-delà de 3, dépliage au ressort ; « prix
 * estimé » signalé), frais, puis le CTA « Commander chez <enseigne> » (« Ma
 * liste pour <enseigne> » sans commande en ligne). Une commande déjà validée
 * cette semaine est signalée et le CTA devient « Voir ma commande ». Part sous
 * le minimum de commande (faute d'autre choix) : montant manquant signalé.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition, useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated';
import { ArrowRight, ChevronDown, CircleCheck, ExternalLink } from 'lucide-react-native';

import { Badge, Button, Divider, InfoBanner, PressableScale, StoreBadge, Text } from '@/components/ui';
import type { BasketStorePart, OrderChannel, OrderHandoff, Product, Store } from '@/core';
import { formatPrice, hasEstimatedPrice, storeDisplayName } from '@/core';
import { formatPriceForA11y } from '@/lib/a11y';
import { boxShadow, useTheme } from '@/theme';

import {
  COLLAPSED_LINES,
  estimatedCount,
  estimatedNote,
  feesLabel,
  minOrderWarning,
  orderCtaLabel,
  packsLabel,
  plural,
  serviceLabel,
  visibleLines,
} from './basketView';

export interface StorePartCardProps {
  part: BasketStorePart;
  store: Store | undefined;
  channel: OrderChannel;
  productsById: Record<string, Product>;
  /** Statut de la dernière commande de la semaine pour ce magasin. */
  orderStatus?: OrderHandoff['status'] | null;
  onOrder: () => void;
  onOpenItem?: (itemId: string) => void;
  testID?: string;
}

export function StorePartCard({ part, store, channel, productsById, orderStatus, onOrder, onOpenItem, testID }: StorePartCardProps) {
  const t = useTheme();
  const c = t.colors;
  const [expanded, setExpanded] = useState(false);
  const lines = visibleLines(part, expanded);
  const hidden = part.lines.length - COLLAPSED_LINES;
  const name = storeDisplayName(store, { fallback: part.storeId });
  const short = storeDisplayName(store, { short: true });
  const service = serviceLabel(store, channel);
  const estimated = estimatedCount(part.lines);
  const minOrder = minOrderWarning(part, store);
  const articles = `${plural(part.lines.length, 'article')}${estimated > 0 ? `, ${estimatedNote(estimated)}` : ''}`;

  const rotation = useDerivedValue(() => withSpring(expanded ? 180 : 0, t.motion.springIndicator), [expanded]);
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.get()}deg` }] }));

  const confirmed = orderStatus === 'confirmed';
  const inProgress = orderStatus === 'opened';

  return (
    <Animated.View
      testID={testID}
      layout={LinearTransition.springify().damping(t.motion.spring.damping).stiffness(t.motion.spring.stiffness)}
      style={[
        styles.card,
        {
          backgroundColor: c.surface,
          borderRadius: t.radius.xl,
          padding: t.spacing.lg,
          gap: t.spacing.md,
          boxShadow: boxShadow('sm', c.shadow),
        },
      ]}
    >
      <View
        style={[styles.row, { gap: t.spacing.md }]}
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${name}, ${articles}, ${service}, ${formatPriceForA11y(part.subtotalCents)}`}
      >
        <StoreBadge chain={store?.chain ?? part.storeId} name={name} size="lg" />
        <View style={styles.flex}>
          <Text variant="headline" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="footnote" color="textSecondary" testID={testID ? `${testID}-meta` : undefined}>
            {articles} · {service}
          </Text>
        </View>
        <Text variant="price" tabular>
          {formatPrice(part.subtotalCents)}
        </Text>
      </View>

      {confirmed || inProgress ? (
        <Badge
          icon={confirmed ? CircleCheck : ExternalLink}
          label={confirmed ? 'Commande validée cette semaine' : 'Commande en cours chez l’enseigne'}
          tone={confirmed ? 'success' : 'accent'}
        />
      ) : null}

      <Divider variant="dashed" />

      <View style={{ gap: t.spacing.xxs }}>
        {lines.map((l, i) => {
          const product = productsById[l.productId];
          const qty = packsLabel(l.packs, product);
          const isEstimate = hasEstimatedPrice(l);
          return (
            <Animated.View key={l.itemId} entering={i >= COLLAPSED_LINES ? FadeIn.delay((i - COLLAPSED_LINES) * t.motion.stagger * 0.5) : undefined}>
              <PressableScale
                onPress={onOpenItem ? () => onOpenItem(l.itemId) : undefined}
                disabled={!onOpenItem}
                dimOnPress
                scaleTo={0.99}
                accessibilityLabel={`${l.label}, ${qty}, ${formatPriceForA11y(l.totalCents)}${isEstimate ? ', prix estimé' : ''}`}
                accessibilityHint={onOpenItem ? 'Compare les prix de cet article' : undefined}
                style={[styles.line, { gap: t.spacing.md, minHeight: t.layout.minTouchTarget }]}
                testID={testID ? `${testID}-line-${i}` : undefined}
              >
                <View style={styles.flex}>
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {l.label}
                  </Text>
                  <Text variant="caption" color="textSecondary" numberOfLines={1} tabular>
                    {qty}
                    {isEstimate ? ' · prix estimé' : ''}
                  </Text>
                </View>
                <Text variant="subhead" tabular>
                  {formatPrice(l.totalCents)}
                </Text>
              </PressableScale>
            </Animated.View>
          );
        })}
      </View>

      {hidden > 0 ? (
        <PressableScale
          onPress={() => setExpanded((v) => !v)}
          haptic="select"
          accessibilityLabel={expanded ? 'Replier la liste' : `Voir les ${part.lines.length} articles`}
          accessibilityState={{ expanded }}
          style={[styles.toggle, { gap: t.spacing.xs, minHeight: t.layout.minTouchTarget }]}
          testID={testID ? `${testID}-toggle` : undefined}
        >
          <Text variant="subhead" color="primary" style={{ fontFamily: t.typography.headline.fontFamily }}>
            {expanded ? 'Replier' : `Voir les ${part.lines.length} articles`}
          </Text>
          <Animated.View style={chevronStyle}>
            <ChevronDown size={t.iconSize.sm} color={c.primary} strokeWidth={2.4} />
          </Animated.View>
        </PressableScale>
      ) : null}

      {part.feesCents > 0 ? (
        <View style={[styles.row, { gap: t.spacing.sm }]}>
          <Text variant="footnote" color="textSecondary" style={styles.flex}>
            {feesLabel(channel)}
          </Text>
          <Text variant="footnote" color="textSecondary" tabular>
            {formatPrice(part.feesCents)}
          </Text>
        </View>
      ) : null}

      {minOrder ? (
        <View testID={testID ? `${testID}-min-order` : undefined}>
          <InfoBanner tone="warning" title={minOrder.title} message={minOrder.message} />
        </View>
      ) : null}

      <Button
        label={confirmed ? 'Voir ma commande' : orderCtaLabel(store)}
        variant={confirmed ? 'tonal' : 'primary'}
        rightIcon={ArrowRight}
        fullWidth
        onPress={onOrder}
        accessibilityHint={
          store?.pickup === 'none' && channel === 'drive'
            ? `Prépare ta liste de courses pour ${short}`
            : `Prépare ta commande ${service.toLowerCase()} chez ${short}`
        }
        testID={testID ? `${testID}-order` : undefined}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {},
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  line: { flexDirection: 'row', alignItems: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
});

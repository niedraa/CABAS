/**
 * Commande — étape 5 du parcours (modale) : le panier préparé pour un
 * magasin, prêt à être passé chez l'enseigne.
 *
 * 1. Cabas prépare la commande (lignes, total, frais) à l'ouverture ;
 * 2. « Ouvrir <enseigne> » ouvre le drive / la livraison (navigateur intégré) ;
 *    Premium : un lien de recherche par produit (commande en un clic) ;
 * 3. « Copier ma liste » (texte prêt à coller) ;
 * 4. « J'ai passé ma commande » : la dépense rejoint le suivi du budget.
 * Sans drive (Lidl, Mercadona…), la commande devient une liste à emporter.
 */
import * as WebBrowser from 'expo-web-browser';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { CheckCircle2, Copy, Crown, ExternalLink, Search, ShoppingCart } from 'lucide-react-native';

import { Celebration, EmptyBasket, ReceiptCard } from '@/components/brand';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  InfoBanner,
  KeyValueRow,
  Screen,
  StoreBadge,
  Text,
  useToast,
} from '@/components/ui';
import { buildProductSearchUrl, COUNTRY_FLAGS, formatPrice, storeDisplayName } from '@/core';
import { useSubscription } from '@/hooks';
import { haptics } from '@/lib/haptics';
import { useCatalog } from '@/services/catalog';
import { lastOrderForWeek, useBasketStore, useOrderStore, useWeekStore } from '@/stores';
import { useTheme } from '@/theme';

export default function OrderScreen() {
  const t = useTheme();
  const toast = useToast();
  const sub = useSubscription();
  const { storeId } = useLocalSearchParams<{ storeId?: string }>();
  const catalog = useCatalog();
  const store = storeId ? catalog.storesById[storeId] : undefined;
  const plan = useBasketStore((s) => s.plan);
  const basketWeek = useBasketStore((s) => s.weekStart);
  const channel = useBasketStore((s) => s.channel);
  const activeWeek = useWeekStore((s) => s.activeWeekStart);
  const ws = basketWeek ?? activeWeek;
  const part = plan?.parts.find((p) => p.storeId === storeId) ?? null;
  const order = useOrderStore((s) => (storeId ? lastOrderForWeek(s.orders, ws, storeId) : null));
  const [celebrate, setCelebrate] = useState(0);
  const prepared = useRef(false);

  // Prépare (ou rafraîchit) la commande à partir du panier courant.
  useEffect(() => {
    if (prepared.current || !part || !storeId) return;
    prepared.current = true;
    const same =
      order &&
      order.status !== 'confirmed' &&
      order.channel === channel &&
      order.totalCents === part.subtotalCents + part.feesCents &&
      order.lines.length === part.lines.length;
    if (!same && order?.status !== 'confirmed') useOrderStore.getState().prepareOrder(part, storeId, channel);
  }, [part, storeId, order, channel]);

  const name = store ? storeDisplayName(store) : 'Magasin';
  const inStore = channel === 'drive' && store?.hasDrive === false;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/panier' as Href));
  const lines = order?.lines ?? part?.lines ?? [];
  const total = order?.totalCents ?? (part ? part.subtotalCents + part.feesCents : 0);
  const fees = part?.feesCents ?? Math.max(0, total - lines.reduce((s, l) => s + l.totalCents, 0));
  const confirmed = order?.status === 'confirmed';

  const steps = useMemo(
    () =>
      inStore
        ? ['Copie ou garde ta liste sous la main.', `Fais tes courses chez ${name}.`, 'Touche « J’ai fait mes courses » pour suivre ton budget.']
        : [
            `Ouvre ${name} : connecte-toi et choisis ton créneau ${channel === 'delivery' ? 'de livraison' : 'de retrait'}.`,
            'Ajoute les articles de la liste (copie-la pour aller plus vite).',
            'Valide ta commande chez l’enseigne, puis reviens ici.',
          ],
    [inStore, name, channel],
  );

  if (!store || (!part && !order)) {
    return (
      <Screen title="Commande" onBack={close} backIcon="close" bottomInset="safe" testID="order-screen">
        <EmptyState
          illustration={<EmptyBasket size={140} />}
          title="Pas de panier pour ce magasin"
          body="Compare d’abord les prix de ta liste : Cabas prépare ensuite ta commande."
          action={{ label: 'Comparer les prix', onPress: () => router.replace('/panier' as Href) }}
        />
      </Screen>
    );
  }

  const open = async () => {
    if (!order) return;
    haptics.impact();
    const ok = await useOrderStore.getState().openOrder(order.id);
    if (!ok) toast.show({ title: 'Impossible d’ouvrir le site', message: 'Vérifie ta connexion et réessaie.', tone: 'danger' });
  };
  const copy = async () => {
    if (!order) return;
    const ok = await useOrderStore.getState().copyOrderText(order.id);
    haptics[ok ? 'success' : 'error']();
    toast.show(
      ok
        ? { title: 'Liste copiée', message: 'Colle-la dans la recherche du site ou tes notes.', tone: 'success' }
        : { title: 'Copie impossible', tone: 'danger' },
    );
  };
  const confirm = () => {
    if (!order) return;
    const entry = useOrderStore.getState().confirmOrder(order.id);
    haptics.success();
    setCelebrate((n) => n + 1);
    toast.show({
      title: inStore ? 'Courses notées !' : 'Commande notée !',
      message: entry ? `${formatPrice(entry.totalCents)} ajoutés à ton budget${entry.savingsCents > 0 ? `, ${formatPrice(entry.savingsCents)} économisés` : ''}.` : undefined,
      emoji: '🧺',
      tone: 'success',
    });
  };
  const searchProduct = async (productId: string) => {
    const product = catalog.productsById[productId];
    if (!product) return;
    if (!sub.canUse('one_click_order')) {
      haptics.warning();
      router.push('/premium' as Href);
      return;
    }
    const url = buildProductSearchUrl(store, product);
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      await Linking.openURL(url).catch(() => undefined);
    }
  };

  return (
    <Screen
      title={inStore ? `Courses chez ${name}` : `Commande ${name}`}
      subtitle={`${COUNTRY_FLAGS[store.country]} ${store.city} · ${inStore ? 'en magasin' : channel === 'delivery' ? 'livraison' : 'drive'}`}
      onBack={close}
      backIcon="close"
      bottomInset="safe"
      testID="order-screen"
      footer={
        <View style={{ gap: t.spacing.sm }}>
          {confirmed ? (
            <Button label="Retour à ma semaine" size="lg" fullWidth onPress={() => router.navigate('/' as Href)} testID="order-done" />
          ) : (
            <>
              {inStore ? null : (
                <Button
                  label={`Ouvrir ${name}`}
                  leftIcon={ExternalLink}
                  size="lg"
                  fullWidth
                  disabled={!order}
                  onPress={() => void open()}
                  testID="order-open"
                />
              )}
              <Button
                label={inStore ? 'J’ai fait mes courses' : 'J’ai passé ma commande'}
                leftIcon={CheckCircle2}
                variant={inStore ? 'primary' : 'secondary'}
                size={inStore ? 'lg' : 'md'}
                fullWidth
                disabled={!order}
                onPress={confirm}
                testID="order-confirm"
              />
            </>
          )}
        </View>
      }
    >
      <View style={{ gap: t.spacing.lg }}>
        <Card variant="hero" padding="lg" radius="xl">
          <View style={styles.headRow}>
            <StoreBadge chain={store.chain} name={name} size="lg" />
            <View style={styles.flex}>
              <Text variant="overline" color="heroText">
                {confirmed ? 'Commande passée' : order?.status === 'opened' ? 'Site ouvert' : 'Prête'}
              </Text>
              <Text variant="title2" color="heroText" tabular testID="order-total">
                {formatPrice(total)}
              </Text>
              <Text variant="footnote" color="heroText">
                {lines.length} article{lines.length > 1 ? 's' : ''}
                {fees > 0 ? ` · dont ${formatPrice(fees)} de frais` : ''}
                {order && order.savingsCents > 0 ? ` · ${formatPrice(order.savingsCents)} économisés` : ''}
              </Text>
            </View>
            {confirmed ? <Badge label="Fait" tone="success" variant="solid" /> : null}
          </View>
        </Card>

        {!confirmed ? (
          <Card variant="plain" padding="lg" radius="lg">
            <Text variant="headline" style={{ marginBottom: t.spacing.sm }}>
              {inStore ? 'Comment ça marche' : 'En 3 étapes'}
            </Text>
            {steps.map((s, i) => (
              <View key={s} style={[styles.step, { marginTop: i ? t.spacing.sm : 0 }]}>
                <View style={[styles.stepNum, { backgroundColor: t.colors.accentSoft, borderRadius: t.radius.pill }]}>
                  <Text variant="caption" color="accentText">
                    {i + 1}
                  </Text>
                </View>
                <Text variant="callout" style={styles.flex}>
                  {s}
                </Text>
              </View>
            ))}
            <Button label="Copier ma liste" leftIcon={Copy} variant="tonal" onPress={() => void copy()} style={{ marginTop: t.spacing.lg }} testID="order-copy" />
          </Card>
        ) : (
          <InfoBanner tone="success" title="C’est noté" message="La dépense est dans ton suivi de budget. Bon appétit !" action={{ label: 'Voir mon budget', onPress: () => router.push('/budget' as Href) }} />
        )}

        {!sub.canUse('one_click_order') && !inStore && !confirmed ? (
          <InfoBanner
            tone="premium"
            icon={Crown}
            title="Commande en un clic"
            message="Avec Premium, chaque produit s’ouvre directement dans la recherche de l’enseigne."
            action={{ label: 'Découvrir', onPress: () => router.push('/premium' as Href) }}
          />
        ) : null}

        <ReceiptCard header={`Ticket · ${name}`} testID="order-lines">
          {lines.map((l) => {
            const p = catalog.productsById[l.productId];
            return (
              <View key={l.itemId} style={styles.line}>
                <View style={styles.flex}>
                  <Text variant="callout" numberOfLines={2}>
                    {l.packs} × {p?.name ?? l.label}
                  </Text>
                  {p ? (
                    <Text variant="caption" color="textSecondary">
                      {p.brand}
                      {p.isStoreBrand ? ' · MDD' : ''}
                    </Text>
                  ) : null}
                </View>
                <Text variant="callout" tabular>
                  {formatPrice(l.totalCents)}
                </Text>
                {!inStore ? (
                  <IconButton
                    icon={sub.canUse('one_click_order') ? Search : Crown}
                    accessibilityLabel={`Chercher ${p?.name ?? l.label} chez ${name}`}
                    size="sm"
                    variant="plain"
                    onPress={() => void searchProduct(l.productId)}
                  />
                ) : null}
              </View>
            );
          })}
          <View style={{ marginTop: t.spacing.sm, gap: t.spacing.xs }}>
            {fees > 0 ? (
              <KeyValueRow label={channel === 'delivery' ? 'Livraison' : 'Retrait'} value={formatPrice(fees)} leader />
            ) : null}
            <KeyValueRow label="Total" value={formatPrice(total)} emphasis />
          </View>
        </ReceiptCard>

        {store.minOrderCents > 0 && !inStore && total < store.minOrderCents ? (
          <InfoBanner
            tone="warning"
            icon={ShoppingCart}
            title="Minimum de commande"
            message={`${name} demande au moins ${formatPrice(store.minOrderCents)} de courses en ligne.`}
          />
        ) : null}
      </View>

      {celebrate > 0 ? (
        <View pointerEvents="none" style={styles.celebrate}>
          <Celebration size={220} playKey={celebrate} accessibilityLabel="Commande notée" />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepNum: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  celebrate: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});

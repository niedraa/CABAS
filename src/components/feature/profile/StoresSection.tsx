/**
 * Section « Magasins » : cartes d'enseigne (monogramme, nom, retrait —
 * drive, click & collect ou en magasin —, livraison) à sélection multiple,
 * 1 à 5 enseignes, groupées par famille (Hypers & supers / Discount /
 * Proximité). Composant contrôlé (`value` = ids de magasins) ; la liste des
 * magasins est passée par l'écran. Frais et services : indicatifs.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated';
import { Check, PackageCheck, Store as StoreIcon, Truck } from 'lucide-react-native';

import { PressableScale, Row, Stack, StaggeredList, StoreBadge, StoreBadgeStack, Text } from '@/components/ui';
import { formatPrice, STORE_CHAIN_GROUPS, storeDisplayName, type Store } from '@/core';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';

import { STORES_MAX, STORES_RECOMMENDED, toggleStoreId } from './profileOptions';

export interface StoresSectionProps {
  value: string[];
  onChange: (value: string[]) => void;
  stores: readonly Store[];
  max?: number;
  testID?: string;
}

/**
 * Libellés de service d'un magasin (retrait, livraison), prêts à afficher,
 * depuis `store.pickup` et les frais INDICATIFS (« ≈ ») : « Drive gratuit »,
 * « Click & collect · dès 60 € », « Courses en magasin », « Livraison ≈ 6,90 € »,
 * « Pas de livraison ».
 */
export function storeServiceLabels(store: Pick<Store, 'pickup' | 'driveFeeCents' | 'deliveryFeeCents' | 'minOrderCents'>): {
  pickup: string;
  delivery: string;
} {
  const fee = store.driveFeeCents ?? 0;
  const min = store.minOrderCents > 0 ? ` · dès ${formatPrice(store.minOrderCents, { compact: true })}` : '';
  const pickup =
    store.pickup === 'none'
      ? 'Courses en magasin'
      : store.pickup === 'click_collect'
        ? `Click & collect${fee > 0 ? ` ≈ ${formatPrice(fee)}` : ''}${min}`
        : `${fee > 0 ? `Drive ≈ ${formatPrice(fee)}` : 'Drive gratuit'}${min}`;
  const delivery =
    store.deliveryFeeCents === null
      ? 'Pas de livraison'
      : store.deliveryFeeCents === 0
        ? 'Livraison gratuite'
        : `Livraison ≈ ${formatPrice(store.deliveryFeeCents)}`;
  return { pickup, delivery };
}

export interface StoreGroup {
  id: string;
  label: string;
  stores: Store[];
}

/**
 * Magasins groupés par famille d'enseignes, dans l'ordre d'affichage ; une
 * enseigne hors familles (ancien cache) rejoint « Autres enseignes ». Les
 * groupes vides sont omis.
 */
export function groupStores(stores: readonly Store[]): StoreGroup[] {
  const used = new Set<string>();
  const groups: StoreGroup[] = STORE_CHAIN_GROUPS.map((g) => {
    const inGroup = g.chains.flatMap((chain) => stores.filter((s) => s.chain === chain));
    inGroup.forEach((s) => used.add(s.id));
    return { id: g.id, label: g.label, stores: inGroup };
  });
  const others = stores.filter((s) => !used.has(s.id));
  if (others.length > 0) groups.push({ id: 'autres', label: 'Autres enseignes', stores: others });
  return groups.filter((g) => g.stores.length > 0);
}

export function StoresSection({ value, onChange, stores, max = STORES_MAX, testID = 'stores' }: StoresSectionProps) {
  const t = useTheme();
  const selectedChains = value.map((id) => stores.find((s) => s.id === id)?.chain ?? id);
  const n = value.length;

  const toggle = (id: string) => {
    const res = toggleStoreId(value, id, max);
    if (res.blocked) {
      haptics.warning();
      return;
    }
    haptics.select();
    onChange(res.ids);
  };

  const status =
    n === 0
      ? { tone: 'neutral' as const, title: 'Cabas comparera les prix entre tes enseignes', body: `Choisis-en au moins ${STORES_RECOMMENDED} pour de vraies économies.` }
      : n < STORES_RECOMMENDED
        ? {
            tone: 'tip' as const,
            title: `${n} enseigne${n > 1 ? 's' : ''} choisie${n > 1 ? 's' : ''}`,
            body: `Ajoutes-en ${STORES_RECOMMENDED - n} : au moins ${STORES_RECOMMENDED} pour de vraies économies.`,
          }
        : {
            tone: 'success' as const,
            title: `Cabas comparera les prix entre ces ${n} enseignes`,
            body: n >= max ? `C’est le maximum : retire une enseigne pour en choisir une autre.` : 'De quoi faire de vraies économies chaque semaine.',
          };
  const statusBg = status.tone === 'success' ? t.colors.successSoft : status.tone === 'tip' ? t.colors.accentSoft : t.colors.backgroundAlt;

  return (
    <Stack gap="lg" testID={testID}>
      <Animated.View layout={LinearTransition.springify().damping(t.motion.spring.damping)}>
        <Row
          gap="md"
          style={[styles.summary, { backgroundColor: statusBg, borderRadius: t.radius.lg, padding: t.spacing.md, minHeight: 68 }]}
          accessibilityLiveRegion="polite"
          testID={`${testID}-status`}
        >
          {n > 0 ? (
            <Animated.View key={n} entering={FadeIn.duration(t.motion.duration.base)} exiting={FadeOut.duration(t.motion.duration.fast)}>
              <StoreBadgeStack chains={selectedChains} size="sm" max={5} />
            </Animated.View>
          ) : (
            <View style={[styles.statusIcon, { backgroundColor: t.colors.surface, borderRadius: t.radius.sm }]}>
              <StoreIcon size={t.iconSize.md} color={t.colors.textSecondary} />
            </View>
          )}
          <View style={styles.flex}>
            <Text variant="subhead">{status.title}</Text>
            <Text variant="footnote" color="textSecondary">
              {status.body}
            </Text>
          </View>
        </Row>
      </Animated.View>

      {groupStores(stores).map((group) => (
        <View key={group.id} style={{ gap: t.spacing.sm }} testID={`${testID}-group-${group.id}`}>
          <Text variant="overline" color="textSecondary" accessibilityRole="header" style={{ marginLeft: t.spacing.xs }}>
            {group.label}
          </Text>
          <StaggeredList gap="sm">
            {group.stores.map((store) => (
              <StoreCard
                key={store.id}
                store={store}
                selected={value.includes(store.id)}
                disabled={!value.includes(store.id) && n >= max}
                onPress={() => toggle(store.id)}
                testID={`${testID}-${store.id}`}
              />
            ))}
          </StaggeredList>
        </View>
      ))}

      <Text variant="footnote" color="textSecondary" style={{ marginHorizontal: t.spacing.xs }}>
        Prix nationaux relevés par la communauté Open Prices. Frais et services indicatifs : ils varient selon ton magasin.
      </Text>
    </Stack>
  );
}

function StoreCard({
  store,
  selected,
  disabled,
  onPress,
  testID,
}: {
  store: Store;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const t = useTheme();
  const c = t.colors;
  const name = storeDisplayName(store);
  const { pickup, delivery } = storeServiceLabels(store);
  const noDelivery = store.deliveryFeeCents === null;
  const p = useDerivedValue(() => withSpring(selected ? 1 : 0, t.motion.springBouncy), [selected]);
  const checkStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, p.get() * 1.5), transform: [{ scale: 0.3 + 0.7 * p.get() }] }));

  return (
    <PressableScale
      onPress={onPress}
      haptic="none"
      scaleTo={0.98}
      accessibilityRole="checkbox"
      accessibilityLabel={`${name}. ${pickup}. ${delivery}.`}
      accessibilityState={{ checked: selected, disabled }}
      accessibilityHint={disabled ? `Maximum ${STORES_MAX} enseignes` : undefined}
      testID={testID}
      style={[
        styles.card,
        {
          borderRadius: t.radius.lg,
          backgroundColor: selected ? c.primarySoft : c.surface,
          borderColor: selected ? c.primary : c.border,
          padding: t.spacing.lg,
          opacity: disabled ? t.opacity.disabled : 1,
        },
      ]}
    >
      <StoreBadge chain={store.chain} name={name} size="lg" />
      <View style={styles.flex}>
        <Text variant="headline" numberOfLines={1}>
          {name}
        </Text>
        <Row gap="xs" style={styles.meta}>
          {store.pickup === 'none' ? (
            <StoreIcon size={t.iconSize.xs} color={c.textSecondary} />
          ) : (
            <PackageCheck size={t.iconSize.xs} color={c.textSecondary} />
          )}
          <Text variant="footnote" color="textSecondary" numberOfLines={1} style={styles.flexShrink}>
            {pickup}
          </Text>
        </Row>
        <Row gap="xs">
          <Truck size={t.iconSize.xs} color={noDelivery ? c.textTertiary : c.textSecondary} />
          <Text variant="footnote" color="textSecondary" numberOfLines={1} style={styles.flexShrink}>
            {delivery}
          </Text>
        </Row>
      </View>
      <View style={[styles.checkRing, { borderColor: selected ? c.primary : c.borderStrong }]}>
        <Animated.View style={[styles.checkFill, { backgroundColor: c.primary }, checkStyle]}>
          <Check size={t.iconSize.sm} color={c.onPrimary} strokeWidth={3} />
        </Animated.View>
      </View>
    </PressableScale>
  );
}

const CHECK = 28;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 2, minHeight: 84 },
  meta: { marginTop: 2 },
  summary: { alignItems: 'center' },
  statusIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  checkRing: { width: CHECK, height: CHECK, borderRadius: CHECK / 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkFill: { position: 'absolute', top: -2, left: -2, width: CHECK, height: CHECK, borderRadius: CHECK / 2, alignItems: 'center', justifyContent: 'center' },
});

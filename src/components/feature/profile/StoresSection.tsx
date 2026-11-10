/**
 * Section « Magasins » : cartes d'enseigne (monogramme, nom, retrait drive,
 * livraison) à sélection multiple, 1 à 5 enseignes. Composant contrôlé
 * (`value` = ids de magasins) ; la liste des magasins est passée par l'écran.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated';
import { Check, PackageCheck, Store as StoreIcon, Truck } from 'lucide-react-native';

import { PressableScale, Row, Stack, StaggeredList, StoreBadge, StoreBadgeStack, Text } from '@/components/ui';
import { formatPrice, STORE_CHAIN_LABELS, type Store } from '@/core';
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

/** Libellés de service d'un magasin (drive / livraison), prêts à afficher. */
export function storeServiceLabels(store: Store): { pickup: string; delivery: string } {
  const hasDrive = /drive/i.test(store.name);
  const pickup = hasDrive
    ? store.driveFeeCents === 0
      ? 'Drive · retrait gratuit'
      : `Drive · retrait ${formatPrice(store.driveFeeCents)}`
    : 'Courses en magasin';
  const delivery = store.deliveryFeeCents === null ? 'Pas de livraison' : `Livraison ${formatPrice(store.deliveryFeeCents)}`;
  return { pickup, delivery };
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
        : { tone: 'success' as const, title: `Cabas comparera les prix entre ces ${n} enseignes`, body: 'De quoi faire de vraies économies chaque semaine.' };
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

      <StaggeredList gap="sm">
        {stores.map((store) => (
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
  const name = STORE_CHAIN_LABELS[store.chain] ?? store.name;
  const { pickup, delivery } = storeServiceLabels(store);
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
          <PackageCheck size={t.iconSize.xs} color={c.textSecondary} />
          <Text variant="footnote" color="textSecondary" numberOfLines={1} style={styles.flexShrink}>
            {pickup}
          </Text>
        </Row>
        <Row gap="xs">
          <Truck size={t.iconSize.xs} color={store.deliveryFeeCents === null ? c.textTertiary : c.textSecondary} />
          <Text variant="footnote" color={store.deliveryFeeCents === null ? 'textTertiary' : 'textSecondary'} numberOfLines={1} style={styles.flexShrink}>
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

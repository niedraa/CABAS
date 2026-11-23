/**
 * Section « Magasins » : choix du pays (France / Espagne), puis cartes
 * d'enseigne (monogramme, nom, retrait drive, livraison) à sélection
 * multiple, 1 à 5 enseignes. On peut panacher les deux pays (frontaliers).
 * Composant contrôlé (`value` = ids de magasins) ; la liste des magasins est
 * passée par l'écran.
 */
import { getLocales } from 'expo-localization';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated';
import { Check, PackageCheck, Store as StoreIcon, Truck } from 'lucide-react-native';

import { PressableScale, Row, SegmentedControl, Stack, StaggeredList, StoreBadge, StoreBadgeStack, Text } from '@/components/ui';
import { COUNTRY_FLAGS, COUNTRY_LABELS, COUNTRIES, formatPrice, storeDisplayName, type Country, type Store } from '@/core';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';

import { initialStoreCountry, STORES_MAX, STORES_RECOMMENDED, toggleStoreId } from './profileOptions';

export interface StoresSectionProps {
  value: string[];
  onChange: (value: string[]) => void;
  stores: readonly Store[];
  max?: number;
  testID?: string;
}

/** Libellés de service d'un magasin (drive / livraison), prêts à afficher. */
export function storeServiceLabels(store: Store): { pickup: string; delivery: string } {
  const pickup = store.hasDrive
    ? store.driveFeeCents === 0
      ? 'Drive · retrait gratuit'
      : `Drive · retrait ${formatPrice(store.driveFeeCents)}`
    : 'Courses en magasin';
  const min = store.minOrderCents > 0 ? ` · dès ${formatPrice(store.minOrderCents)}` : '';
  const delivery = store.deliveryFeeCents === null ? 'Pas de livraison' : `Livraison ${formatPrice(store.deliveryFeeCents)}${min}`;
  return { pickup, delivery };
}

export function StoresSection({ value, onChange, stores, max = STORES_MAX, testID = 'stores' }: StoresSectionProps) {
  const t = useTheme();
  const selectedChains = value.map((id) => stores.find((s) => s.id === id)?.chain ?? id);
  const n = value.length;
  const countries = COUNTRIES.filter((ct) => stores.some((s) => s.country === ct));
  const [country, setCountry] = useState<Country>(() => initialStoreCountry(value, stores, safeRegion()));
  const visible = countries.length > 1 ? stores.filter((s) => s.country === country) : stores;
  const otherCountryCount = value.filter((id) => stores.find((s) => s.id === id)?.country !== country).length;

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

      {countries.length > 1 ? (
        <Stack gap="xs">
          <SegmentedControl<Country>
            options={countries.map((ct) => ({ value: ct, label: `${COUNTRY_FLAGS[ct]}  ${COUNTRY_LABELS[ct]}` }))}
            value={country}
            onChange={(ct) => {
              haptics.select();
              setCountry(ct);
            }}
            accessibilityLabel="Pays de tes magasins"
            testID={`${testID}-country`}
          />
          {otherCountryCount > 0 ? (
            <Text variant="footnote" color="textSecondary" testID={`${testID}-other-country`}>
              + {otherCountryCount} enseigne{otherCountryCount > 1 ? 's' : ''} choisie{otherCountryCount > 1 ? 's' : ''} dans l’autre pays
            </Text>
          ) : null}
        </Stack>
      ) : null}

      <StaggeredList key={country} gap="sm">
        {visible.map((store) => (
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

/** Région de l'appareil (ex. « ES ») ; null si indisponible. */
function safeRegion(): string | null {
  try {
    return getLocales()[0]?.regionCode ?? null;
  } catch {
    return null;
  }
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

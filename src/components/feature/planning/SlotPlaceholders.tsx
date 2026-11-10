/**
 * Cartes « en creux » du planning :
 * - `LockedSlotCard` : créneau réservé à Premium (offre gratuite à 3 repas) ;
 * - `AddSlotCard` : créneau libre → « Ajouter un repas » ;
 * - `MealCardSkeleton` : carte en cours de génération.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Crown, Plus } from 'lucide-react-native';

import { PressableScale, Skeleton, Text } from '@/components/ui';
import type { MealType } from '@/core';
import { MEAL_TYPE_LABELS } from '@/core';
import { useTheme } from '@/theme';

export interface SlotCardProps {
  type: MealType;
  onPress: () => void;
  testID?: string;
}

export function LockedSlotCard({ type, onPress, testID }: SlotCardProps) {
  const t = useTheme();
  const c = t.colors;
  const label = MEAL_TYPE_LABELS[type];
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      accessibilityLabel={`${label} : créneau Premium. Débloque toute ta semaine.`}
      testID={testID}
      style={[
        styles.slot,
        {
          borderColor: c.borderStrong,
          borderRadius: t.radius.lg,
          backgroundColor: c.backgroundAlt,
          paddingHorizontal: t.spacing.lg,
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: c.accentSoft, borderRadius: t.radius.sm }]}>
        <Crown size={t.iconSize.sm} color={c.accentText} strokeWidth={2.4} />
      </View>
      <View style={styles.flex}>
        <Text variant="overline" color="textSecondary">
          {label}
        </Text>
        <Text variant="subhead" color="textSecondary" numberOfLines={1}>
          Avec Premium, on planifie aussi ce repas
        </Text>
      </View>
      <Text variant="caption" color="accentText">
        Débloquer
      </Text>
    </PressableScale>
  );
}

export function AddSlotCard({ type, onPress, testID }: SlotCardProps) {
  const t = useTheme();
  const c = t.colors;
  const label = MEAL_TYPE_LABELS[type];
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      accessibilityLabel={`${label} : ajouter un repas`}
      testID={testID}
      style={[
        styles.slot,
        { borderColor: c.borderStrong, borderRadius: t.radius.lg, paddingHorizontal: t.spacing.lg },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: c.primarySoft, borderRadius: t.radius.sm }]}>
        <Plus size={t.iconSize.sm} color={t.scheme === 'dark' ? c.text : c.primary} strokeWidth={2.4} />
      </View>
      <View style={styles.flex}>
        <Text variant="overline" color="textSecondary">
          {label}
        </Text>
        <Text variant="subhead">Ajouter un repas</Text>
      </View>
    </PressableScale>
  );
}

export function MealCardSkeleton() {
  const t = useTheme();
  const c = t.colors;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.skeleton,
        { backgroundColor: c.surface, borderRadius: t.radius.lg, borderColor: c.border, padding: t.spacing.md },
      ]}
    >
      <Skeleton width={72} height={72} radius={t.radius.lg} />
      <View style={[styles.flex, { gap: 8 }]}>
        <Skeleton width={44} height={10} />
        <Skeleton width="85%" height={16} />
        <View style={styles.row}>
          <Skeleton width={58} height={20} radius={t.radius.pill} />
          <Skeleton width={58} height={20} radius={t.radius.pill} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: 6 },
  slot: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  icon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  skeleton: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: StyleSheet.hairlineWidth * 2 },
});

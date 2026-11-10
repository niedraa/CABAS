/**
 * En-tête de l'onglet Profil : avatar (initiales sur pastel, ou 🏡 sans
 * prénom), prénom, composition du foyer. Touchable : ouvre l'édition du foyer.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Pencil } from 'lucide-react-native';

import { Avatar, Badge, PressableScale, Text } from '@/components/ui';
import type { Household } from '@/core';
import { useTheme } from '@/theme';

import { householdSummary } from '../onboarding/steps';

export interface ProfileHeaderProps {
  name: string | null;
  household: Household;
  /** Badge à côté du prénom (« Premium », « Essai »). */
  badge?: { label: string; tone: 'premium' | 'neutral' } | null;
  onPress: () => void;
  testID?: string;
}

export function ProfileHeader({ name, household, badge, onPress, testID = 'profile-header' }: ProfileHeaderProps) {
  const t = useTheme();
  const c = t.colors;
  const summary = householdSummary(household);
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${name ?? 'Ton foyer'}. ${summary}. Modifier`}
      style={[styles.row, { gap: t.spacing.lg }]}
      testID={testID}
    >
      <View>
        <Avatar name={name ?? 'Foyer'} emoji={name ? undefined : '🏡'} size={72} />
        <View style={[styles.edit, { backgroundColor: c.surfaceElevated, borderColor: c.background }]}>
          <Pencil size={t.iconSize.xs} color={c.text} strokeWidth={2.4} />
        </View>
      </View>
      <View style={[styles.flex, { gap: t.spacing.xxs }]}>
        <View style={[styles.nameRow, { gap: t.spacing.sm }]}>
          <Text variant="title2" numberOfLines={1} style={styles.shrink} testID={`${testID}-name`}>
            {name ?? 'Ton foyer'}
          </Text>
          {badge ? <Badge label={badge.label} tone={badge.tone} variant={badge.tone === 'premium' ? 'solid' : 'soft'} size="sm" /> : null}
        </View>
        <Text variant="callout" color="textSecondary" numberOfLines={2}>
          {summary}
        </Text>
      </View>
    </PressableScale>
  );
}

const EDIT = 28;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 88 },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  edit: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: EDIT,
    height: EDIT,
    borderRadius: EDIT / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

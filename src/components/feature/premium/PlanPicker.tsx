/**
 * Choix de l'offre sur le paywall (fond forêt) : cartes « radio » annuelle /
 * mensuelle, prix localisés, « −33 % », essai gratuit. La carte choisie
 * s'illumine au ressort (bordure moutarde, pastille cochée qui rebondit).
 * Pendant le chargement des offres : deux squelettes translucides.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated';
import { Check, Gift } from 'lucide-react-native';

import { Badge, PressableScale, Skeleton, Stack, Text } from '@/components/ui';
import type { PackageId } from '@/services/purchases';
import { useTheme, withAlpha } from '@/theme';

import type { PlanOptionView } from './paywall';

export interface PlanPickerProps {
  options: readonly PlanOptionView[];
  value: PackageId;
  onChange: (id: PackageId) => void;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
}

export function PlanPicker({ options, value, onChange, loading, disabled, testID = 'plan-picker' }: PlanPickerProps) {
  const t = useTheme();
  if (loading) {
    const bg = withAlpha(t.colors.heroText, 0.1);
    return (
      <Stack gap="sm" accessibilityLabel="Chargement des offres" testID={`${testID}-loading`}>
        <Skeleton height={92} radius={t.radius.lg} style={{ backgroundColor: bg }} />
        <Skeleton height={76} radius={t.radius.lg} style={{ backgroundColor: bg }} />
      </Stack>
    );
  }
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Choisis ton offre" style={{ gap: t.spacing.sm }} testID={testID}>
      {options.map((o) => (
        <PlanOptionCard
          key={o.id}
          option={o}
          selected={o.id === value}
          disabled={disabled}
          onPress={() => o.id !== value && onChange(o.id)}
          testID={`${testID}-${o.id}`}
        />
      ))}
    </View>
  );
}

export interface PlanOptionCardProps {
  option: PlanOptionView;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

const RING = 26;

export function PlanOptionCard({ option, selected, onPress, disabled, testID }: PlanOptionCardProps) {
  const t = useTheme();
  const c = t.colors;
  const p = useDerivedValue(() => withSpring(selected ? 1 : 0, t.motion.springBouncy), [selected]);
  const idle = withAlpha(c.heroText, 0.07);
  const active = withAlpha(c.heroText, 0.14);
  const idleBorder = withAlpha(c.heroText, 0.2);
  const cardStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.get(), [0, 1], [idle, active]),
    borderColor: interpolateColor(p.get(), [0, 1], [idleBorder, c.accent]),
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.get() * 1.5),
    transform: [{ scale: 0.3 + 0.7 * p.get() }],
  }));
  const a11y = [option.title, option.price, option.detail, option.badge ? `économie de ${option.badge.replace('−', '')}` : null, option.trial]
    .filter(Boolean)
    .join(', ');

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic="select"
      scaleTo={0.98}
      accessibilityRole="radio"
      accessibilityLabel={a11y}
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      testID={testID}
    >
      <Animated.View style={[styles.card, { borderRadius: t.radius.lg, padding: t.spacing.lg, gap: t.spacing.md }, cardStyle]}>
        <View style={[styles.ring, { borderColor: selected ? c.accent : idleBorder }]}>
          <Animated.View style={[styles.ringFill, { backgroundColor: c.accent }, checkStyle]}>
            <Check size={t.iconSize.sm} color={c.onAccent} strokeWidth={3} />
          </Animated.View>
        </View>
        <View style={styles.flex}>
          <View style={[styles.titleRow, { gap: t.spacing.sm }]}>
            <Text variant="headline" color="heroText">
              {option.title}
            </Text>
            {option.badge ? <Badge label={option.badge} tone="accent" variant="solid" size="sm" /> : null}
          </View>
          <Text variant="footnote" color="heroText" style={styles.muted}>
            {option.detail}
          </Text>
          {option.trial ? (
            <View style={[styles.trial, { gap: t.spacing.xs, marginTop: t.spacing.xs }]}>
              <Gift size={t.iconSize.xs} color={c.accent} strokeWidth={2.4} />
              <Text variant="caption" color="accent">
                {option.trial}
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="price" color="heroText" tabular>
          {option.price}
        </Text>
      </Animated.View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, minHeight: 76 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  trial: { flexDirection: 'row', alignItems: 'center' },
  muted: { opacity: 0.8 },
  ring: { width: RING, height: RING, borderRadius: RING / 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  ringFill: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

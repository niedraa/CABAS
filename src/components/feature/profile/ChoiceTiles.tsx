/**
 * Tuiles de choix unique (emoji + libellé + aide), en ligne, de largeur égale.
 * Sélection : fond forêt + léger rebond. Rôle a11y « radio » dans un « radiogroup ».
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import { PressableScale, Text } from '@/components/ui';
import { useTheme } from '@/theme';

export interface ChoiceTile<T extends string | number> {
  value: T;
  label: string;
  emoji: string;
  hint?: string;
}

export interface ChoiceTilesProps<T extends string | number> {
  options: readonly ChoiceTile<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  testID?: string;
}

export function ChoiceTiles<T extends string | number>({ options, value, onChange, accessibilityLabel, testID }: ChoiceTilesProps<T>) {
  const t = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={[styles.row, { gap: t.spacing.sm }]} testID={testID}>
      {options.map((o) => (
        <Tile key={String(o.value)} option={o} selected={o.value === value} onPress={() => o.value !== value && onChange(o.value)} groupLabel={accessibilityLabel} testID={testID ? `${testID}-${o.value}` : undefined} />
      ))}
    </View>
  );
}

function Tile<T extends string | number>({
  option,
  selected,
  onPress,
  groupLabel,
  testID,
}: {
  option: ChoiceTile<T>;
  selected: boolean;
  onPress: () => void;
  groupLabel: string;
  testID?: string;
}) {
  const t = useTheme();
  const c = t.colors;
  const reduced = useReducedMotion();
  const bump = useSharedValue(1);
  useEffect(() => {
    if (selected && !reduced) bump.set(withSequence(withSpring(1.12, t.motion.springSnappy), withSpring(1, t.motion.springBouncy)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
  const emojiStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.get() }] }));
  const fg = selected ? c.onPrimary : c.text;

  return (
    <PressableScale
      onPress={onPress}
      haptic="select"
      scaleTo={0.94}
      accessibilityRole="radio"
      accessibilityLabel={`${groupLabel} : ${option.label}${option.hint ? `, ${option.hint}` : ''}`}
      accessibilityState={{ checked: selected, selected }}
      testID={testID}
      style={[
        styles.tile,
        {
          borderRadius: t.radius.lg,
          backgroundColor: selected ? c.primary : c.surface,
          borderColor: selected ? c.primary : c.border,
          paddingVertical: t.spacing.md,
          minHeight: 92,
        },
      ]}
    >
      <Animated.Text style={[styles.emoji, emojiStyle]} accessibilityElementsHidden importantForAccessibility="no">
        {option.emoji}
      </Animated.Text>
      <Text variant="headline" style={{ color: fg }} numberOfLines={1} adjustsFontSizeToFit>
        {option.label}
      </Text>
      {option.hint ? (
        <Text variant="caption" style={{ color: selected ? c.onPrimary : c.textSecondary }} numberOfLines={1}>
          {option.hint}
        </Text>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  tile: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, gap: 2, paddingHorizontal: 4 },
  emoji: { fontSize: 24, lineHeight: 30 },
});

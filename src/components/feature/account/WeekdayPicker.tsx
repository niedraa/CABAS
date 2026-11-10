/**
 * Choix d'un jour de la semaine : 7 pastilles égales sur une ligne (« Lu »
 * … « Di »), la pastille choisie se remplit de forêt au ressort.
 * Rôle a11y « radio » (nom complet du jour) dans un « radiogroup ».
 * Chaque colonne entière est touchable (cible ≥ 44 pt dès 312 pt de large) ;
 * la pastille visible est légèrement en retrait.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated';

import { PressableScale } from '@/components/ui';
import { useTheme } from '@/theme';

import { REMINDER_WEEKDAYS } from './settingsOptions';

export interface WeekdayPickerProps {
  value: number;
  onChange: (weekday: number) => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function WeekdayPicker({ value, onChange, accessibilityLabel, style, testID = 'weekday' }: WeekdayPickerProps) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={[styles.row, style]} testID={testID}>
      {REMINDER_WEEKDAYS.map((d) => (
        <Day
          key={d.value}
          label={d.short}
          name={d.name}
          selected={d.value === value}
          onPress={() => d.value !== value && onChange(d.value)}
          testID={`${testID}-${d.value}`}
        />
      ))}
    </View>
  );
}

function Day({ label, name, selected, onPress, testID }: { label: string; name: string; selected: boolean; onPress: () => void; testID?: string }) {
  const t = useTheme();
  const c = t.colors;
  const p = useDerivedValue(() => withSpring(selected ? 1 : 0, t.motion.springIndicator), [selected]);
  const fill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.get(), [0, 1], [c.backgroundAlt, c.primary]),
    transform: [{ scale: 0.92 + 0.08 * p.get() }],
  }));
  const text = useAnimatedStyle(() => ({ color: interpolateColor(p.get(), [0, 1], [c.text, c.onPrimary]) }));
  return (
    <PressableScale
      onPress={onPress}
      haptic="select"
      scaleTo={0.92}
      accessibilityRole="radio"
      accessibilityLabel={name.charAt(0).toUpperCase() + name.slice(1)}
      accessibilityState={{ checked: selected }}
      style={[styles.flex, { minHeight: t.layout.minTouchTarget }]}
      testID={testID}
    >
      <Animated.View
        style={[styles.day, { height: t.layout.minTouchTarget, borderRadius: t.radius.pill, marginHorizontal: t.spacing.xxs }, fill]}
      >
        <Animated.Text style={[t.typography.subhead, { fontFamily: t.typography.headline.fontFamily }, text]} allowFontScaling={false}>
          {label}
        </Animated.Text>
      </Animated.View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row' },
  day: { alignItems: 'center', justifyContent: 'center' },
});

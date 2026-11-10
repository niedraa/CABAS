/**
 * Sélecteur numérique « −  3  + » (portions, adultes, enfants, quantités).
 * Accessible comme un contrôle « ajustable » (balayage haut/bas au lecteur d'écran).
 */
import React, { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { Minus, Plus } from 'lucide-react-native';

import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Libellé lu par le lecteur d'écran (« Adultes »). */
  accessibilityLabel: string;
  /** Formatage de la valeur affichée (« 4 pers. »). */
  format?: (value: number) => string;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  accessibilityLabel,
  format,
  size = 'md',
  style,
  testID,
}: StepperProps) {
  const t = useTheme();
  const c = t.colors;
  const dim = size === 'sm' ? 32 : 40;
  const canDec = value - step >= min;
  const canInc = value + step <= max;

  // Petit rebond de la valeur à chaque changement.
  const bump = useSharedValue(1);
  useEffect(() => {
    bump.set(withSequence(withSpring(1.18, t.motion.springSnappy), withSpring(1, t.motion.springBouncy)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const valueStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.get() }] }));

  const change = (dir: 1 | -1) => {
    const next = Math.min(max, Math.max(min, value + dir * step));
    if (next === value) {
      haptics.warning();
      return;
    }
    haptics.select();
    onChange(next);
  };

  const label = format ? format(value) : String(value);

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: value, text: label }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') change(1);
        if (e.nativeEvent.actionName === 'decrement') change(-1);
      }}
      style={[
        styles.row,
        { backgroundColor: c.surface, borderColor: c.border, borderRadius: t.radius.pill, padding: 4 },
        style,
      ]}
    >
      <StepButton
        dim={dim}
        disabled={!canDec}
        onPress={() => change(-1)}
        label={`Diminuer ${accessibilityLabel}`}
        testID={testID ? `${testID}-dec` : undefined}
      >
        <Minus size={18} color={canDec ? c.primary : c.textTertiary} strokeWidth={2.5} />
      </StepButton>
      <Animated.View style={[styles.value, { minWidth: size === 'sm' ? 32 : 44 }, valueStyle]}>
        <Text variant={size === 'sm' ? 'headline' : 'title3'} tabular align="center" testID={testID ? `${testID}-value` : undefined}>
          {label}
        </Text>
      </Animated.View>
      <StepButton
        dim={dim}
        disabled={!canInc}
        onPress={() => change(1)}
        label={`Augmenter ${accessibilityLabel}`}
        testID={testID ? `${testID}-inc` : undefined}
        filled
      >
        <Plus size={18} color={canInc ? c.onPrimary : c.textTertiary} strokeWidth={2.5} />
      </StepButton>
    </View>
  );
}

function StepButton({
  dim,
  disabled,
  onPress,
  label,
  children,
  filled,
  testID,
}: {
  dim: number;
  disabled: boolean;
  onPress: () => void;
  label: string;
  children: React.ReactNode;
  filled?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  const c = t.colors;
  const slop = Math.max(0, (t.layout.minTouchTarget - dim) / 2);
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      haptic="none"
      scaleTo={0.86}
      accessibilityLabel={label}
      hitSlop={{ top: slop, bottom: slop, left: slop, right: slop }}
      style={{
        width: dim,
        height: dim,
        borderRadius: dim / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: disabled ? c.backgroundAlt : filled ? c.primary : c.primarySoft,
      }}
    >
      {children}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderWidth: 1 },
  value: { paddingHorizontal: 8, alignItems: 'center' },
});

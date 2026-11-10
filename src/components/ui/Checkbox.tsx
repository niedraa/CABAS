/**
 * Case à cocher : le fond « tombe » au ressort puis la coche se dessine de
 * gauche à droite (révélation par masque, fiable sur iOS, Android et web).
 * Avec `label`, toute la ligne est pressable (cible ≥ 44 pt).
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';

import { useTheme } from '@/theme';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  /** Raye le libellé une fois coché (liste de courses). */
  strikeWhenChecked?: boolean;
  size?: number;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  strikeWhenChecked,
  size = 26,
  disabled,
  accessibilityLabel,
  style,
  testID,
}: CheckboxProps) {
  const t = useTheme();
  const c = t.colors;
  const fill = useDerivedValue(() => withSpring(checked ? 1 : 0, t.motion.springBouncy), [checked]);
  const draw = useDerivedValue(
    () => (checked ? withDelay(60, withTiming(1, { duration: t.motion.duration.fast })) : withTiming(0, { duration: 80 })),
    [checked],
  );

  const fillStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, fill.get() * 1.4),
    transform: [{ scale: 0.5 + 0.5 * fill.get() }],
  }));
  const tickMask = useAnimatedStyle(() => ({ width: size * draw.get() }));

  return (
    <PressableScale
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ checked, disabled: !!disabled }}
      disabled={disabled}
      haptic={checked ? 'select' : 'success'}
      scaleTo={label ? 0.98 : 0.88}
      onPress={() => onChange(!checked)}
      style={[styles.row, label ? { minHeight: t.layout.minTouchTarget } : null, { opacity: disabled ? t.opacity.disabled : 1 }, style]}
    >
      <View
        style={[
          styles.box,
          { width: size, height: size, borderRadius: size * 0.32, borderColor: checked ? c.success : c.borderStrong },
        ]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.success, borderRadius: size * 0.28 }, fillStyle]} />
        <Animated.View style={[styles.mask, { height: size }, tickMask]}>
          <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Check size={size * 0.68} color={t.scheme === 'dark' ? c.background : c.surface} strokeWidth={3.2} />
          </View>
        </Animated.View>
      </View>
      {label ? (
        <View style={styles.texts}>
          <Text
            variant="bodyMedium"
            color={checked && strikeWhenChecked ? 'textTertiary' : 'text'}
            strike={checked && strikeWhenChecked}
          >
            {label}
          </Text>
          {description ? (
            <Text variant="footnote" color="textSecondary">
              {description}
            </Text>
          ) : null}
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  box: { borderWidth: 2, overflow: 'hidden', alignItems: 'flex-start', justifyContent: 'center' },
  mask: { position: 'absolute', left: -2, top: -2, overflow: 'hidden' },
  texts: { flex: 1, gap: 2 },
});

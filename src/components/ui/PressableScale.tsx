/**
 * Primitive pressable de tout le kit : léger « enfoncement » au ressort
 * (`motion.pressScale`) + retour haptique au déclenchement.
 * Respecte « Réduire les animations » (pas de mise à l'échelle).
 */
import React from 'react';
import {
  Platform,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type HapticKind = 'tap' | 'select' | 'impact' | 'success' | 'none';

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** Échelle pendant l'appui (défaut : `motion.pressScale`). */
  scaleTo?: number;
  /** Retour haptique au `onPress` (défaut : 'tap'). */
  haptic?: HapticKind;
  /** Légère baisse d'opacité pendant l'appui. */
  dimOnPress?: boolean;
}

export function PressableScale({
  style,
  children,
  scaleTo,
  haptic = 'tap',
  dimOnPress = false,
  disabled,
  onPress,
  onPressIn,
  onPressOut,
  accessibilityRole = 'button',
  accessibilityState,
  hitSlop,
  ...rest
}: PressableScaleProps) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const pressed = useSharedValue(0);
  const target = reduced ? 1 : (scaleTo ?? t.motion.pressScale);

  // N'anime l'opacité que si `dimOnPress` : sinon on écraserait l'opacité
  // « désactivé » passée dans `style`.
  const animatedStyle = useAnimatedStyle(() =>
    dimOnPress
      ? { transform: [{ scale: 1 - (1 - target) * pressed.get() }], opacity: 1 - 0.15 * pressed.get() }
      : { transform: [{ scale: 1 - (1 - target) * pressed.get() }] },
  );

  const handlePressIn = (e: GestureResponderEvent) => {
    pressed.set(withSpring(1, t.motion.springSnappy));
    onPressIn?.(e);
  };
  const handlePressOut = (e: GestureResponderEvent) => {
    pressed.set(withSpring(0, t.motion.spring));
    onPressOut?.(e);
  };
  const handlePress = (e: GestureResponderEvent) => {
    if (haptic !== 'none') haptics[haptic]();
    onPress?.(e);
  };

  return (
    <AnimatedPressable
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: !!disabled, ...accessibilityState }}
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={onPress ? handlePress : undefined}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        Platform.OS === 'web' && ({ cursor: disabled ? 'auto' : 'pointer' } as ViewStyle),
        style,
        animatedStyle,
      ]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}

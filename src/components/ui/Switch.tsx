/**
 * Interrupteur maison : piste qui se colore, pastille qui glisse et s'étire
 * légèrement pendant l'appui (effet « gélatine »).
 */
import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { boxShadow, useTheme } from '@/theme';

import { PressableScale } from './PressableScale';

export interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const W = 52;
const H = 32;
const THUMB = 26;
const GAP = (H - THUMB) / 2;

export function Switch({ value, onValueChange, accessibilityLabel, disabled, style, testID }: SwitchProps) {
  const t = useTheme();
  const c = t.colors;
  const progress = useDerivedValue(() => withSpring(value ? 1 : 0, t.motion.springIndicator), [value]);
  const pressing = useSharedValue(0);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], [c.borderStrong, c.success]),
  }));
  const thumbStyle = useAnimatedStyle(() => {
    const stretch = 6 * pressing.get();
    const travel = W - THUMB - GAP * 2;
    return {
      width: THUMB + stretch,
      // Étirement vers l'intérieur : quand activé, la pastille grandit vers la gauche.
      transform: [{ translateX: progress.get() * (travel - stretch) }],
    };
  });

  return (
    <PressableScale
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      haptic="select"
      scaleTo={1}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      onPressIn={() => pressing.set(withSpring(1, t.motion.springSnappy))}
      onPressOut={() => pressing.set(withSpring(0, t.motion.springSnappy))}
      onPress={() => onValueChange(!value)}
      style={[{ opacity: disabled ? t.opacity.disabled : 1 }, style]}
    >
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View
          style={[styles.thumb, { backgroundColor: c.surfaceElevated, boxShadow: boxShadow('sm', c.shadow) }, thumbStyle]}
        />
      </Animated.View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  track: { width: W, height: H, borderRadius: H / 2, padding: GAP, justifyContent: 'center' },
  thumb: { height: THUMB, borderRadius: THUMB / 2 },
});

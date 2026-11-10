/**
 * Progression linéaire (budget, liste cochée) et circulaire (anneau de
 * génération du planning, objectif d'économies). Remplissage au ressort.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { formatPercentForA11y } from '@/lib/a11y';
import { useTheme, type ColorScheme } from '@/theme';

export type ProgressTone = 'primary' | 'accent' | 'success' | 'danger' | 'info';

function toneColor(c: ColorScheme, tone: ProgressTone): string {
  switch (tone) {
    case 'accent':
      return c.accent;
    case 'success':
      return c.success;
    case 'danger':
      return c.danger;
    case 'info':
      return c.info;
    default:
      return c.primary;
  }
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

export interface ProgressBarProps {
  /** 0 → 1 */
  progress: number;
  tone?: ProgressTone;
  height?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ProgressBar({
  progress,
  tone = 'primary',
  height = 10,
  accessibilityLabel,
  style,
  testID,
}: ProgressBarProps) {
  const t = useTheme();
  const p = clamp01(progress);
  const anim = useDerivedValue(() => withSpring(p, t.motion.spring), [p]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${anim.get() * 100}%` }));
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p * 100), text: formatPercentForA11y(p) }}
      style={[
        styles.track,
        { height, borderRadius: height / 2, backgroundColor: t.colors.backgroundAlt },
        style,
      ]}
    >
      <Animated.View
        style={[{ height, borderRadius: height / 2, backgroundColor: toneColor(t.colors, tone) }, fillStyle]}
      />
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface ProgressRingProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  tone?: ProgressTone;
  /** Couleur de piste forcée (ex. sur fond héros). */
  trackColor?: string;
  children?: React.ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ProgressRing({
  progress,
  size = 72,
  strokeWidth = 8,
  tone = 'accent',
  trackColor,
  children,
  accessibilityLabel,
  style,
  testID,
}: ProgressRingProps) {
  const t = useTheme();
  const p = clamp01(progress);
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const anim = useDerivedValue(() => withSpring(p, t.motion.spring), [p]);
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - anim.get()),
  }));

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p * 100), text: formatPercentForA11y(p) }}
      style={[{ width: size, height: size }, style]}
    >
      <Svg width={size} height={size} style={styles.svg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={trackColor ?? t.colors.backgroundAlt}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={toneColor(t.colors, tone)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          fill="none"
          // Départ à midi : rotation de −90° autour du centre.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          animatedProps={animatedProps}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden', width: '100%' },
  svg: { position: 'absolute' },
  center: { alignItems: 'center', justifyContent: 'center' },
});

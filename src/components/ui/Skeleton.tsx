/**
 * Squelettes de chargement avec reflet qui balaie (« shimmer »).
 * Le reflet s'arrête si « Réduire les animations » est activé.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  circle?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height = 16, radius, circle, style }: SkeletonProps) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const [w, setW] = useState(0);
  const x = useSharedValue(0);

  useEffect(() => {
    if (reduced || w === 0) return;
    x.set(0);
    x.set(withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, reduced]);

  const band = Math.max(80, w * 0.6);
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -band + (w + band) * x.get() }],
  }));
  const r = circle ? 999 : (radius ?? t.radius.sm);
  const highlight = t.scheme === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.65)';

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[
        styles.base,
        { width: circle ? height : width, height, borderRadius: r, backgroundColor: t.colors.backgroundAlt },
        style,
      ]}
    >
      {!reduced && w > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, { width: band }, shimmerStyle]}>
          <LinearGradient
            colors={['transparent', highlight, 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Paragraphe fantôme : `lines` barres, la dernière plus courte. */
export function SkeletonText({
  lines = 3,
  lineHeight = 14,
  gap = 8,
  style,
}: {
  lines?: number;
  lineHeight?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ gap }, style]} accessible accessibilityLabel="Chargement" accessibilityRole="progressbar">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={lineHeight} width={i === lines - 1 && lines > 1 ? '62%' : '100%'} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
});

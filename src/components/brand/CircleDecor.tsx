/**
 * Grands cercles doux qui se chevauchent — motif signature des zones
 * « héros » (bandeaux forêt, onboarding, paywall). Purement décoratif :
 * masqué aux lecteurs d'écran, ne capte pas les touchers.
 * Légère dérive lente (respecte « Réduire les animations »).
 */
import React, { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { palette, useTheme } from '@/theme';

export type CircleDecorTone = 'hero' | 'paper' | 'accent';
export type CircleDecorPlacement = 'topRight' | 'topLeft' | 'bottomRight' | 'bottomLeft' | 'both';

export interface CircleDecorProps {
  tone?: CircleDecorTone;
  placement?: CircleDecorPlacement;
  /** Facteur d'échelle des cercles (défaut 1 ≈ 260 pt pour le plus grand). */
  scale?: number;
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
}

interface CircleSpec {
  size: number;
  color: string;
  opacity: number;
  dx: number;
  dy: number;
}

export function CircleDecor({
  tone = 'hero',
  placement = 'topRight',
  scale = 1,
  animated = true,
  style,
}: CircleDecorProps) {
  const t = useTheme();
  const c = t.colors;
  const reduced = useReducedMotion();
  const drift = useSharedValue(0);

  useEffect(() => {
    if (!animated || reduced) return;
    drift.set(withRepeat(withTiming(1, { duration: 7000, easing: Easing.inOut(Easing.sin) }), -1, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animated, reduced]);

  const specs: CircleSpec[] =
    tone === 'hero'
      ? [
          { size: 260, color: c.heroCircle, opacity: 0.55, dx: 0, dy: 0 },
          { size: 170, color: c.heroCircle, opacity: 0.4, dx: -120, dy: 90 },
          { size: 56, color: palette.moutarde500, opacity: 0.95, dx: 0, dy: 130 },
        ]
      : tone === 'accent'
        ? [
            { size: 240, color: c.accent, opacity: 0.35, dx: 0, dy: 0 },
            { size: 150, color: c.accent, opacity: 0.25, dx: -110, dy: 80 },
            { size: 56, color: c.primary, opacity: 0.85, dx: -60, dy: 140 },
          ]
        : [
            { size: 240, color: c.primarySoft, opacity: 1, dx: 0, dy: 0 },
            { size: 150, color: c.accentSoft, opacity: 1, dx: -110, dy: 90 },
            { size: 48, color: c.accent, opacity: 0.8, dx: -50, dy: 150 },
          ];

  const corners: Exclude<CircleDecorPlacement, 'both'>[] =
    placement === 'both' ? ['topRight', 'bottomLeft'] : [placement];

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.clip, style]}
    >
      {corners.map((corner) =>
        specs.map((s, i) => (
          <DriftCircle key={`${corner}-${i}`} spec={s} corner={corner} scale={scale} index={i} drift={drift} />
        )),
      )}
    </View>
  );
}

function DriftCircle({
  spec,
  corner,
  scale,
  index,
  drift,
}: {
  spec: CircleSpec;
  corner: Exclude<CircleDecorPlacement, 'both'>;
  scale: number;
  index: number;
  drift: ReturnType<typeof useSharedValue<number>>;
}) {
  const size = spec.size * scale;
  const right = corner.endsWith('Right');
  const top = corner.startsWith('top');
  // Le grand cercle déborde du coin ; les autres s'en écartent.
  const offsetX = -size * 0.35 - spec.dx * scale;
  const offsetY = -size * 0.35 + spec.dy * scale;
  const amp = (index + 1) * 5;
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: (index % 2 === 0 ? 1 : -1) * amp * drift.get() },
      { translateY: (index % 2 === 0 ? -1 : 1) * amp * 0.7 * drift.get() },
    ],
  }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: spec.color,
          opacity: spec.opacity,
          [right ? 'right' : 'left']: offsetX,
          [top ? 'top' : 'bottom']: offsetY,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});

/**
 * Glisser une ligne vers la gauche pour la retirer (liste, placard).
 * L'arrière-plan tomate se révèle, l'icône « pousse » au seuil (vibration),
 * puis la ligne file hors de l'écran avant `onRemove` (annulable par toast).
 */
import React, { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Trash2 } from 'lucide-react-native';

import { Text } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';

import { dampenRowSwipe, ROW_SWIPE_ACTIVATION_PX, rowSwipeProgress, shouldRemoveOnRelease } from './rowSwipe';

export interface SwipeToRemoveProps {
  children: React.ReactNode;
  onRemove: () => void;
  /** Libellé de l'action révélée (défaut « Retirer »). */
  label?: string;
  enabled?: boolean;
  /** Arrondi de l'arrière-plan (aligné sur la carte qui contient la ligne). */
  radius?: number;
}

export function SwipeToRemove({ children, onRemove, label = 'Retirer', enabled = true, radius = 0 }: SwipeToRemoveProps) {
  const t = useTheme();
  const c = t.colors;
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const translateX = useSharedValue(0);
  const armed = useSharedValue(0);

  const onArm = () => haptics.select();
  const remove = () => {
    haptics.warning();
    onRemove();
  };
  const spring = t.motion.spring;
  const snappy = t.motion.springSnappy;
  const exit = t.motion.duration.fast;

  const pan = usePanGesture({
    enabled,
    activeOffsetX: [-ROW_SWIPE_ACTIVATION_PX, ROW_SWIPE_ACTIVATION_PX],
    failOffsetY: [-10, 10],
    onUpdate: (e) => {
      'worklet';
      translateX.set(dampenRowSwipe(e.translationX, width));
      const p = rowSwipeProgress(e.translationX, width);
      if (p >= 1 && armed.get() === 0) {
        armed.set(1);
        scheduleOnRN(onArm);
      } else if (p < 1 && armed.get() === 1) {
        armed.set(0);
      }
    },
    onDeactivate: (e) => {
      'worklet';
      const go = shouldRemoveOnRelease(e.translationX, e.velocityX, width);
      armed.set(0);
      if (!go) {
        translateX.set(withSpring(0, spring));
        return;
      }
      if (reduced) {
        scheduleOnRN(remove);
        return;
      }
      translateX.set(
        withTiming(-Math.max(width, 320), { duration: exit }, (finished) => {
          if (finished) scheduleOnRN(remove);
        }),
      );
    },
  });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.get() }] }));
  const bgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(rowSwipeProgress(translateX.get(), width), [0, 0.12, 1], [0, 0.9, 1], Extrapolation.CLAMP),
  }));
  const iconStyle = useAnimatedStyle(() => {
    const p = rowSwipeProgress(translateX.get(), width);
    return {
      transform: [
        { scale: withSpring(armed.get() ? 1.15 : interpolate(p, [0, 1], [0.7, 1], Extrapolation.CLAMP), snappy) },
        { rotate: `${interpolate(p, [0, 1], [-25, 0], Extrapolation.CLAMP)}deg` },
      ],
    };
  });

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={styles.wrap}>
      <Animated.View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={[styles.bg, { backgroundColor: c.danger, borderRadius: radius, paddingRight: t.spacing.xl, gap: t.spacing.sm }, bgStyle]}
      >
        <Animated.View style={iconStyle}>
          <Trash2 size={t.iconSize.md} color={c.onDanger} strokeWidth={2.4} />
        </Animated.View>
        <Text variant="headline" style={{ color: c.onDanger }}>
          {label}
        </Text>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  bg: { ...StyleSheet.absoluteFill, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
});

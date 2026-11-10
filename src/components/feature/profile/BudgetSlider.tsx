/**
 * Curseur de budget hebdomadaire (30 → 300 €, crans de 5 €).
 *
 * - Glisser ou toucher la piste (Gesture Handler v3, thread UI) ; le pouce
 *   suit le doigt au pixel près puis s'aimante au cran au ressort.
 * - Chaque cran franchi : retour haptique « sélection » ; le grand prix au-
 *   dessus défile (`AnimatedPrice`).
 * - Accessible : rôle « ajustable » (gestes haut / bas = ± 5 €), boutons
 *   − / + (≥ 44 pt) pour le clavier, le web et la motricité fine.
 *
 * Composant contrôlé : `value` (centimes) + `onChange`.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Minus, Plus } from 'lucide-react-native';

import { AnimatedPrice, IconButton, Row, Text } from '@/components/ui';
import { formatPrice } from '@/core';
import { haptics } from '@/lib/haptics';
import { boxShadow, useTheme } from '@/theme';

import { BUDGET_RANGE, budgetFromPosition, budgetToRatio, snapBudgetCents, type BudgetRange } from './profileOptions';

export interface BudgetSliderProps {
  value: number;
  onChange: (cents: number) => void;
  range?: BudgetRange;
  accessibilityLabel?: string;
  testID?: string;
}

const THUMB = 32;
const TRACK = 10;

export function BudgetSlider({
  value,
  onChange,
  range = BUDGET_RANGE,
  accessibilityLabel = 'Budget courses par semaine',
  testID = 'budget-slider',
}: BudgetSliderProps) {
  const t = useTheme();
  const c = t.colors;
  const reduced = useReducedMotion();
  const snapped = snapBudgetCents(value, range);

  const [width, setWidth] = useState(0);
  const widthSv = useSharedValue(0);
  /** Position du pouce en px (0 → largeur utile). */
  const x = useSharedValue(0);
  const dragging = useSharedValue(0);
  const lastEmitted = useSharedValue(snapped);

  // Évite de renvoyer `onChange` pour une valeur déjà émise.
  const valueRef = useRef(snapped);
  useEffect(() => {
    valueRef.current = snapped;
  }, [snapped]);

  const emit = (cents: number) => {
    if (cents === valueRef.current) return;
    valueRef.current = cents;
    haptics.select();
    onChange(cents);
  };

  // Synchronise le pouce quand la valeur change de l'extérieur (boutons, a11y).
  useEffect(() => {
    lastEmitted.set(snapped);
    if (dragging.get() === 1) return;
    const target = budgetToRatio(snapped, range) * width;
    x.set(reduced || width === 0 ? target : withSpring(target, t.motion.springIndicator));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapped, width, reduced]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.max(0, e.nativeEvent.layout.width - THUMB);
    widthSv.set(w);
    setWidth(w);
  };

  const pan = usePanGesture({
    activeOffsetX: [-4, 4],
    failOffsetY: [-14, 14],
    onActivate: () => {
      'worklet';
      dragging.set(1);
    },
    onUpdate: (e) => {
      'worklet';
      const w = widthSv.get();
      const px = Math.min(w, Math.max(0, e.x - THUMB / 2));
      x.set(px);
      const cents = budgetFromPosition(px, w, range);
      if (cents !== lastEmitted.get()) {
        lastEmitted.set(cents);
        scheduleOnRN(emit, cents);
      }
    },
    onFinalize: () => {
      'worklet';
      dragging.set(0);
      // Aimantation finale sur le cran.
      const w = widthSv.get();
      x.set(withSpring(budgetToRatio(lastEmitted.get(), range) * w, t.motion.springIndicator));
    },
  });

  const tap = useTapGesture({
    onActivate: (e) => {
      'worklet';
      const w = widthSv.get();
      const cents = budgetFromPosition(e.x - THUMB / 2, w, range);
      lastEmitted.set(cents);
      x.set(withSpring(budgetToRatio(cents, range) * w, t.motion.springIndicator));
      scheduleOnRN(emit, cents);
    },
  });

  const gesture = useCompetingGestures(pan, tap);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { scale: withSpring(dragging.get() ? 1.15 : 1, t.motion.springSnappy) }],
  }));
  const fillStyle = useAnimatedStyle(() => ({ width: x.get() + TRACK }));

  const step = (dir: 1 | -1) => {
    const next = snapBudgetCents(snapped + dir * range.stepCents, range);
    if (next === snapped) {
      haptics.warning();
      return;
    }
    emit(next);
  };

  const ticks = [range.minCents, Math.round((range.minCents + range.maxCents) / 2 / range.stepCents) * range.stepCents, range.maxCents];

  return (
    <View testID={testID}>
      <Row justify="space-between" align="center">
        <IconButton
          icon={Minus}
          variant="tonal"
          accessibilityLabel={`Baisser le budget de ${formatPrice(range.stepCents)}`}
          onPress={() => step(-1)}
          disabled={snapped <= range.minCents}
          testID={`${testID}-dec`}
        />
        <View style={styles.priceWrap}>
          <AnimatedPrice cents={snapped} variant="priceLarge" options={{ compact: true }} testID={`${testID}-value`} style={styles.price} />
          <Text variant="footnote" color="textSecondary">
            par semaine
          </Text>
        </View>
        <IconButton
          icon={Plus}
          variant="tonal"
          accessibilityLabel={`Augmenter le budget de ${formatPrice(range.stepCents)}`}
          onPress={() => step(1)}
          disabled={snapped >= range.maxCents}
          testID={`${testID}-inc`}
        />
      </Row>

      <GestureDetector gesture={gesture}>
        <View
          onLayout={onLayout}
          style={[styles.hit, { marginTop: t.spacing.lg }]}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={accessibilityLabel}
          accessibilityValue={{ min: range.minCents / 100, max: range.maxCents / 100, now: snapped / 100, text: `${formatPrice(snapped, { compact: true })} par semaine` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
          testID={`${testID}-track`}
        >
          <View style={[styles.track, { backgroundColor: c.backgroundAlt, left: THUMB / 2 - TRACK / 2, right: THUMB / 2 - TRACK / 2 }]} />
          <Animated.View style={[styles.fill, { backgroundColor: c.accent }, fillStyle]} />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.thumb,
              {
                backgroundColor: c.surfaceElevated,
                borderColor: c.accent,
                boxShadow: boxShadow('md', c.shadow),
              },
              thumbStyle,
            ]}
          >
            <View style={[styles.thumbDot, { backgroundColor: c.accent }]} />
          </Animated.View>
        </View>
      </GestureDetector>

      <Row justify="space-between" style={{ marginTop: t.spacing.xs, paddingHorizontal: t.spacing.xxs }}>
        {ticks.map((cents) => (
          <Text key={cents} variant="caption" color="textSecondary" tabular>
            {formatPrice(cents, { compact: true })}
          </Text>
        ))}
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  priceWrap: { alignItems: 'center', flex: 1 },
  price: { textAlign: 'center' },
  hit: { height: 44, justifyContent: 'center' },
  track: { position: 'absolute', height: TRACK, borderRadius: TRACK / 2 },
  fill: { position: 'absolute', left: THUMB / 2 - TRACK / 2, height: TRACK, borderRadius: TRACK / 2 },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbDot: { width: 8, height: 8, borderRadius: 4 },
});

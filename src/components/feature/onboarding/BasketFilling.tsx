/**
 * Animation de génération du planning : des ingrédients tombent dans le
 * panier Cabas, qui s'écrase légèrement à chaque réception. Une seule
 * horloge partagée (thread UI) pilote tous les éléments.
 * « Réduire les animations » : panier statique garni.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { BasketMark } from '@/components/brand';
import { useTheme } from '@/theme';

const EMOJIS = ['🥕', '🍅', '🧅', '🥖', '🧀', '🥚', '🍋', '🥦'] as const;
const N = EMOJIS.length;
/** Écart entre deux chutes (ms). */
const INTERVAL = 380;
/** Durée d'une chute, en nombre d'intervalles. */
const FALL = 2.4;
/** Fraction de la chute où l'ingrédient atteint l'ouverture du panier. */
const LAND = 0.68;
/** Décalages horizontaux (fraction de la largeur du panier). */
const X_OFFSETS = [-0.2, 0.12, -0.04, 0.22, -0.16, 0.05, 0.18, -0.09];
const SPINS = [-40, 35, -20, 50, -30, 25, -45, 30];

export interface BasketFillingProps {
  size?: number;
  /** Arrête les chutes (fin de génération). */
  paused?: boolean;
  testID?: string;
}

export function BasketFilling({ size = 220, paused = false, testID }: BasketFillingProps) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const clock = useSharedValue(0);
  const basket = size * 0.66;
  const basketTop = size - basket - size * 0.06;
  const mouthY = basketTop + basket * (58 / 120);

  useEffect(() => {
    if (reduced || paused) {
      cancelAnimation(clock);
      return;
    }
    clock.set(withRepeat(withTiming(1, { duration: N * INTERVAL, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(clock);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, paused]);

  const basketStyle = useAnimatedStyle(() => {
    if (reduced) return { transform: [{ scaleX: 1 }, { scaleY: 1 }] };
    let bump = 0;
    for (let i = 0; i < N; i++) {
      const raw = clock.get() * N - i;
      const local = ((raw % N) + N) % N;
      const d = local - LAND * FALL;
      if (d >= 0 && d < 0.7) bump = Math.max(bump, Math.sin((Math.PI * d) / 0.7));
    }
    return { transform: [{ scaleX: 1 + 0.035 * bump }, { scaleY: 1 - 0.06 * bump }] };
  });

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Cabas remplit ton panier"
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: t.colors.accentSoft }]}
    >
      {reduced ? (
        <View style={[styles.staticPile, { top: mouthY - 30, width: basket }]}>
          {EMOJIS.slice(0, 4).map((e) => (
            <Animated.Text key={e} style={styles.emoji}>
              {e}
            </Animated.Text>
          ))}
        </View>
      ) : (
        EMOJIS.map((e, i) => (
          <Falling key={e} emoji={e} index={i} clock={clock} size={size} basket={basket} mouthY={mouthY} />
        ))
      )}
      <Animated.View style={[styles.basket, { top: basketTop, width: basket, height: basket, transformOrigin: 'bottom' }, basketStyle]}>
        <BasketMark size={basket} variant={t.scheme === 'dark' ? 'reversed' : 'color'} />
      </Animated.View>
    </View>
  );
}

function Falling({
  emoji,
  index,
  clock,
  size,
  basket,
  mouthY,
}: {
  emoji: string;
  index: number;
  clock: SharedValue<number>;
  size: number;
  basket: number;
  mouthY: number;
}) {
  const startY = -48;
  const endY = mouthY + basket * 0.22;
  const landY = mouthY - 26;
  const x = size / 2 - 18 + X_OFFSETS[index] * basket;
  const spin = SPINS[index];
  const style = useAnimatedStyle(() => {
    const raw = clock.get() * N - index;
    const local = ((raw % N) + N) % N;
    if (local > FALL || clock.get() === 0) return { opacity: 0, transform: [{ translateY: startY }] };
    const p = local / FALL;
    // Chute « gravitaire » (quadratique) jusqu'à l'ouverture, puis glisse dans le panier.
    const y = p < LAND ? startY + (landY - startY) * (p / LAND) * (p / LAND) : landY + (endY - landY) * ((p - LAND) / (1 - LAND));
    const opacity = p > 0.82 ? Math.max(0, 1 - (p - 0.82) / 0.18) : Math.min(1, p * 6);
    return {
      opacity,
      transform: [{ translateY: y }, { rotate: `${spin * p}deg` }, { scale: p > LAND ? 1 - (p - LAND) * 0.6 : 1 }],
    };
  });
  return (
    <Animated.Text style={[styles.emoji, styles.falling, { left: x }, style]} accessibilityElementsHidden importantForAccessibility="no">
      {emoji}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  circle: { overflow: 'hidden', alignItems: 'center' },
  basket: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  falling: { position: 'absolute', top: 0 },
  emoji: { fontSize: 30, lineHeight: 36, width: 36, textAlign: 'center' },
  staticPile: { position: 'absolute', flexDirection: 'row', justifyContent: 'center' },
});

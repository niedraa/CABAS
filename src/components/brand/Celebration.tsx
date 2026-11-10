/**
 * Célébration : pastille centrale qui « pousse » au ressort et gerbe de
 * confettis (cercles, carrés, bandes) aux couleurs du marché.
 * À jouer quand une étape importante aboutit (semaine générée, commande prête).
 * Changer `playKey` rejoue l'animation. Statique si « Réduire les animations ».
 */
import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptics } from '@/lib/haptics';
import { motion, palette, useTheme } from '@/theme';

import { BasketMark } from './CabasLogo';
import { produceColors } from './Illustrations';

export interface CelebrationProps {
  size?: number;
  /** Changer cette valeur rejoue l'animation. */
  playKey?: number | string;
  /** Contenu central (défaut : panier Cabas). */
  children?: React.ReactNode;
  /** Retour haptique « succès » au départ (défaut true). */
  haptic?: boolean;
  onDone?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const COLORS = [palette.moutarde500, produceColors.tomato, produceColors.leaf, palette.foret600, produceColors.lemon, '#D98BA6'];
const PIECES = 22;

/** Générateur pseudo-aléatoire déterministe (même gerbe à chaque rendu). */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

interface Confetto {
  angle: number;
  distance: number;
  color: string;
  shape: 'circle' | 'square' | 'strip';
  spin: number;
  size: number;
  delay: number;
}

export function Celebration({
  size = 200,
  playKey = 0,
  children,
  haptic = true,
  onDone,
  accessibilityLabel = 'Bravo !',
  style,
}: CelebrationProps) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const burst = useSharedValue(reduced ? 1 : 0);
  const pop = useSharedValue(reduced ? 1 : 0);

  const pieces = useMemo<Confetto[]>(() => {
    const rnd = mulberry32(7);
    return Array.from({ length: PIECES }, (_, i) => ({
      angle: (i / PIECES) * Math.PI * 2 + rnd() * 0.4,
      distance: size * (0.32 + rnd() * 0.2),
      color: COLORS[i % COLORS.length],
      shape: (['circle', 'square', 'strip'] as const)[i % 3],
      spin: (rnd() - 0.5) * 720,
      size: 6 + rnd() * 6,
      delay: rnd() * 80,
    }));
  }, [size]);

  useEffect(() => {
    if (reduced) {
      burst.set(1);
      pop.set(1);
      return;
    }
    if (haptic) haptics.success();
    burst.set(0);
    pop.set(0);
    pop.set(withSpring(1, motion.springBouncy));
    burst.set(
      withTiming(1, { duration: motion.duration.celebrate, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished && onDone) scheduleOnRN(onDone);
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey, reduced]);

  const centerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.get() }, { rotate: `${(1 - pop.get()) * -20}deg` }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 1 - burst.get(),
    transform: [{ scale: 0.6 + burst.get() * 0.9 }],
  }));

  const core = size * 0.46;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[{ width: size, height: size }, styles.center, style]}
    >
      {/* Onde de choc */}
      <Animated.View
        style={[
          styles.abs,
          { width: core * 1.5, height: core * 1.5, borderRadius: core, borderWidth: 3, borderColor: palette.moutarde300 },
          ringStyle,
        ]}
      />
      {!reduced &&
        pieces.map((p, i) => <ConfettoView key={i} piece={p} progress={burst} />)}
      <Animated.View
        style={[
          styles.center,
          { width: core, height: core, borderRadius: core / 2, backgroundColor: t.colors.hero },
          centerStyle,
        ]}
      >
        {children ?? <BasketMark size={core * 0.62} variant="reversed" />}
      </Animated.View>
    </View>
  );
}

function ConfettoView({ piece, progress }: { piece: Confetto; progress: SharedValue<number> }) {
  const d = piece.delay / motion.duration.celebrate;
  const style = useAnimatedStyle(() => {
    const raw = (progress.get() - d) / (1 - d);
    const p = Math.max(0, Math.min(1, raw));
    // Trajectoire balistique : éjection radiale + gravité.
    const x = Math.cos(piece.angle) * piece.distance * p;
    const y = Math.sin(piece.angle) * piece.distance * p + 46 * p * p;
    return {
      opacity: p <= 0 ? 0 : p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25,
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${piece.spin * p}deg` },
        { scale: 0.4 + 0.6 * Math.min(1, p * 3) },
      ],
    };
  });
  const dims =
    piece.shape === 'strip'
      ? { width: piece.size * 0.5, height: piece.size * 1.6, borderRadius: 2 }
      : piece.shape === 'square'
        ? { width: piece.size, height: piece.size, borderRadius: 2 }
        : { width: piece.size, height: piece.size, borderRadius: piece.size / 2 };
  return <Animated.View style={[styles.abs, dims, { backgroundColor: piece.color }, style]} />;
}


const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  abs: { position: 'absolute' },
});

/**
 * Fait apparaître ses enfants les uns après les autres (fondu + glissement
 * vers le haut au ressort, décalage `motion.stagger`).
 * Reanimated coupe automatiquement ces animations si « Réduire les
 * animations » est actif (ReduceMotion.System).
 */
import React, { Children } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { motion, spacing } from '@/theme';

import { type SpacingKey } from './Stack';

export interface StaggeredListProps {
  children: React.ReactNode;
  gap?: SpacingKey;
  /** Délai entre éléments (ms) — défaut `motion.stagger`. */
  stagger?: number;
  initialDelay?: number;
  /** Plafond du délai cumulé pour les longues listes. */
  maxDelay?: number;
  style?: StyleProp<ViewStyle>;
}

/** Animation d'entrée standard d'un élément de liste (réutilisable seule). */
export function staggerEntering(index: number, stagger: number = motion.stagger, initialDelay = 0, maxDelay = 600) {
  return FadeInDown.delay(Math.min(maxDelay, initialDelay + index * stagger))
    .springify()
    .damping(motion.spring.damping)
    .stiffness(motion.spring.stiffness)
    .mass(motion.spring.mass);
}

export function StaggeredList({
  children,
  gap = 'md',
  stagger = motion.stagger,
  initialDelay = 0,
  maxDelay = 600,
  style,
}: StaggeredListProps) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ gap: spacing[gap] }, style]}>
      {items.map((child, i) => (
        <Animated.View
          key={(React.isValidElement(child) && child.key) || i}
          entering={staggerEntering(i, stagger, initialDelay, maxDelay)}
          layout={LinearTransition.springify().damping(motion.spring.damping).stiffness(motion.spring.stiffness)}
        >
          {child}
        </Animated.View>
      ))}
    </View>
  );
}

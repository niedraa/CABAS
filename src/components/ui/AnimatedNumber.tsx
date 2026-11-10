/**
 * Nombre qui « défile » jusqu'à sa nouvelle valeur (total du panier,
 * économies, budget). La valeur animée vit sur le thread UI ; on ne
 * re-rend côté JS que quand l'entier affiché change.
 */
import React, { useEffect, useState } from 'react';
import { type StyleProp, type TextStyle } from 'react-native';
import {
  useAnimatedReaction,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { formatPriceForA11y } from '@/lib/a11y';
import { formatCents, type FormatCentsOptions } from '@/lib/format';
import { type TypographyVariant } from '@/theme';

import { Text, type ThemeColorKey } from './Text';

export interface AnimatedNumberProps {
  value: number;
  format?: (n: number) => string;
  variant?: TypographyVariant;
  color?: ThemeColorKey;
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

/** Ressort « compteur » : amorti, sans dépassement (un total ne rebondit pas). */
const COUNTER_SPRING = { damping: 30, stiffness: 120, mass: 1, overshootClamping: true } as const;

export function AnimatedNumber({
  value,
  format = (n) => String(n),
  variant = 'price',
  color = 'text',
  style,
  accessibilityLabel,
  testID,
}: AnimatedNumberProps) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(Math.round(value));
  const anim = useSharedValue(value);

  useEffect(() => {
    if (reduced) {
      // Animations réduites : affichage direct (voir `shown`).
      anim.set(value);
      return;
    }
    anim.set(
      withSpring(value, COUNTER_SPRING, (finished) => {
        if (finished) scheduleOnRN(setDisplay, Math.round(value));
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduced]);

  const shown = reduced ? Math.round(value) : display;

  useAnimatedReaction(
    () => Math.round(anim.get()),
    (cur, prev) => {
      if (cur !== prev) scheduleOnRN(setDisplay, cur);
    },
  );

  return (
    <Text
      testID={testID}
      variant={variant}
      color={color}
      tabular
      style={style}
      accessibilityLabel={accessibilityLabel}
      accessibilityLiveRegion="polite"
    >
      {format(shown)}
    </Text>
  );
}

export interface AnimatedPriceProps extends Omit<AnimatedNumberProps, 'value' | 'format'> {
  cents: number;
  options?: FormatCentsOptions;
}

/** Prix animé (centimes → « 42,80 € »). */
export function AnimatedPrice({ cents, options, accessibilityLabel, ...rest }: AnimatedPriceProps) {
  return (
    <AnimatedNumber
      value={cents}
      format={(n) => formatCents(n, options)}
      accessibilityLabel={accessibilityLabel ?? formatPriceForA11y(cents)}
      {...rest}
    />
  );
}


/**
 * Carte « papier » de la DA : coins généreux (20–28 pt), fond papier sur crème.
 * - plain    : papier sans bordure
 * - elevated : papier + ombre douce
 * - outlined : papier + filet
 * - hero     : forêt profond + cercles décoratifs (bandeaux, résumés)
 * - accent   : moutarde tendre (mises en avant, premium)
 * Avec `onPress`, la carte devient pressable (ressort + haptique).
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { boxShadow, useTheme } from '@/theme';

import { PressableScale, type PressableScaleProps } from './PressableScale';
import { type SpacingKey } from './Stack';

export type CardVariant = 'plain' | 'elevated' | 'outlined' | 'hero' | 'accent';

export interface CardProps extends Omit<ViewProps, 'style'> {
  variant?: CardVariant;
  padding?: SpacingKey;
  radius?: 'md' | 'lg' | 'xl';
  onPress?: PressableScaleProps['onPress'];
  onLongPress?: PressableScaleProps['onLongPress'];
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Décor de cercles (activé par défaut en `hero`). */
  decor?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export function Card({
  variant = 'plain',
  padding = 'lg',
  radius = 'lg',
  onPress,
  onLongPress,
  decor,
  style,
  children,
  accessibilityLabel,
  accessibilityHint,
  ...rest
}: CardProps) {
  const t = useTheme();
  const c = t.colors;
  const variantStyle: Record<CardVariant, ViewStyle> = {
    plain: { backgroundColor: c.surface },
    elevated: { backgroundColor: c.surface, boxShadow: boxShadow('md', c.shadow) },
    outlined: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    hero: { backgroundColor: c.hero },
    accent: { backgroundColor: c.accentSoft },
  };
  const showDecor = decor ?? variant === 'hero';
  const containerStyle: StyleProp<ViewStyle> = [
    styles.base,
    { borderRadius: t.radius[radius], padding: t.spacing[padding] },
    variantStyle[variant],
    style,
  ];
  const content = (
    <>
      {showDecor && <HeroCircles color={variant === 'hero' ? c.heroCircle : c.accent} />}
      {children}
    </>
  );

  if (onPress || onLongPress) {
    return (
      <PressableScale
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        scaleTo={0.98}
        style={containerStyle}
        {...rest}
      >
        {content}
      </PressableScale>
    );
  }
  return (
    <View
      style={containerStyle}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      {...rest}
    >
      {content}
    </View>
  );
}

/** Deux grands cercles doux qui débordent du coin haut-droit (motif signature). */
function HeroCircles({ color }: { color: string }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.circle, styles.circleA, { backgroundColor: color }]} />
      <View style={[styles.circle, styles.circleB, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
  circle: { position: 'absolute', borderRadius: 999 },
  circleA: { width: 180, height: 180, top: -90, right: -50, opacity: 0.35 },
  circleB: { width: 120, height: 120, top: -20, right: -70, opacity: 0.25 },
});

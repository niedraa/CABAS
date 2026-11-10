/**
 * Bouton rond ne contenant qu'une icône. `accessibilityLabel` OBLIGATOIRE.
 * Zone tactile ≥ 44 pt même en taille `sm` (hitSlop).
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme, withAlpha } from '@/theme';

import { renderIcon, type IconLike } from './icon';
import { PressableScale, type PressableScaleProps } from './PressableScale';

export type IconButtonVariant = 'plain' | 'tonal' | 'outlined' | 'filled' | 'accent' | 'hero';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends Omit<PressableScaleProps, 'children' | 'style'> {
  icon: IconLike;
  accessibilityLabel: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** Pastille de notification (point tomate). */
  dot?: boolean;
  /** Couleur d'icône forcée. */
  color?: string;
  style?: StyleProp<ViewStyle>;
}

const DIM = { sm: 36, md: 44, lg: 52 } as const;
const ICON = { sm: 18, md: 20, lg: 24 } as const;

export function IconButton({
  icon,
  variant = 'plain',
  size = 'md',
  dot,
  color,
  disabled,
  style,
  hitSlop,
  ...rest
}: IconButtonProps) {
  const t = useTheme();
  const c = t.colors;
  const map: Record<IconButtonVariant, { bg: string; fg: string; border?: string }> = {
    plain: { bg: 'transparent', fg: c.text },
    tonal: { bg: c.primarySoft, fg: t.scheme === 'dark' ? c.text : c.primary },
    outlined: { bg: c.surface, fg: c.text, border: c.border },
    filled: { bg: c.primary, fg: c.onPrimary },
    accent: { bg: c.accent, fg: c.onAccent },
    hero: { bg: withAlpha('#F3EEE3', 0.14), fg: c.heroText },
  };
  const m = map[variant];
  const dim = DIM[size];
  const slop = Math.max(0, (t.layout.minTouchTarget - dim) / 2);

  return (
    <PressableScale
      disabled={disabled}
      scaleTo={0.9}
      hitSlop={hitSlop ?? (slop > 0 ? { top: slop, bottom: slop, left: slop, right: slop } : undefined)}
      style={[
        styles.base,
        {
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          backgroundColor: m.bg,
          borderWidth: m.border ? 1 : 0,
          borderColor: m.border,
          opacity: disabled ? t.opacity.disabled : 1,
        },
        style,
      ]}
      {...rest}
    >
      {renderIcon(icon, { size: ICON[size], color: color ?? m.fg })}
      {dot && (
        <View
          style={[styles.dot, { backgroundColor: c.danger, borderColor: m.bg === 'transparent' ? c.background : m.bg }]}
        />
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
});

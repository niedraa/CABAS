/**
 * Bouton de la DA.
 * - primary   : moutarde, texte forêt — LE geste principal de l'écran (un seul par écran)
 * - secondary : forêt plein, texte crème
 * - tonal     : vert tendre, texte forêt (actions secondaires fréquentes)
 * - ghost     : transparent (actions tertiaires, « Annuler »)
 * - danger    : tomate (suppression, irréversible)
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { renderIcon, type IconLike } from './icon';
import { PressableScale, type PressableScaleProps } from './PressableScale';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'tonal' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableScaleProps, 'children' | 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: IconLike;
  rightIcon?: IconLike;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SIZES = {
  sm: { padH: 14, font: 14, icon: 16, gap: 6 },
  md: { padH: 20, font: 16, icon: 18, gap: 8 },
  lg: { padH: 24, font: 17, icon: 20, gap: 10 },
} as const;

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  leftIcon,
  rightIcon,
  loading = false,
  fullWidth = false,
  disabled,
  style,
  accessibilityLabel,
  haptic,
  ...rest
}: ButtonProps) {
  const t = useTheme();
  const c = t.colors;
  const s = SIZES[size];

  const palette: Record<ButtonVariant, { bg: string; fg: string; border?: string; relief: boolean }> = {
    primary: { bg: c.accent, fg: c.onAccent, relief: true },
    secondary: { bg: c.primary, fg: c.onPrimary, relief: true },
    tonal: { bg: c.primarySoft, fg: t.scheme === 'dark' ? c.text : c.primary, relief: false },
    ghost: { bg: 'transparent', fg: c.primary, relief: false },
    danger: { bg: c.danger, fg: c.onDanger, relief: true },
  };
  const p = palette[variant];
  const isDisabled = disabled || loading;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      haptic={haptic ?? (variant === 'primary' ? 'impact' : 'tap')}
      style={[
        styles.base,
        {
          height: t.controlHeight[size],
          paddingHorizontal: s.padH,
          borderRadius: t.radius.pill,
          backgroundColor: p.bg,
          // Relief « tactile » : liseré intérieur plus sombre en bas.
          boxShadow: p.relief ? 'inset 0px -3px 0px rgba(0, 0, 0, 0.14)' : undefined,
          opacity: disabled ? t.opacity.disabled : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
      {...rest}
    >
      <View style={[styles.content, { gap: s.gap, opacity: loading ? 0 : 1 }]}>
        {renderIcon(leftIcon, { size: s.icon, color: p.fg, strokeWidth: 2.2 })}
        <Text
          variant="headline"
          numberOfLines={1}
          style={{ color: p.fg, fontSize: s.font, lineHeight: s.font + 6 }}
        >
          {label}
        </Text>
        {renderIcon(rightIcon, { size: s.icon, color: p.fg, strokeWidth: 2.2 })}
      </View>
      {loading && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={styles.spinner}>
            <ActivityIndicator color={p.fg} size="small" accessibilityLabel="Chargement" />
          </View>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

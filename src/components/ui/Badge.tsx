/**
 * Étiquette compacte (statut, promo, premium, nouveauté).
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { renderIcon, type IconLike } from './icon';
import { Text } from './Text';

export type BadgeTone = 'neutral' | 'success' | 'accent' | 'danger' | 'info' | 'premium';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  variant?: 'soft' | 'solid';
  size?: 'sm' | 'md';
  icon?: IconLike;
  emoji?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function Badge({
  label,
  tone = 'neutral',
  variant = 'soft',
  size = 'md',
  icon,
  emoji,
  style,
  accessibilityLabel,
}: BadgeProps) {
  const t = useTheme();
  const c = t.colors;
  const soft: Record<BadgeTone, { bg: string; fg: string }> = {
    neutral: { bg: t.scheme === 'dark' ? c.surfaceElevated : c.backgroundAlt, fg: c.textSecondary },
    success: { bg: c.successSoft, fg: c.success },
    accent: { bg: c.accentSoft, fg: c.accentText },
    danger: { bg: c.dangerSoft, fg: c.danger },
    info: { bg: c.infoSoft, fg: c.info },
    premium: { bg: t.scheme === 'dark' ? c.accentSoft : c.hero, fg: c.accent },
  };
  const solid: Record<BadgeTone, { bg: string; fg: string }> = {
    neutral: { bg: c.text, fg: c.background },
    success: { bg: c.success, fg: t.scheme === 'dark' ? c.background : c.surface },
    accent: { bg: c.accent, fg: c.onAccent },
    danger: { bg: c.danger, fg: c.onDanger },
    info: { bg: c.info, fg: t.scheme === 'dark' ? c.background : c.surface },
    premium: { bg: c.accent, fg: c.onAccent },
  };
  const p = (variant === 'solid' ? solid : soft)[tone];
  const sm = size === 'sm';
  return (
    <View
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.base,
        {
          backgroundColor: p.bg,
          borderRadius: t.radius.pill,
          paddingHorizontal: sm ? 8 : 10,
          height: sm ? 22 : 26,
        },
        style,
      ]}
    >
      {emoji ? <Text style={{ fontSize: sm ? 11 : 13 }}>{emoji}</Text> : renderIcon(icon, { size: sm ? 12 : 14, color: p.fg, strokeWidth: 2.4 })}
      <Text variant="caption" style={{ color: p.fg, fontSize: sm ? 11 : 12 }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
});

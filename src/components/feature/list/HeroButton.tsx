/**
 * Bouton secondaire posé sur un bandeau héros (forêt) : voile lin translucide,
 * texte lin — le pendant clair du bouton `ghost`, lisible sur fond sombre.
 */
import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale, renderIcon, Text, type IconLike } from '@/components/ui';
import { useTheme, withAlpha } from '@/theme';

export interface HeroButtonProps {
  label: string;
  onPress: () => void;
  icon?: IconLike;
  size?: 'sm' | 'md';
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function HeroButton({ label, onPress, icon, size = 'md', accessibilityLabel, style, testID }: HeroButtonProps) {
  const t = useTheme();
  const c = t.colors;
  const height = t.controlHeight[size];
  const slop = Math.max(0, (t.layout.minTouchTarget - height) / 2);
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={slop > 0 ? slop : undefined}
      style={[
        styles.base,
        {
          height,
          borderRadius: t.radius.pill,
          paddingHorizontal: size === 'sm' ? t.spacing.lg : t.spacing.xl,
          gap: t.spacing.xs,
          backgroundColor: withAlpha(c.heroText, 0.14),
        },
        style,
      ]}
      testID={testID}
    >
      {renderIcon(icon, { size: size === 'sm' ? t.iconSize.sm : t.iconSize.md, color: c.heroText, strokeWidth: 2.2 })}
      <Text
        variant={size === 'sm' ? 'subhead' : 'headline'}
        numberOfLines={1}
        style={{ color: c.heroText, fontFamily: t.typography.headline.fontFamily }}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});

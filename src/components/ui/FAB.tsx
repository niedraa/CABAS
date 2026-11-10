/**
 * Bouton d'action flottant (ajout manuel à la liste, « Générer ma semaine »).
 * Rond, ou étendu avec libellé. Moutarde = action principale.
 */
import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';

import { boxShadow, useTheme } from '@/theme';

import { renderIcon, type IconLike } from './icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { useSafeInsets } from './useSafeInsets';

export interface FABProps {
  icon: IconLike;
  /** Libellé : rend un FAB « étendu ». Sinon `accessibilityLabel` requis. */
  label?: string;
  accessibilityLabel?: string;
  onPress: () => void;
  /** Positionnement absolu en bas à droite (défaut true). */
  floating?: boolean;
  /** Décalage au-dessus de la barre d'onglets. */
  bottomOffset?: number;
  tone?: 'accent' | 'primary';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function FAB({
  icon,
  label,
  accessibilityLabel,
  onPress,
  floating = true,
  bottomOffset,
  tone = 'accent',
  style,
  testID,
}: FABProps) {
  const t = useTheme();
  const c = t.colors;
  const insets = useSafeInsets();
  const bg = tone === 'accent' ? c.accent : c.primary;
  const fg = tone === 'accent' ? c.onAccent : c.onPrimary;
  const bottom = bottomOffset ?? t.layout.tabBarHeight + insets.bottom + t.spacing.lg;

  return (
    <Animated.View
      entering={ZoomIn.springify().damping(t.motion.springBouncy.damping).stiffness(t.motion.springBouncy.stiffness)}
      exiting={ZoomOut.duration(t.motion.duration.fast)}
      style={[floating && { position: 'absolute', right: t.spacing.screen, bottom, zIndex: t.zIndex.fab }, style]}
    >
      <PressableScale
        testID={testID}
        onPress={onPress}
        haptic="impact"
        scaleTo={0.92}
        accessibilityLabel={accessibilityLabel ?? label}
        style={[
          styles.base,
          {
            backgroundColor: bg,
            height: 58,
            minWidth: 58,
            borderRadius: 29,
            paddingHorizontal: label ? 22 : 0,
            boxShadow: `${boxShadow('lg', c.shadow)}, inset 0px -3px 0px rgba(0, 0, 0, 0.14)`,
          },
        ]}
      >
        {renderIcon(icon, { size: 24, color: fg, strokeWidth: 2.4 })}
        {label ? (
          <Text variant="headline" style={{ color: fg }}>
            {label}
          </Text>
        ) : null}
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});

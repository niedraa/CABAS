/**
 * Barre supérieure : retour, titre centré, actions à droite.
 * `tone="hero"` pour les écrans à bandeau forêt.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';
import { ChevronLeft, X } from 'lucide-react-native';

import { useTheme } from '@/theme';

import { IconButton } from './IconButton';
import { Text } from './Text';
import { useSafeInsets } from './useSafeInsets';

export interface TopBarProps {
  title?: string;
  onBack?: () => void;
  /** Icône de retour : flèche (pile) ou croix (modale). */
  backIcon?: 'back' | 'close';
  backLabel?: string;
  right?: React.ReactNode;
  tone?: 'default' | 'hero' | 'transparent';
  /** Ajoute la marge de zone sûre en haut. */
  withSafeArea?: boolean;
  /**
   * Progression 0 → 1 (défilement) : fait apparaître le titre et le fond.
   * Utilisé par `Screen` avec un grand titre.
   */
  revealProgress?: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
}

export const TOP_BAR_HEIGHT = 52;

export function TopBar({
  title,
  onBack,
  backIcon = 'back',
  backLabel,
  right,
  tone = 'default',
  withSafeArea = false,
  revealProgress,
  style,
}: TopBarProps) {
  const t = useTheme();
  const c = t.colors;
  const insets = useSafeInsets();
  const hero = tone === 'hero';
  const bg = hero ? c.hero : tone === 'transparent' ? 'transparent' : c.background;

  const titleStyle = useAnimatedStyle(() => {
    if (!revealProgress) return { opacity: 1, transform: [{ translateY: 0 }] };
    const p = revealProgress.get();
    return {
      opacity: interpolate(p, [0.6, 1], [0, 1], Extrapolation.CLAMP),
      transform: [{ translateY: interpolate(p, [0.6, 1], [6, 0], Extrapolation.CLAMP) }],
    };
  });
  const borderStyle = useAnimatedStyle(() => ({
    opacity: revealProgress ? interpolate(revealProgress.get(), [0.8, 1], [0, 1], Extrapolation.CLAMP) : 0,
  }));

  return (
    <View style={[{ backgroundColor: bg, paddingTop: withSafeArea ? insets.top : 0 }, style]}>
      <View style={[styles.bar, { height: TOP_BAR_HEIGHT, paddingHorizontal: t.spacing.sm }]}>
        <View style={styles.side}>
          {onBack ? (
            <IconButton
              icon={backIcon === 'close' ? X : ChevronLeft}
              accessibilityLabel={backLabel ?? (backIcon === 'close' ? 'Fermer' : 'Retour')}
              variant={hero ? 'hero' : 'plain'}
              onPress={onBack}
            />
          ) : null}
        </View>
        <Animated.View style={[styles.titleWrap, titleStyle]} pointerEvents="none">
          {title ? (
            <Text
              variant="headline"
              numberOfLines={1}
              accessibilityRole="header"
              style={{ color: hero ? c.heroText : c.text }}
            >
              {title}
            </Text>
          ) : null}
        </Animated.View>
        <View style={[styles.side, styles.right]}>{right}</View>
      </View>
      {revealProgress ? (
        <Animated.View style={[styles.border, { backgroundColor: c.border }, borderStyle]} />
      ) : null}
    </View>
  );
}

/** Alias sémantique. */
export const Header = TopBar;

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center' },
  side: { minWidth: 88, flexDirection: 'row', alignItems: 'center' },
  right: { justifyContent: 'flex-end', gap: 4 },
  titleWrap: { flex: 1, alignItems: 'center' },
  border: { height: StyleSheet.hairlineWidth * 2 },
});

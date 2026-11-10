/**
 * Vignette recette : emoji sur pastel (style signature de Cabas, pas de photo
 * générique). Le pastel est choisi de façon déterministe à partir de `seed`.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { pastels, useTheme, type PastelKey } from '@/theme';

import { Text } from './Text';

export type RecipeThumbSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';

const DIM: Record<RecipeThumbSize, number> = { xs: 32, sm: 44, md: 56, lg: 72, xl: 96, hero: 140 };

/** Hash déterministe simple (djb2) → index de pastel. */
export function pastelFor(seed: string): (typeof pastels)[number] {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  return pastels[Math.abs(h) % pastels.length];
}

export interface RecipeThumbProps {
  emoji: string;
  size?: RecipeThumbSize;
  shape?: 'rounded' | 'circle';
  /** Pastel imposé ; sinon dérivé de `seed` (ou de l'emoji). */
  tone?: PastelKey;
  seed?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function RecipeThumb({
  emoji,
  size = 'md',
  shape = 'rounded',
  tone,
  seed,
  accessibilityLabel,
  style,
}: RecipeThumbProps) {
  const t = useTheme();
  const dim = DIM[size];
  const pastel = tone ? (pastels.find((p) => p.key === tone) ?? pastels[0]) : pastelFor(seed ?? emoji);
  const bg = t.scheme === 'dark' ? pastel.dark : pastel.light;
  const radius = shape === 'circle' ? dim / 2 : Math.round(dim * 0.3);
  const fontSize = Math.round(dim * 0.52);

  return (
    <View
      accessible={!!accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
      style={[styles.base, { width: dim, height: dim, borderRadius: radius, backgroundColor: bg }, style]}
    >
      {/* Petit reflet en haut à gauche : effet « assiette » tactile. */}
      <View
        style={[
          styles.shine,
          {
            width: dim * 0.55,
            height: dim * 0.55,
            borderRadius: dim,
            top: -dim * 0.18,
            left: -dim * 0.18,
            backgroundColor: t.scheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.3)',
          },
        ]}
      />
      <Text style={{ fontSize, lineHeight: Math.round(fontSize * 1.2) }} allowFontScaling={false}>
        {emoji}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  shine: { position: 'absolute' },
});

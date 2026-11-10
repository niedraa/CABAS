/**
 * Monogramme d'enseigne : cercle aux couleurs de la chaîne + initiale(s).
 * Jamais de logo officiel (droit des marques) — voir docs/brand.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { storeColors, useTheme } from '@/theme';

import { Text } from './Text';

export type StoreBadgeSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Monogrammes par enseigne (1 à 2 lettres). */
export const STORE_MONOGRAMS: Record<string, { initials: string; name: string }> = {
  leclerc: { initials: 'L', name: 'E.Leclerc' },
  carrefour: { initials: 'C', name: 'Carrefour' },
  auchan: { initials: 'A', name: 'Auchan' },
  intermarche: { initials: 'I', name: 'Intermarché' },
  lidl: { initials: 'Li', name: 'Lidl' },
  monoprix: { initials: 'M', name: 'Monoprix' },
};

const DIM: Record<StoreBadgeSize, number> = { xs: 20, sm: 28, md: 36, lg: 48, xl: 64 };

export interface StoreBadgeProps {
  /** Identifiant de chaîne (`leclerc`, `lidl`…). */
  chain: string;
  /** Nom affiché / lu si la chaîne est inconnue. */
  name?: string;
  size?: StoreBadgeSize;
  /** Liseré (pour empiler des badges qui se chevauchent). */
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function StoreBadge({ chain, name, size = 'md', ring, style }: StoreBadgeProps) {
  const t = useTheme();
  const key = chain.toLowerCase();
  const colors = storeColors[key] ?? storeColors.default;
  const mono = STORE_MONOGRAMS[key];
  const label = mono?.name ?? name ?? chain;
  const initials = mono?.initials ?? (name ?? chain).slice(0, 1).toUpperCase();
  const dim = DIM[size];
  const fontSize = Math.round(dim * (initials.length > 1 ? 0.4 : 0.48));

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Enseigne ${label}`}
      style={[
        styles.base,
        {
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          backgroundColor: colors.bg,
          borderWidth: ring ? Math.max(2, dim / 16) : 0,
          borderColor: t.colors.surface,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: colors.fg,
          fontFamily: t.typography.title1.fontFamily,
          fontSize,
          lineHeight: fontSize * 1.15,
          letterSpacing: -0.5,
        }}
        allowFontScaling={false}
      >
        {initials}
      </Text>
    </View>
  );
}

/** Pile de monogrammes qui se chevauchent (« comparé dans 4 enseignes »). */
export function StoreBadgeStack({
  chains,
  size = 'sm',
  max = 4,
  style,
}: {
  chains: string[];
  size?: StoreBadgeSize;
  max?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const dim = DIM[size];
  const shown = chains.slice(0, max);
  const extra = chains.length - shown.length;
  return (
    <View
      style={[styles.stack, style]}
      accessible
      accessibilityLabel={`${chains.length} enseignes comparées`}
    >
      {shown.map((ch, i) => (
        <StoreBadge key={ch} chain={ch} size={size} ring style={{ marginLeft: i === 0 ? 0 : -dim * 0.3, zIndex: max - i }} />
      ))}
      {extra > 0 ? (
        <View
          style={[
            styles.base,
            {
              width: dim,
              height: dim,
              borderRadius: dim / 2,
              marginLeft: -dim * 0.3,
              backgroundColor: t.colors.backgroundAlt,
              borderWidth: 2,
              borderColor: t.colors.surface,
            },
          ]}
        >
          <Text variant="caption" color="textSecondary">
            +{extra}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  stack: { flexDirection: 'row', alignItems: 'center' },
});

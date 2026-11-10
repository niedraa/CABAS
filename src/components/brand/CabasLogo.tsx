/**
 * Logo Cabas : le panier (moutarde, fentes forêt, anse) + mot-symbole optionnel.
 *
 * Variantes :
 * - `color`    : sur fond clair (anse forêt)
 * - `reversed` : sur fond forêt / sombre (anse crème)
 * - `mono`     : une seule couleur (`color`, défaut texte), fentes ajourées
 * Sans `variant`, le logo choisit `color` en clair et `reversed` en sombre.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Text } from '@/components/ui';
import { palette, useTheme } from '@/theme';

import { BASKET_VIEWBOX, basketBodyWithHoles, basketGeometry as g } from './basket';

export type LogoVariant = 'color' | 'mono' | 'reversed';

export interface CabasLogoProps {
  /** Hauteur du pictogramme en pt (défaut 40). */
  size?: number;
  variant?: LogoVariant;
  withWordmark?: boolean;
  /** Slogan sous le mot-symbole (« Tes courses, de A à Z. »). */
  withTagline?: boolean;
  /** Couleur de la version mono. */
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export const TAGLINE = 'Tes courses, de A à Z.';

export function BasketMark({
  size = 40,
  variant = 'color',
  color,
}: {
  size?: number;
  variant?: LogoVariant;
  color?: string;
}) {
  if (variant === 'mono') {
    const fill = color ?? palette.foret800;
    return (
      <Svg width={size} height={size} viewBox={BASKET_VIEWBOX}>
        <Path d={g.handle} stroke={fill} strokeWidth={g.handleStroke} strokeLinecap="round" fill="none" />
        <Path d={basketBodyWithHoles} fill={fill} fillRule="evenodd" />
      </Svg>
    );
  }
  const handle = variant === 'reversed' ? palette.creme : palette.foret800;
  return (
    <Svg width={size} height={size} viewBox={BASKET_VIEWBOX}>
      <Path d={g.handle} stroke={handle} strokeWidth={g.handleStroke} strokeLinecap="round" fill="none" />
      <Path d={g.body} fill={palette.moutarde500} />
      {g.slots.map((s, i) => (
        <Rect key={i} {...s} fill={palette.foret800} />
      ))}
    </Svg>
  );
}

export function CabasLogo({
  size = 40,
  variant,
  withWordmark = false,
  withTagline = false,
  color,
  style,
}: CabasLogoProps) {
  const t = useTheme();
  const v: LogoVariant = variant ?? (t.scheme === 'dark' ? 'reversed' : 'color');
  const wordColor =
    v === 'mono' ? (color ?? t.colors.text) : v === 'reversed' ? palette.lin : palette.foret800;
  const fontSize = Math.round(size * 0.8);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={withTagline ? `Cabas. ${TAGLINE}` : 'Cabas'}
      style={[styles.row, { gap: size * 0.18 }, style]}
    >
      <BasketMark size={size} variant={v} color={color} />
      {withWordmark ? (
        <View>
          <Text
            allowFontScaling={false}
            style={{
              fontFamily: t.typography.hero.fontFamily,
              fontSize,
              lineHeight: Math.round(fontSize * 1.05),
              letterSpacing: -fontSize * 0.03,
              color: wordColor,
            }}
          >
            Cabas
          </Text>
          {withTagline ? (
            <Text
              allowFontScaling={false}
              style={{
                fontFamily: t.typography.subhead.fontFamily,
                fontSize: Math.max(11, Math.round(size * 0.24)),
                color: v === 'reversed' ? palette.moutarde300 : v === 'mono' ? wordColor : t.colors.textSecondary,
                marginTop: 1,
              }}
            >
              {TAGLINE}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});

/**
 * Texte typographié de la DA « Marché frais ».
 * `variant` = clé de `typography` ; `color` = clé de couleur du thème
 * (ou 'inherit' pour hériter d'un texte parent).
 */
import React from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme, type ColorScheme, type TypographyVariant } from '@/theme';

export type ThemeColorKey = keyof ColorScheme;

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: ThemeColorKey | 'inherit';
  align?: TextStyle['textAlign'];
  /** Chiffres tabulaires (prix, quantités alignés en colonne). */
  tabular?: boolean;
  /** Barré (ancien prix). */
  strike?: boolean;
}

export function Text({
  variant = 'body',
  color = 'text',
  align,
  tabular,
  strike,
  style,
  maxFontSizeMultiplier = 1.6,
  ...rest
}: TextProps) {
  const t = useTheme();
  const base = t.typography[variant] as TextStyle;
  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        base,
        color !== 'inherit' && { color: t.colors[color] },
        align && { textAlign: align },
        tabular && { fontVariant: ['tabular-nums'] },
        strike && { textDecorationLine: 'line-through' },
        style,
      ]}
      {...rest}
    />
  );
}

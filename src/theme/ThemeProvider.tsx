import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import {
  controlHeight,
  darkColors,
  elevation,
  iconSize,
  layout,
  lightColors,
  motion,
  opacity,
  radius,
  spacing,
  typography,
  zIndex,
  type ColorScheme,
} from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface Theme {
  scheme: 'light' | 'dark';
  colors: ColorScheme;
  typography: typeof typography;
  spacing: typeof spacing;
  radius: typeof radius;
  elevation: typeof elevation;
  motion: typeof motion;
  layout: typeof layout;
  iconSize: typeof iconSize;
  controlHeight: typeof controlHeight;
  opacity: typeof opacity;
  zIndex: typeof zIndex;
}

export function buildTheme(scheme: 'light' | 'dark'): Theme {
  return {
    scheme,
    colors: scheme === 'dark' ? darkColors : lightColors,
    typography,
    spacing,
    radius,
    elevation,
    motion,
    layout,
    iconSize,
    controlHeight,
    opacity,
    zIndex,
  };
}

const ThemeContext = createContext<Theme>(buildTheme('light'));

export function ThemeProvider({
  preference = 'system',
  children,
}: {
  preference?: ThemePreference;
  children: React.ReactNode;
}) {
  const system = useColorScheme();
  const scheme: 'light' | 'dark' =
    preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  const theme = useMemo(() => buildTheme(scheme), [scheme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** Accès au thème courant (couleurs selon clair/sombre + tokens). */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}

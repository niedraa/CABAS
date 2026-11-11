/**
 * Monogramme d'enseigne : cercle aux couleurs de la chaîne + initiale(s).
 * Jamais de logo officiel (droit des marques) — voir docs/brand.
 * Le kit ne dépend pas de `core` : noms et initiales sont repris ici, et un
 * test vérifie qu'ils couvrent `STORE_CHAINS` avec les noms de `STORE_CHAIN_LABELS`.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { relativeLuminance, storeColors, useTheme } from '@/theme';

import { Text } from './Text';

export type StoreBadgeSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/**
 * Monogrammes par enseigne (1 à 2 lettres, UNIQUES) et nom officiel (lu par
 * les lecteurs d'écran). Une entrée par enseigne de `STORE_CHAINS` — noms
 * identiques à `STORE_CHAIN_LABELS` (vérifié par les tests).
 */
export const STORE_MONOGRAMS: Record<string, { initials: string; name: string }> = {
  leclerc: { initials: 'L', name: 'E.Leclerc' },
  carrefour: { initials: 'C', name: 'Carrefour' },
  auchan: { initials: 'A', name: 'Auchan' },
  intermarche: { initials: 'I', name: 'Intermarché' },
  superu: { initials: 'U', name: 'Super U' },
  lidl: { initials: 'Li', name: 'Lidl' },
  aldi: { initials: 'Al', name: 'Aldi' },
  netto: { initials: 'N', name: 'Netto' },
  monoprix: { initials: 'M', name: 'Monoprix' },
  franprix: { initials: 'F', name: 'Franprix' },
};

/** Nom lisible d'une enseigne (monogramme connu, sinon le nom fourni, sinon l'identifiant). */
export function storeBadgeName(chain: string, name?: string): string {
  return STORE_MONOGRAMS[chain.toLowerCase()]?.name ?? name ?? chain;
}

/** « E.Leclerc », « E.Leclerc et Lidl », « E.Leclerc, Lidl et Aldi ». */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

/** Libellé d'accessibilité d'une pile de monogrammes : « Enseignes : E.Leclerc, Lidl et Aldi ». */
export function storeStackLabel(chains: readonly string[]): string {
  const names = chains.map((c) => storeBadgeName(c));
  if (names.length === 0) return 'Aucune enseigne';
  return `${names.length > 1 ? 'Enseignes' : 'Enseigne'} : ${joinNames(names)}`;
}

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
  const label = storeBadgeName(key, name ?? chain);
  const initials = mono?.initials ?? (name ?? chain).slice(0, 1).toUpperCase();
  const dim = DIM[size];
  const fontSize = Math.round(dim * (initials.length > 1 ? 0.4 : 0.48));
  // Filet : fond clair (`border`) sur le papier, ou fond très sombre en mode nuit.
  const border = colors.border ?? (t.scheme === 'dark' && relativeLuminance(colors.bg) < 0.03 ? t.colors.borderStrong : undefined);

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
          // Liseré d'empilement, sinon filet des fonds clairs (visibles sur le papier).
          borderWidth: ring ? Math.max(2, dim / 16) : border ? StyleSheet.hairlineWidth * 2 : 0,
          borderColor: ring ? t.colors.surface : (border ?? t.colors.surface),
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

/**
 * Pile de monogrammes qui se chevauchent. Lue comme UNE image : « Enseignes :
 * E.Leclerc, Lidl et Aldi » (toutes, même au-delà de `max`), ou
 * `accessibilityLabel` si le contexte en dit plus (« 4 enseignes comparées »).
 */
export function StoreBadgeStack({
  chains,
  size = 'sm',
  max = 4,
  style,
  accessibilityLabel,
}: {
  chains: string[];
  size?: StoreBadgeSize;
  max?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const dim = DIM[size];
  const shown = chains.slice(0, max);
  const extra = chains.length - shown.length;
  return (
    <View
      style={[styles.stack, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? storeStackLabel(chains)}
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

/**
 * Cabas — Direction artistique « Marché frais »
 *
 * Tokens de design partagés par toute l'application. Toute couleur, taille,
 * rayon ou durée d'animation utilisée dans un écran DOIT venir d'ici.
 * Voir docs/brand/README.md pour l'intention derrière chaque choix.
 */

/** Palette brute — ne pas utiliser directement dans les composants, passer par `ColorScheme`. */
export const palette = {
  // Verts « Forêt » (identité, issus du dossier PENRA)
  foret900: '#0E241B',
  foret800: '#173A2C',
  foret700: '#1F4A38',
  foret600: '#2F6E50',
  foret500: '#3F8A66',
  foret300: '#8DBEA3',
  foret100: '#DCEBDF',
  foret50: '#EEF5EF',

  // Moutarde (accent chaleureux, actions primaires, premium)
  moutarde700: '#B97A1E',
  moutarde600: '#D38E2B',
  moutarde500: '#E8A33D',
  moutarde300: '#F3C982',
  moutarde100: '#FBEBCB',
  moutarde50: '#FDF6E7',
  /** Moutarde « texte » : lisible sur crème (AA ≥ 4,5:1), pour badges premium. */
  moutarde800: '#8C5B14',

  // Crème / papier (fonds)
  creme: '#F6F1E7',
  creme200: '#EDE5D5',
  creme300: '#E1D6C1',
  papier: '#FFFCF6',

  // Tomate (promos, alertes, suppression)
  tomate600: '#C9452B',
  tomate500: '#E0573A',
  tomate100: '#FBE1D8',
  /** Tomate profonde : texte « danger / économie » sur fond clair (AA ≥ 4,5:1). */
  tomate700: '#B23A22',

  // Prune (badges informatifs, IA)
  prune600: '#6B4B8A',
  prune100: '#EEE6F5',

  // Encre (textes)
  encre900: '#14231C',
  encre700: '#33433B',
  encre500: '#5B6B62',
  encre400: '#76847C',
  encre300: '#93A099',
  blanc: '#FFFFFF',
  noir: '#000000',

  // Nuit (mode sombre)
  nuit900: '#0B1712',
  nuit800: '#0F1E17',
  nuit700: '#16291F',
  nuit600: '#1D3428',
  nuit500: '#28463A',
  nuit400: '#7F988A',
  nuit300: '#5E7A6C',
  lin: '#F3EEE3',
} as const;

export type ColorScheme = {
  /** Fond général de l'app */
  background: string;
  /** Fond légèrement contrasté (sections, tab bar) */
  backgroundAlt: string;
  /** Cartes, feuilles, champs */
  surface: string;
  /** Surface surélevée (modales, popovers) */
  surfaceElevated: string;
  /** Surface pressée / sélectionnée */
  surfacePressed: string;
  border: string;
  borderStrong: string;

  text: string;
  textSecondary: string;
  textTertiary: string;
  /** Texte posé sur `primary` */
  onPrimary: string;
  /** Texte posé sur `accent` */
  onAccent: string;
  /** Texte posé sur `danger` (bouton destructif plein) */
  onDanger: string;

  /** Vert forêt : identité, en-têtes, boutons secondaires pleins */
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  /** Moutarde : CTA principal, mise en avant, premium */
  accent: string;
  accentPressed: string;
  accentSoft: string;
  /** Moutarde utilisable comme couleur de TEXTE (badges premium, liens chauds) */
  accentText: string;

  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;

  /** Prix le plus bas dans le comparateur */
  priceBest: string;
  /** Économie / promo */
  savings: string;

  overlay: string;
  shadow: string;
  /** Héros (bandeaux colorés plein écran) */
  hero: string;
  heroText: string;
  heroCircle: string;
};

export const lightColors: ColorScheme = {
  background: palette.creme,
  backgroundAlt: palette.creme200,
  surface: palette.papier,
  surfaceElevated: palette.blanc,
  surfacePressed: palette.creme200,
  border: palette.creme300,
  borderStrong: '#CBBFA8',

  text: palette.encre900,
  textSecondary: palette.encre500,
  // Tertiaire : indications non essentielles (placeholder, méta, icônes) — ≥ 3:1.
  textTertiary: palette.encre400,
  onPrimary: palette.lin,
  onAccent: palette.foret900,
  onDanger: palette.blanc,

  primary: palette.foret800,
  primaryPressed: palette.foret900,
  primarySoft: palette.foret100,
  accent: palette.moutarde500,
  accentPressed: palette.moutarde600,
  accentSoft: palette.moutarde100,
  accentText: palette.moutarde800,

  success: palette.foret600,
  successSoft: palette.foret100,
  // Tomate profonde pour garantir l'AA du texte sur crème (tomate500 = 3,3:1).
  danger: palette.tomate700,
  dangerSoft: palette.tomate100,
  info: palette.prune600,
  infoSoft: palette.prune100,

  priceBest: palette.foret600,
  savings: palette.tomate700,

  overlay: 'rgba(14, 36, 27, 0.45)',
  shadow: 'rgba(23, 58, 44, 0.16)',
  hero: palette.foret800,
  heroText: palette.lin,
  heroCircle: palette.foret600,
};

export const darkColors: ColorScheme = {
  background: palette.nuit800,
  backgroundAlt: palette.nuit900,
  surface: palette.nuit700,
  surfaceElevated: palette.nuit600,
  surfacePressed: palette.nuit500,
  border: '#24392E',
  borderStrong: '#36503F',

  text: palette.lin,
  textSecondary: '#B4C2B9',
  textTertiary: palette.nuit400,
  onPrimary: palette.foret900,
  onAccent: palette.foret900,
  onDanger: '#2A0F09',

  primary: palette.foret300,
  primaryPressed: '#A6CFB8',
  primarySoft: '#1E3A2D',
  accent: '#F0B14F',
  accentPressed: palette.moutarde300,
  accentSoft: '#3A2F1A',
  accentText: '#F0B14F',

  success: '#6FBF93',
  successSoft: '#1E3A2D',
  danger: '#F07A5E',
  dangerSoft: '#3D221B',
  info: '#B79BD6',
  infoSoft: '#2B2236',

  priceBest: '#6FBF93',
  savings: '#F07A5E',

  overlay: 'rgba(0, 0, 0, 0.6)',
  shadow: 'rgba(0, 0, 0, 0.5)',
  // Héros : forêt (plus clair que le fond nuit) pour rester lisible comme surface.
  hero: palette.foret800,
  heroText: palette.lin,
  heroCircle: palette.foret700,
};

/** Familles chargées via @expo-google-fonts (voir src/theme/fonts.ts). */
export const fontFamily = {
  display: 'BricolageGrotesque_800ExtraBold',
  displayBold: 'BricolageGrotesque_700Bold',
  displaySemi: 'BricolageGrotesque_600SemiBold',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodySemi: 'DMSans_600SemiBold',
  bodyBold: 'DMSans_700Bold',
} as const;

/**
 * Échelle typographique. `variant` → style. Les prix utilisent `tabular-nums`.
 */
export const typography = {
  hero: { fontFamily: fontFamily.display, fontSize: 40, lineHeight: 44, letterSpacing: -1.2 },
  title1: { fontFamily: fontFamily.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.8 },
  title2: { fontFamily: fontFamily.displayBold, fontSize: 24, lineHeight: 29, letterSpacing: -0.5 },
  title3: { fontFamily: fontFamily.displayBold, fontSize: 19, lineHeight: 24, letterSpacing: -0.3 },
  headline: { fontFamily: fontFamily.bodyBold, fontSize: 16, lineHeight: 22, letterSpacing: -0.1 },
  body: { fontFamily: fontFamily.body, fontSize: 16, lineHeight: 23, letterSpacing: 0 },
  bodyMedium: { fontFamily: fontFamily.bodyMedium, fontSize: 16, lineHeight: 23, letterSpacing: 0 },
  callout: { fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21, letterSpacing: 0 },
  subhead: { fontFamily: fontFamily.bodyMedium, fontSize: 14, lineHeight: 19, letterSpacing: 0 },
  footnote: { fontFamily: fontFamily.body, fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  caption: { fontFamily: fontFamily.bodySemi, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
  overline: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
  price: {
    fontFamily: fontFamily.displayBold,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  priceLarge: {
    fontFamily: fontFamily.display,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
} as const;

export type TypographyVariant = keyof typeof typography;

/** Grille de 4 pt. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
  /** Marge latérale standard des écrans */
  screen: 20,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const elevation = {
  none: { shadowOpacity: 0, elevation: 0 },
  sm: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 6,
  },
  lg: {
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 1,
    shadowRadius: 32,
    elevation: 12,
  },
} as const;

/** Mouvement : tout est ressort, rien n'est linéaire. */
export const motion = {
  spring: { damping: 18, stiffness: 220, mass: 1 },
  springSnappy: { damping: 22, stiffness: 380, mass: 0.8 },
  springBouncy: { damping: 12, stiffness: 180, mass: 1 },
  /** Feuille modale : ample mais sans rebond gênant. */
  springSheet: { damping: 26, stiffness: 260, mass: 1 },
  /** Indicateurs (pastille d'onglet, segment) : vif, léger dépassement. */
  springIndicator: { damping: 20, stiffness: 300, mass: 0.9 },
  /** Apparition d'un toast. */
  springToast: { damping: 17, stiffness: 240, mass: 0.9 },
  duration: { instant: 90, fast: 160, base: 240, slow: 420, celebrate: 900 },
  /** Décalage entre éléments d'une liste qui apparaît */
  stagger: 45,
  pressScale: 0.97,
} as const;

/** Couleurs « monogramme » des enseignes (pas de logos officiels). */
export const storeColors: Record<string, { bg: string; fg: string }> = {
  leclerc: { bg: '#1D5FA8', fg: '#FFFFFF' },
  carrefour: { bg: '#2D6FB7', fg: '#FFFFFF' },
  auchan: { bg: '#D6342C', fg: '#FFFFFF' },
  intermarche: { bg: '#C8102E', fg: '#FFFFFF' },
  lidl: { bg: '#F5C400', fg: '#0050AA' },
  monoprix: { bg: '#1A1A1A', fg: '#FFFFFF' },
  default: { bg: palette.foret600, fg: palette.lin },
};

/** Couleurs des rayons (catégories de la liste de courses). */
export const aisleColors: Record<string, string> = {
  fruits_legumes: '#5FA86F',
  boucherie: '#C9584A',
  poissonnerie: '#4C8DB5',
  cremerie: '#E9C46A',
  boulangerie: '#C88B4A',
  epicerie_salee: '#B5734A',
  epicerie_sucree: '#D98BA6',
  surgeles: '#7FB7D9',
  boissons: '#6B9AC4',
  condiments: '#A78B3E',
  hygiene_maison: '#8E8AB8',
  autre: '#93A099',
};

export const layout = {
  maxContentWidth: 560,
  tabBarHeight: 64,
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },
  minTouchTarget: 44,
} as const;

// ─── Ajouts « Marché frais » (kit UI) ────────────────────────────────────────

/** Tailles d'icônes (lucide-react-native, trait 2). */
export const iconSize = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 28,
  xxl: 36,
} as const;

/** Hauteurs des contrôles (boutons, champs) — toujours ≥ 44 pt pour md/lg. */
export const controlHeight = {
  sm: 36,
  md: 48,
  lg: 56,
} as const;

/** Opacités sémantiques. */
export const opacity = {
  disabled: 0.45,
  pressed: 0.85,
  decor: 0.18,
} as const;

/** Plans d'empilement. */
export const zIndex = {
  base: 0,
  raised: 10,
  sticky: 50,
  fab: 80,
  sheet: 100,
  toast: 200,
} as const;

/**
 * Pastels des vignettes recette / illustrations (emoji sur fond pastel).
 * Chaque entrée : fond clair + fond sombre (mode nuit), choisis pour rester
 * doux sous un emoji coloré.
 */
export const pastels = [
  { key: 'pistache', light: '#DDEFD9', dark: '#23402F' },
  { key: 'abricot', light: '#FCE3C8', dark: '#43301C' },
  { key: 'tomate', light: '#FADBD2', dark: '#45251E' },
  { key: 'lavande', light: '#E8E1F4', dark: '#2E2840' },
  { key: 'citron', light: '#FBF0C2', dark: '#3E3819' },
  { key: 'menthe', light: '#D6EFEA', dark: '#1D3D38' },
  { key: 'framboise', light: '#F7DCE6', dark: '#40232F' },
  { key: 'ciel', light: '#DCE9F6', dark: '#1F3042' },
] as const;
export type PastelKey = (typeof pastels)[number]['key'];

/**
 * Ombres en `boxShadow` (supporté par RN ≥ 0.76 sur iOS/Android et par
 * react-native-web), plus prévisible que les `shadow*` hérités. La couleur
 * vient de `colors.shadow` (différente en clair / sombre).
 */
export function boxShadow(level: 'none' | 'sm' | 'md' | 'lg', shadowColor: string): string {
  switch (level) {
    case 'sm':
      return `0px 2px 6px 0px ${shadowColor}`;
    case 'md':
      return `0px 8px 20px -4px ${shadowColor}`;
    case 'lg':
      return `0px 18px 36px -8px ${shadowColor}`;
    default:
      return 'none';
  }
}


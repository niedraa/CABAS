/**
 * Illustrations « Marché frais » : formes plates, palette de la marque,
 * pastille de fond douce, aucun contour noir. Toutes en viewBox 160×160,
 * redimensionnables via `size`. Décoratives par défaut (masquées aux
 * lecteurs d'écran) sauf si `accessibilityLabel` est fourni.
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { palette, useTheme } from '@/theme';

import { basketGeometry as g } from './basket';

export interface IllustrationProps {
  size?: number;
  /** Pastille de fond (défaut true). */
  backdrop?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Couleurs « produits » fixes (indépendantes du mode sombre). */
export const produceColors = {
  leaf: '#5FA86F',
  leafDark: '#3F8A66',
  carrot: '#EE8A3C',
  tomato: '#E0573A',
  tomatoLight: '#F07A5E',
  lemon: '#F5CF4B',
  bread: '#D9A35B',
  breadDark: '#B97A3A',
  steam: '#CBBFA8',
  paper: palette.papier,
  line: palette.creme300,
} as const;

function Frame({
  size = 160,
  backdrop = true,
  backdropColor,
  accessibilityLabel,
  style,
  children,
}: IllustrationProps & { backdropColor: string; children: React.ReactNode }) {
  return (
    <View
      style={[{ width: size, height: size }, style]}
      accessible={!!accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
      accessibilityElementsHidden={!accessibilityLabel}
    >
      <Svg width={size} height={size} viewBox="0 0 160 160">
        {backdrop ? (
          <Circle cx={80} cy={84} r={68} fill={backdropColor} />
        ) : null}
        {children}
      </Svg>
    </View>
  );
}

/** Panier vide : le panier Cabas penché, une feuille qui s'envole. */
export function EmptyBasket(props: IllustrationProps) {
  const t = useTheme();
  return (
    <Frame {...props} backdropColor={t.colors.accentSoft}>
      <Ellipse cx={80} cy={134} rx={44} ry={6} fill={t.colors.shadow} />
      <G transform="translate(22 22) rotate(-6 60 80)">
        <Path d={g.handle} stroke={t.colors.primary} strokeWidth={g.handleStroke} strokeLinecap="round" fill="none" />
        <Path d={g.body} fill={palette.moutarde500} />
        {g.slots.map((s, i) => (
          <Rect key={i} {...s} fill={palette.foret800} />
        ))}
      </G>
      <Leaf x={112} y={44} rotate={30} scale={0.9} />
      <Circle cx={36} cy={60} r={4} fill={palette.moutarde500} />
      <Circle cx={128} cy={96} r={3} fill={produceColors.tomato} />
    </Frame>
  );
}

/** Liste vide : ticket dentelé, cases à cocher et crayon. */
export function EmptyList(props: IllustrationProps) {
  const t = useTheme();
  const paper = t.scheme === 'dark' ? t.colors.surfaceElevated : produceColors.paper;
  const line = t.scheme === 'dark' ? t.colors.borderStrong : produceColors.line;
  // Ticket : bord inférieur dentelé.
  let zig = 'M44 30 H116 V118';
  for (let i = 0; i < 6; i++) zig += ` L${116 - i * 12 - 6} 126 L${116 - (i + 1) * 12} 118`;
  zig += ' Z';
  return (
    <Frame {...props} backdropColor={t.colors.primarySoft}>
      <Ellipse cx={80} cy={140} rx={40} ry={5} fill={t.colors.shadow} />
      <Path d={zig} fill={paper} />
      {[48, 70, 92].map((y, i) => (
        <G key={y}>
          <Rect x={54} y={y} width={12} height={12} rx={3.5} fill="none" stroke={i === 0 ? t.colors.success : line} strokeWidth={2.5} />
          {i === 0 ? <Path d={`M56.5 ${y + 6.5} L59.5 ${y + 9.2} L64 ${y + 3.6}`} stroke={t.colors.success} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
          <Rect x={72} y={y + 3} width={i === 1 ? 26 : 34} height={6} rx={3} fill={line} />
        </G>
      ))}
      {/* Crayon */}
      <G transform="rotate(38 118 92)">
        <Rect x={112} y={58} width={12} height={52} rx={2} fill={palette.moutarde500} />
        <Rect x={112} y={52} width={12} height={9} rx={3} fill={produceColors.tomatoLight} />
        <Path d="M112 110 L118 122 L124 110 Z" fill={palette.moutarde100} />
        <Path d="M116.3 118.6 L118 122 L119.7 118.6 Z" fill={palette.foret800} />
      </G>
    </Frame>
  );
}

/** Marmite fumante (génération du planning, mode cuisine). */
export function CookingPot(props: IllustrationProps) {
  const t = useTheme();
  return (
    <Frame {...props} backdropColor={t.colors.accentSoft}>
      <Ellipse cx={80} cy={136} rx={46} ry={6} fill={t.colors.shadow} />
      {/* Vapeur */}
      {[64, 80, 96].map((x, i) => (
        <Path
          key={x}
          d={`M${x} ${58 - (i % 2) * 6} q-7 -9 0 -18 q7 -9 0 -18`}
          stroke={produceColors.steam}
          strokeWidth={5}
          strokeLinecap="round"
          fill="none"
          opacity={0.9}
        />
      ))}
      {/* Anses */}
      <Rect x={30} y={82} width={16} height={10} rx={5} fill={palette.foret800} />
      <Rect x={114} y={82} width={16} height={10} rx={5} fill={palette.foret800} />
      {/* Corps */}
      <Path d="M40 76 H120 V112 Q120 128 104 128 H56 Q40 128 40 112 Z" fill={palette.foret600} />
      <Rect x={40} y={92} width={80} height={6} fill={palette.foret500} />
      {/* Couvercle */}
      <Path d="M34 76 Q34 64 46 64 H114 Q126 64 126 76 Z" fill={palette.foret800} />
      <Rect x={72} y={54} width={16} height={10} rx={5} fill={palette.moutarde500} />
      {/* Reflet */}
      <Rect x={50} y={102} width={6} height={16} rx={3} fill={palette.foret300} opacity={0.6} />
    </Frame>
  );
}

// ─── Produits (petites pièces réutilisables, posées dans un <Svg> 160) ──────

interface PieceProps {
  x: number;
  y: number;
  rotate?: number;
  scale?: number;
}

function Piece({ x, y, rotate = 0, scale = 1, children }: PieceProps & { children: React.ReactNode }) {
  return <G transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>{children}</G>;
}

export function Leaf(p: PieceProps) {
  return (
    <Piece {...p}>
      <Path d="M0 -22 C16 -14 16 10 0 22 C-16 10 -16 -14 0 -22 Z" fill={produceColors.leaf} />
      <Path d="M0 -14 V20" stroke={produceColors.leafDark} strokeWidth={2.4} strokeLinecap="round" />
    </Piece>
  );
}

function CarrotPiece(p: PieceProps) {
  return (
    <Piece {...p}>
      <Path d="M-4 -30 Q-12 -44 -6 -48 Q0 -40 0 -32 Q2 -46 10 -46 Q10 -36 2 -30 Z" fill={produceColors.leaf} />
      <Path d="M-12 -28 Q0 -34 12 -28 L2 30 Q0 34 -2 30 Z" fill={produceColors.carrot} />
      <Path d="M-6 -12 H0 M-4 4 H2" stroke="#C96A22" strokeWidth={2.4} strokeLinecap="round" />
    </Piece>
  );
}

function TomatoPiece(p: PieceProps) {
  return (
    <Piece {...p}>
      <Circle cx={0} cy={4} r={24} fill={produceColors.tomato} />
      <Circle cx={-8} cy={-4} r={6} fill={produceColors.tomatoLight} opacity={0.8} />
      <Path d="M0 -20 L5 -12 L14 -14 L8 -6 M0 -20 L-5 -12 L-14 -14 L-8 -6 M0 -20 V-28" stroke={produceColors.leaf} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Piece>
  );
}

function BaguettePiece(p: PieceProps) {
  return (
    <Piece {...p}>
      <Rect x={-44} y={-10} width={88} height={20} rx={10} fill={produceColors.bread} />
      {[-26, -6, 14, 32].map((x) => (
        <Path key={x} d={`M${x - 5} 4 L${x + 5} -4`} stroke={produceColors.breadDark} strokeWidth={3} strokeLinecap="round" />
      ))}
    </Piece>
  );
}

function LemonPiece(p: PieceProps) {
  return (
    <Piece {...p}>
      <Ellipse cx={0} cy={0} rx={22} ry={17} fill={produceColors.lemon} />
      <Circle cx={22} cy={0} r={4} fill={produceColors.lemon} />
      <Circle cx={-22} cy={0} r={3} fill={produceColors.lemon} />
      <Ellipse cx={-6} cy={-6} rx={6} ry={3.5} fill="#FBE58F" />
    </Piece>
  );
}

export type ProduceKind = 'leaf' | 'carrot' | 'tomato' | 'baguette' | 'lemon';

/** Un produit seul, centré sur sa pastille. */
export function Produce({ kind, ...props }: IllustrationProps & { kind: ProduceKind }) {
  const t = useTheme();
  const backdrop: Record<ProduceKind, string> = {
    leaf: t.colors.primarySoft,
    carrot: t.colors.accentSoft,
    tomato: t.colors.dangerSoft,
    baguette: t.colors.accentSoft,
    lemon: t.colors.accentSoft,
  };
  const piece: Record<ProduceKind, React.ReactNode> = {
    leaf: <Leaf x={80} y={84} scale={2} rotate={-20} />,
    carrot: <CarrotPiece x={80} y={88} scale={1.4} rotate={20} />,
    tomato: <TomatoPiece x={80} y={84} scale={1.6} />,
    baguette: <BaguettePiece x={80} y={84} scale={1.2} rotate={-30} />,
    lemon: <LemonPiece x={80} y={84} scale={1.7} rotate={-15} />,
  };
  return (
    <Frame {...props} backdropColor={backdrop[kind]}>
      {piece[kind]}
    </Frame>
  );
}

/** Composition « étal du marché » : plusieurs produits groupés (onboarding). */
export function ProduceSet(props: IllustrationProps) {
  const t = useTheme();
  return (
    <Frame {...props} backdropColor={t.colors.primarySoft}>
      <Ellipse cx={80} cy={134} rx={52} ry={6} fill={t.colors.shadow} />
      <BaguettePiece x={82} y={58} rotate={-24} scale={0.95} />
      <CarrotPiece x={44} y={96} rotate={-28} scale={0.95} />
      <LemonPiece x={118} y={108} rotate={-10} scale={0.9} />
      <TomatoPiece x={82} y={106} scale={1.05} />
      <Leaf x={126} y={62} rotate={35} scale={0.8} />
    </Frame>
  );
}

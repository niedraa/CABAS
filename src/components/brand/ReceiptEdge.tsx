/**
 * Bord dentelé « ticket de caisse » (motif des prix et du panier).
 * Se cale sur la largeur mesurée : les dents restent régulières quelle que
 * soit la taille de l'écran.
 */
import React, { useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/theme';

export interface ReceiptEdgeProps {
  /** `bottom` : dents pointant vers le bas (sous la carte). */
  position?: 'top' | 'bottom';
  /** Couleur du papier (défaut `surface`). */
  color?: string;
  toothWidth?: number;
  toothHeight?: number;
  style?: StyleProp<ViewStyle>;
}

/** Construit le tracé dentelé pour une largeur donnée (exporté pour les tests). */
export function receiptEdgePath(width: number, toothWidth: number, toothHeight: number, position: 'top' | 'bottom') {
  const n = Math.max(1, Math.round(width / toothWidth));
  const w = width / n;
  const h = toothHeight;
  let d = position === 'bottom' ? `M0 0` : `M0 ${h}`;
  for (let i = 0; i < n; i++) {
    const mid = (i + 0.5) * w;
    const end = (i + 1) * w;
    d += position === 'bottom' ? ` L${mid.toFixed(2)} ${h} L${end.toFixed(2)} 0` : ` L${mid.toFixed(2)} 0 L${end.toFixed(2)} ${h}`;
  }
  d += ' Z';
  return d;
}

export function ReceiptEdge({ position = 'bottom', color, toothWidth = 14, toothHeight = 7, style }: ReceiptEdgeProps) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const fill = color ?? t.colors.surface;
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[{ height: toothHeight, width: '100%' }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {width > 0 ? (
        <Svg width={width} height={toothHeight}>
          <Path
            d={receiptEdgePath(width, toothWidth, toothHeight, position)}
            fill={fill}
            stroke={fill}
            strokeWidth={0.8}
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
    </View>
  );
}

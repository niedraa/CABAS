/**
 * Icônes du kit : on accepte soit un composant lucide (`ShoppingBasket`),
 * soit un élément déjà construit (`<ShoppingBasket color="red" />`).
 * Convention de la DA : trait 2, coins arrondis (lucide par défaut).
 */
import React from 'react';

export interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export type IconComponent = React.ComponentType<IconProps>;
export type IconLike = IconComponent | React.ReactElement;

/** Rend une icône avec les valeurs par défaut de la DA (trait 2). */
export function renderIcon(
  icon: IconLike | undefined | null,
  { size, color, strokeWidth = 2 }: IconProps,
): React.ReactNode {
  if (!icon) return null;
  if (React.isValidElement(icon)) return icon;
  const Icon = icon as IconComponent;
  return <Icon size={size} color={color} strokeWidth={strokeWidth} />;
}

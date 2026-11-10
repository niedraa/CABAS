/**
 * Éléments de marque de Cabas (« Marché frais ») : logo, motifs, illustrations.
 * Voir docs/brand/README.md.
 */
export { CabasLogo, BasketMark, TAGLINE, type CabasLogoProps, type LogoVariant } from './CabasLogo';
export { CircleDecor, type CircleDecorProps, type CircleDecorTone, type CircleDecorPlacement } from './CircleDecor';
export { ReceiptEdge, receiptEdgePath, type ReceiptEdgeProps } from './ReceiptEdge';
export { ReceiptCard, type ReceiptCardProps } from './ReceiptCard';
export {
  EmptyBasket,
  EmptyList,
  CookingPot,
  Produce,
  ProduceSet,
  Leaf,
  produceColors,
  type IllustrationProps,
  type ProduceKind,
} from './Illustrations';
export { Celebration, type CelebrationProps } from './Celebration';
export { BASKET_VIEWBOX, basketGeometry, basketBodyWithHoles } from './basket';

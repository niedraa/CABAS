/**
 * Composants métier de l'onglet « Prix » : comparateur, panier optimisé,
 * détail des prix d'un article.
 */
export { BasketReceipt, type BasketReceiptProps } from './BasketReceipt';
export { ReceiptLine, type ReceiptLineProps } from './ReceiptLine';
export { BasketControls, type BasketControlsProps } from './BasketControls';
export { StorePartCard, type StorePartCardProps } from './StorePartCard';
export { ComparisonRow, type ComparisonRowProps } from './ComparisonRow';
export { MissingItems, missingReason, type MissingItemsProps } from './MissingItems';
export { BasketSkeleton, ComparisonRowSkeleton } from './BasketSkeleton';
export { OfferRow, ProductChoiceRow, type ProductChoiceRowProps } from './OfferRow';
export * from './basketView';
export * from './comparatorView';
export * from './provenanceView';

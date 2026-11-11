/**
 * Logique de présentation PURE du détail d'un article (feuille
 * « comparateur ») : offres par enseigne, enseignes sans l'article, produits
 * au choix dans le magasin du panier. Aucun import React.
 */
import type { Allergen, BasketLine, ItemComparison, Product, ShoppingListItem, Store, StoreOffer } from '@/core';
import { formatPieces, formatQuantity, productContainsAllergen } from '@/core';

/** Quantité nécessaire : « 500 g », « 1,5 l », « 3 pièces ». */
export function needLabel(item: Pick<ShoppingListItem, 'quantity' | 'unit'>): string {
  if (item.unit === 'piece') return `${formatPieces(item.quantity)} pièce${item.quantity >= 2 ? 's' : ''}`;
  return formatQuantity(item.quantity, item.unit);
}

export interface StoreOfferRow {
  offer: StoreOffer;
  store: Store | undefined;
  product: Product | undefined;
  isBest: boolean;
  /** Offre retenue dans le panier (même magasin, même produit). */
  inBasket: boolean;
  /** Surcoût par rapport à la meilleure offre (0 pour la meilleure). */
  extraCents: number;
}

export function storeOfferRows(
  comparison: ItemComparison,
  storesById: Record<string, Store>,
  productsById: Record<string, Product>,
  line: (Pick<BasketLine, 'productId'> & { storeId: string }) | null,
): StoreOfferRow[] {
  const best = comparison.best ?? comparison.offers[0];
  return comparison.offers.map((offer) => ({
    offer,
    store: storesById[offer.storeId],
    product: productsById[offer.productId],
    isBest: !!best && offer.storeId === best.storeId && offer.productId === best.productId,
    inBasket: !!line && line.storeId === offer.storeId && line.productId === offer.productId,
    extraCents: best ? Math.max(0, offer.totalCents - best.totalCents) : 0,
  }));
}

/** Enseignes du catalogue sans prix connu pour l'article (ni relevé, ni estimation). */
export function storesWithoutItem(comparison: ItemComparison, stores: readonly Store[]): Store[] {
  const has = new Set(comparison.offers.map((o) => o.storeId));
  return stores.filter((s) => !has.has(s.id));
}

/** Écart entre l'offre la plus chère et la moins chère (0 si < 2 offres). */
export function priceSpread(comparison: ItemComparison): number {
  if (comparison.offers.length < 2) return 0;
  const totals = comparison.offers.map((o) => o.totalCents);
  return Math.max(...totals) - Math.min(...totals);
}

export interface ProductChoice {
  productId: string;
  offer: StoreOffer;
  product: Product | undefined;
  /** Produit retenu automatiquement (le moins cher du magasin). */
  isAuto: boolean;
  selected: boolean;
}

/**
 * Produits au choix dans un magasin (toutes offres de l'article), du moins
 * cher au plus cher. `currentProductId` : produit du panier. Un produit qui
 * contient un allergène déclaré du profil (`allergens`) n'est JAMAIS proposé,
 * ni un produit inconnu du catalogue quand le profil déclare des allergènes
 * (on ne peut pas vérifier sa composition) — même si les offres reçues en
 * contiennent (défense en profondeur : l'index est déjà filtré en amont).
 */
export function productChoices(
  allOffers: readonly StoreOffer[],
  storeId: string,
  productsById: Record<string, Product>,
  currentProductId: string | null,
  allergens: readonly Allergen[] = [],
): ProductChoice[] {
  const safe = (productId: string) => {
    if (allergens.length === 0) return true;
    const p = productsById[productId];
    return !!p && !productContainsAllergen(p, allergens);
  };
  const inStore = allOffers
    .filter((o) => o.storeId === storeId && safe(o.productId))
    .slice()
    .sort((a, b) => a.totalCents - b.totalCents || a.pricePerBaseUnitCents - b.pricePerBaseUnitCents || (a.productId < b.productId ? -1 : 1));
  const seen = new Set<string>();
  const out: ProductChoice[] = [];
  inStore.forEach((offer, i) => {
    if (seen.has(offer.productId)) return;
    seen.add(offer.productId);
    out.push({
      productId: offer.productId,
      offer,
      product: productsById[offer.productId],
      isAuto: i === 0,
      selected: offer.productId === currentProductId,
    });
  });
  return out;
}

/** Choix → valeur pour `selectAlternative` : le produit automatique annule le choix. */
export function selectionFor(choice: Pick<ProductChoice, 'productId' | 'isAuto'>): string | null {
  return choice.isAuto ? null : choice.productId;
}

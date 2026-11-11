/**
 * Comparateur de prix : pour chaque article de la liste, meilleure offre par
 * enseigne (nombre de conditionnements nécessaires × prix effectif, promo
 * comprise), prix au kilo / litre / pièce et alternative MDD moins chère.
 */
import type {
  Allergen,
  BaseUnit,
  Ingredient,
  ItemComparison,
  Price,
  PriceSource,
  Product,
  ShoppingListItem,
  Store,
  StoreChain,
  StoreOffer,
} from './types';
import { todayISO } from './dates';
import { convertBase, roundTo } from './units';

export interface CatalogIndex {
  productsByIngredient: Map<string, Product[]>;
  /** productId → (storeId → prix). */
  pricesByProduct: Map<string, Map<string, Price>>;
  storesById: Map<string, Store>;
  productsById: Map<string, Product>;
  /** Optionnel : permet les conversions pièce ↔ g (gramsPerPiece, densité). */
  ingredientsById?: Map<string, Ingredient>;
}

/** Prix exploitable : montant fini et strictement positif (sinon donnée corrompue, ignorée). */
export function isUsablePrice(price: Price): boolean {
  return Number.isFinite(price.priceCents) && price.priceCents > 0;
}

/**
 * Fiabilité d'une source de prix : un relevé réel (Open Prices, flux
 * partenaire, collecte) passe avant une estimation, qui passe avant l'ancien
 * catalogue fictif (`demo`, caches) ; source inconnue : au plus bas.
 */
export const PRICE_SOURCE_RANK: Record<PriceSource, number> = {
  open_prices: 3,
  partner: 3,
  collect: 3,
  estimate: 2,
  demo: 1,
};

function sourceRank(source: string): number {
  return (PRICE_SOURCE_RANK as Record<string, number | undefined>)[source] ?? 0;
}

/** Prix estimé (aucun relevé dans l'enseigne) — toujours signalé « Estimé ». */
export function isEstimatedPrice(price: Pick<Price, 'source'> | null | undefined): boolean {
  return price?.source === 'estimate';
}

/** Offre ou ligne de panier dont le prix est une estimation. */
export function hasEstimatedPrice(x: { priceSource?: PriceSource } | null | undefined): boolean {
  return x?.priceSource === 'estimate';
}

/**
 * Vrai si `a` doit remplacer `b` pour un même (produit, magasin) : d'abord la
 * source la plus FIABLE (relevé > estimation > démo, voir `PRICE_SOURCE_RANK`),
 * puis le plus récent, comparé en INSTANT (les horodatages peuvent avoir des
 * fuseaux différents) ; à égalité, départage total et déterministe pour que le
 * résultat ne dépende pas de l'ordre des entrées : prix le plus élevé d'abord
 * (estimation prudente du panier), puis promo, puis source.
 */
export function isPreferredPrice(a: Price, b: Price): boolean {
  const ra = sourceRank(a.source);
  const rb = sourceRank(b.source);
  if (ra !== rb) return ra > rb;
  const ta = Date.parse(a.updatedAt);
  const tb = Date.parse(b.updatedAt);
  if (Number.isFinite(ta) && Number.isFinite(tb)) {
    if (ta !== tb) return ta > tb;
  } else if (a.updatedAt !== b.updatedAt) {
    return String(a.updatedAt) > String(b.updatedAt);
  }
  if (a.priceCents !== b.priceCents) return a.priceCents > b.priceCents;
  const pa = a.promoPriceCents ?? Number.MAX_SAFE_INTEGER;
  const pb = b.promoPriceCents ?? Number.MAX_SAFE_INTEGER;
  if (pa !== pb) return pa > pb;
  const ka = `${a.promoUntil ?? ''}|${a.source}|${a.promoLabel ?? ''}`;
  const kb = `${b.promoUntil ?? ''}|${b.source}|${b.promoLabel ?? ''}`;
  return ka > kb;
}

/**
 * Enseignes d'une MDD : `storeChains`, sinon l'ancien champ `storeChain`
 * (caches d'avant les données réelles). `null` : marque nationale, ou MDD
 * sans enseigne connue (aucune restriction possible).
 */
export function storeBrandChains(product: Pick<Product, 'isStoreBrand' | 'storeChains'>): StoreChain[] | null {
  if (!product.isStoreBrand) return null;
  if (product.storeChains && product.storeChains.length > 0) return product.storeChains;
  const legacy = (product as { storeChain?: StoreChain }).storeChain;
  return legacy ? [legacy] : null;
}

/** Une MDD n'est vendue que dans ses enseignes (une marque nationale, partout). */
export function isSoldByChain(product: Pick<Product, 'isStoreBrand' | 'storeChains'>, chain: StoreChain): boolean {
  const chains = storeBrandChains(product);
  return !chains || chains.includes(chain);
}

/**
 * Vrai si le produit contient au moins un des allergènes (ceux de
 * l'ingrédient ∪ ceux déclarés par Open Food Facts) : il n'est alors JAMAIS
 * proposé (offre, alternative, choix de produit).
 */
export function productContainsAllergen(product: Pick<Product, 'allergens'>, allergens: readonly Allergen[] | undefined): boolean {
  if (!allergens || allergens.length === 0) return false;
  const declared = product.allergens ?? [];
  return allergens.some((a) => declared.includes(a));
}

/** Prix effectif : promo si elle existe, est moins chère et n'a pas expiré. */
export function effectivePrice(price: Price, now?: string): { cents: number; isPromo: boolean } {
  const promo = price.promoPriceCents;
  // Une promo à 0 € (ou NaN) est une donnée corrompue : elle rendrait l'article gratuit.
  if (typeof promo === 'number' && promo > 0 && promo < price.priceCents) {
    const today = todayISO(now);
    if (!price.promoUntil || price.promoUntil.slice(0, 10) >= today) return { cents: promo, isPromo: true };
  }
  return { cents: price.priceCents, isPromo: false };
}

/** Index du catalogue pour des comparaisons rapides. Le prix le plus récent gagne. */
export function buildCatalogIndex(
  products: readonly Product[],
  prices: readonly Price[],
  stores: readonly Store[],
  ingredients?: readonly Ingredient[] | Record<string, Ingredient>,
): CatalogIndex {
  const productsByIngredient = new Map<string, Product[]>();
  const productsById = new Map<string, Product>();
  for (const p of products) {
    productsById.set(p.id, p);
    const list = productsByIngredient.get(p.ingredientId);
    if (list) list.push(p);
    else productsByIngredient.set(p.ingredientId, [p]);
  }
  const pricesByProduct = new Map<string, Map<string, Price>>();
  for (const price of prices) {
    if (!isUsablePrice(price)) continue;
    let byStore = pricesByProduct.get(price.productId);
    if (!byStore) {
      byStore = new Map();
      pricesByProduct.set(price.productId, byStore);
    }
    const prev = byStore.get(price.storeId);
    if (!prev || isPreferredPrice(price, prev)) byStore.set(price.storeId, price);
  }
  const index: CatalogIndex = {
    productsByIngredient,
    pricesByProduct,
    storesById: new Map(stores.map((s) => [s.id, s])),
    productsById,
  };
  if (ingredients) {
    const list = Array.isArray(ingredients) ? ingredients : Object.values(ingredients);
    index.ingredientsById = new Map(list.map((i) => [i.id, i]));
  }
  return index;
}

/** Unité de référence d'affichage du prix (« au kilo »). */
export function referenceUnitFor(unit: BaseUnit): StoreOffer['referenceUnit'] {
  return unit === 'g' ? 'kg' : unit === 'ml' ? 'l' : 'piece';
}

/** Prix au kg / l / pièce en centimes. */
export function pricePerReference(priceCents: number, packSize: number, packUnit: BaseUnit): number {
  if (!(packSize > 0)) return priceCents;
  const perBase = priceCents / packSize;
  return Math.round(packUnit === 'piece' ? perBase : perBase * 1000);
}

function compareOffers(a: StoreOffer, b: StoreOffer): number {
  return (
    a.totalCents - b.totalCents ||
    a.pricePerBaseUnitCents - b.pricePerBaseUnitCents ||
    (a.storeId < b.storeId ? -1 : a.storeId > b.storeId ? 1 : 0) ||
    (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0)
  );
}

export interface OfferOptions {
  /**
   * Allergènes déclarés du profil : un produit qui en contient un n'est
   * jamais proposé (défense en profondeur : l'app filtre aussi l'index).
   */
  excludeAllergens?: readonly Allergen[];
}

/** Provenance d'un prix, copiée sur l'offre (champs de vue optionnels). */
export function offerProvenance(
  price: Price,
): Pick<StoreOffer, 'priceSource' | 'priceUpdatedAt' | 'observationCount' | 'estimateMethod'> {
  const out: Pick<StoreOffer, 'priceSource' | 'priceUpdatedAt' | 'observationCount' | 'estimateMethod'> = {
    priceSource: price.source,
    priceUpdatedAt: price.updatedAt,
  };
  if (typeof price.observationCount === 'number' && price.observationCount > 0) out.observationCount = price.observationCount;
  if (price.estimateMethod) out.estimateMethod = price.estimateMethod;
  return out;
}

/**
 * Toutes les offres possibles (chaque produit × chaque magasin qui le vend)
 * pour un article. Les MDD ne sont proposées que dans leurs enseignes
 * (`storeChains`) ; avec `excludeAllergens`, aucun produit allergène.
 */
export function allOffersForItem(
  item: ShoppingListItem,
  index: CatalogIndex,
  now?: string,
  opts: OfferOptions = {},
): StoreOffer[] {
  if (!item.ingredientId || !(item.quantity > 0)) return [];
  const products = (index.productsByIngredient.get(item.ingredientId) ?? []).filter(
    (p) => !productContainsAllergen(p, opts.excludeAllergens),
  );
  const ingredient = index.ingredientsById?.get(item.ingredientId);
  const offers: StoreOffer[] = [];
  for (const product of products) {
    const need = convertBase(item.quantity, item.unit, product.packUnit, ingredient);
    if (need === null || !(product.packSize > 0)) continue; // unités incompatibles
    const packs = Math.max(1, Math.ceil(roundTo(need / product.packSize, 6) - 1e-9));
    const byStore = index.pricesByProduct.get(product.id);
    if (!byStore) continue;
    for (const [storeId, price] of byStore) {
      const store = index.storesById.get(storeId);
      if (!store) continue;
      if (!isSoldByChain(product, store.chain)) continue;
      // Jamais de promo sur une estimation (garde-fou si la donnée en porte une).
      const eff = price.source === 'estimate' ? { cents: price.priceCents, isPromo: false } : effectivePrice(price, now);
      offers.push({
        storeId,
        productId: product.id,
        packs,
        unitPriceCents: eff.cents,
        totalCents: packs * eff.cents,
        pricePerBaseUnitCents: pricePerReference(eff.cents, product.packSize, product.packUnit),
        referenceUnit: referenceUnitFor(product.packUnit),
        isStoreBrand: product.isStoreBrand,
        isPromo: eff.isPromo,
        ...offerProvenance(price),
      });
    }
  }
  return offers.sort(compareOffers);
}

/**
 * Comparaison d'un article : meilleure offre par magasin (triées de la moins
 * chère à la plus chère), meilleure offre globale, alternative MDD.
 * Un article manuel sans ingrédient n'a aucune offre.
 */
export function compareItem(item: ShoppingListItem, index: CatalogIndex, now?: string, opts: OfferOptions = {}): ItemComparison {
  const all = allOffersForItem(item, index, now, opts);
  const bestByStore = new Map<string, StoreOffer>();
  for (const o of all) if (!bestByStore.has(o.storeId)) bestByStore.set(o.storeId, o); // `all` est trié
  const offers = Array.from(bestByStore.values()).sort(compareOffers);

  const result: ItemComparison = { itemId: item.id, label: item.label, offers };
  if (offers.length > 0) result.best = offers[0];

  // Alternative MDD : dans un même magasin, la MDD la moins chère qui bat la
  // meilleure marque nationale. On retient la MDD au total le plus bas.
  let alternative: (StoreOffer & { savingsCents: number }) | undefined;
  for (const storeId of bestByStore.keys()) {
    const inStore = all.filter((o) => o.storeId === storeId);
    const national = inStore.find((o) => !o.isStoreBrand);
    const storeBrand = inStore.find((o) => o.isStoreBrand);
    if (!national || !storeBrand) continue;
    const savingsCents = national.totalCents - storeBrand.totalCents;
    if (savingsCents <= 0) continue;
    if (
      !alternative ||
      storeBrand.totalCents < alternative.totalCents ||
      (storeBrand.totalCents === alternative.totalCents && savingsCents > alternative.savingsCents)
    ) {
      alternative = { ...storeBrand, savingsCents };
    }
  }
  if (alternative) result.cheaperAlternative = alternative;
  return result;
}

/**
 * Compare toute la liste. Les articles DÉJÀ COCHÉS (déjà dans le caddie ou
 * à la maison) sont ignorés : on ne compare que ce qui reste à acheter.
 */
export function compareList(
  items: readonly ShoppingListItem[],
  index: CatalogIndex,
  now?: string,
  opts: OfferOptions = {},
): ItemComparison[] {
  return items.filter((i) => !i.checked).map((i) => compareItem(i, index, now, opts));
}

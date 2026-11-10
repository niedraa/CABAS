/// <reference types="jest" />
import { INGREDIENTS, INGREDIENTS_BY_ID, PRICES, PRODUCTS, STORES } from './fixtures';
import {
  allOffersForItem,
  buildCatalogIndex,
  compareItem,
  compareList,
  effectivePrice,
  pricePerReference,
  referenceUnitFor,
} from '../priceComparison';
import { createManualItem } from '../shoppingList';
import type { Price, ShoppingListItem } from '../types';

const NOW = '2026-09-14T10:00:00.000Z';
const index = buildCatalogIndex(PRODUCTS, PRICES, STORES, INGREDIENTS);

const item = (o: Partial<ShoppingListItem>): ShoppingListItem => ({
  id: 'item_pates',
  ingredientId: 'pates',
  label: 'Pâtes',
  quantity: 1200,
  unit: 'g',
  aisle: 'epicerie_salee',
  checked: false,
  source: 'plan',
  recipeIds: [],
  ...o,
});

describe('effectivePrice', () => {
  const p: Price = { productId: 'x', storeId: 's', priceCents: 200, promoPriceCents: 150, promoUntil: '2026-09-14', updatedAt: '2026-09-01', source: 'demo' };
  it('promo valide jusqu’au jour inclus', () => {
    expect(effectivePrice(p, '2026-09-14T23:00:00Z')).toEqual({ cents: 150, isPromo: true });
    expect(effectivePrice(p, '2026-09-13')).toEqual({ cents: 150, isPromo: true });
  });
  it('promo expirée, absente, ou plus chère : prix normal', () => {
    expect(effectivePrice(p, '2026-09-15')).toEqual({ cents: 200, isPromo: false });
    expect(effectivePrice({ ...p, promoPriceCents: undefined }, NOW)).toEqual({ cents: 200, isPromo: false });
    expect(effectivePrice({ ...p, promoPriceCents: 250 }, '2026-09-01')).toEqual({ cents: 200, isPromo: false });
  });
  it('promo sans date de fin : toujours valide ; date du jour par défaut', () => {
    expect(effectivePrice({ ...p, promoUntil: undefined }, '2030-01-01')).toEqual({ cents: 150, isPromo: true });
    expect(effectivePrice({ ...p, promoUntil: '2999-01-01' })).toEqual({ cents: 150, isPromo: true });
  });
});

describe('buildCatalogIndex', () => {
  it('indexe produits, prix (le plus récent gagne), magasins, ingrédients', () => {
    const idx = buildCatalogIndex(
      PRODUCTS,
      [
        ...PRICES,
        { productId: 'p_huile', storeId: 's_leclerc', priceCents: 1, updatedAt: '2026-08-01', source: 'demo' }, // plus ancien
        { productId: 'p_huile', storeId: 's_lidl', priceCents: 950, updatedAt: '2026-09-02', source: 'demo' },
        { productId: 'p_huile', storeId: 's_lidl', priceCents: 990, updatedAt: '2026-09-03', source: 'demo' },
      ],
      STORES,
      INGREDIENTS_BY_ID,
    );
    expect(idx.productsByIngredient.get('pates')?.map((p) => p.id)).toEqual(['p_pates_barilla', 'p_pates_mdd_leclerc', 'p_pates_mdd_carrefour']);
    expect(idx.pricesByProduct.get('p_huile')?.get('s_leclerc')?.priceCents).toBe(899);
    expect(idx.pricesByProduct.get('p_huile')?.get('s_lidl')?.priceCents).toBe(990);
    expect(idx.storesById.get('s_lidl')?.chain).toBe('lidl');
    expect(idx.productsById.get('p_huile')?.brand).toBe('Puget');
    expect(idx.ingredientsById?.get('oignon')?.gramsPerPiece).toBe(110);
    expect(buildCatalogIndex([], [], []).ingredientsById).toBeUndefined();
  });
});

describe('compareItem', () => {
  it('meilleure offre par magasin, MDD limitée à son enseigne, promo prise en compte', () => {
    const c = compareItem(item({}), index, NOW);
    expect(c.offers.map((o) => [o.storeId, o.productId, o.packs, o.totalCents])).toEqual([
      ['s_carrefour', 'p_pates_mdd_carrefour', 3, 225],
      ['s_leclerc', 'p_pates_mdd_leclerc', 2, 238],
      ['s_lidl', 'p_pates_barilla', 3, 447],
    ]);
    expect(c.best).toMatchObject({ storeId: 's_carrefour', unitPriceCents: 75, pricePerBaseUnitCents: 150, referenceUnit: 'kg', isStoreBrand: true, isPromo: false });
    // MDD Leclerc « vue » chez Carrefour à 0,01 € : ignorée
    expect(allOffersForItem(item({}), index, NOW).some((o) => o.storeId === 's_carrefour' && o.productId === 'p_pates_mdd_leclerc')).toBe(false);
    // Barilla en promo chez Carrefour (0,99 € au lieu de 1,39 €)
    const barillaCarrefour = allOffersForItem(item({}), index, NOW).find((o) => o.storeId === 's_carrefour' && o.productId === 'p_pates_barilla');
    expect(barillaCarrefour).toMatchObject({ unitPriceCents: 99, totalCents: 297, isPromo: true });
  });

  it('alternative MDD : la moins chère qui bat une marque nationale du même magasin', () => {
    const c = compareItem(item({}), index, NOW);
    expect(c.cheaperAlternative).toMatchObject({ storeId: 's_carrefour', productId: 'p_pates_mdd_carrefour', totalCents: 225, savingsCents: 72 });
    // promo expirée : l'économie vs Barilla augmente
    const later = compareItem(item({}), index, '2026-09-21');
    expect(later.cheaperAlternative?.savingsCents).toBe(417 - 225);
  });

  it('pas d’alternative si aucune MDD ne bat la marque', () => {
    const c = compareItem(item({ id: 'item_huile', ingredientId: 'huile_olive', label: 'Huile', quantity: 23, unit: 'ml' }), index, NOW);
    expect(c.cheaperAlternative).toBeUndefined();
    expect(c.best).toMatchObject({ storeId: 's_carrefour', totalCents: 749, referenceUnit: 'l', pricePerBaseUnitCents: 999 });
  });

  it('conversion pièces ↔ g via le poids moyen', () => {
    const c = compareItem(item({ id: 'item_oignon', ingredientId: 'oignon', label: 'Oignon', quantity: 3, unit: 'piece' }), index, NOW);
    expect(c.offers.map((o) => [o.storeId, o.packs, o.totalCents, o.referenceUnit])).toEqual([
      ['s_carrefour', 3, 105, 'piece'],
      ['s_lidl', 1, 159, 'kg'],
      ['s_leclerc', 1, 189, 'kg'],
    ]);
    // sans référentiel d'ingrédients : seuls les produits à la pièce sont comparables
    const bare = buildCatalogIndex(PRODUCTS, PRICES, STORES);
    expect(compareItem(item({ ingredientId: 'oignon', quantity: 3, unit: 'piece' }), bare, NOW).offers.map((o) => o.storeId)).toEqual(['s_carrefour']);
  });

  it('égalité de total : prix au kilo le plus bas', () => {
    const idx = buildCatalogIndex(
      [
        { ...PRODUCTS[0], id: 'a', packSize: 500 },
        { ...PRODUCTS[0], id: 'b', packSize: 1000 },
      ],
      [
        { productId: 'a', storeId: 's_lidl', priceCents: 100, updatedAt: '2026-09-01', source: 'demo' },
        { productId: 'b', storeId: 's_lidl', priceCents: 100, updatedAt: '2026-09-01', source: 'demo' },
      ],
      STORES,
    );
    expect(compareItem(item({ quantity: 400 }), idx, NOW).best?.productId).toBe('b');
  });

  it('articles manuels, quantités nulles, produits sans prix ou magasin inconnu', () => {
    expect(compareItem(createManualItem('Piles', { id: 'm' }), index, NOW)).toEqual({ itemId: 'm', label: 'Piles', offers: [] });
    expect(compareItem(item({ quantity: 0 }), index, NOW).offers).toEqual([]);
    expect(compareItem(item({ ingredientId: 'safran' }), index, NOW).best).toBeUndefined();
    const idx = buildCatalogIndex(
      [{ ...PRODUCTS[0], id: 'np' }, { ...PRODUCTS[0], id: 'zero', packSize: 0 }, { ...PRODUCTS[0], id: 'ghost' }],
      [
        { productId: 'zero', storeId: 's_lidl', priceCents: 1, updatedAt: '2026-09-01', source: 'demo' },
        { productId: 'ghost', storeId: 's_inconnu', priceCents: 1, updatedAt: '2026-09-01', source: 'demo' },
      ],
      STORES,
    );
    expect(compareItem(item({}), idx, NOW).offers).toEqual([]);
  });

  it('compareList ignore les articles cochés', () => {
    const res = compareList([item({}), item({ id: 'deja', checked: true })], index, NOW);
    expect(res.map((c) => c.itemId)).toEqual(['item_pates']);
  });

  it('helpers de prix de référence', () => {
    expect(referenceUnitFor('g')).toBe('kg');
    expect(referenceUnitFor('ml')).toBe('l');
    expect(referenceUnitFor('piece')).toBe('piece');
    expect(pricePerReference(199, 250, 'g')).toBe(796);
    expect(pricePerReference(250, 6, 'piece')).toBe(42);
    expect(pricePerReference(250, 0, 'g')).toBe(250);
  });
});

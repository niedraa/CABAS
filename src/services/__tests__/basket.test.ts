import type { Ingredient, Price, Product, ShoppingListItem, Store } from '@/core';

import { createBasketService, effectiveBasketMode, type BasketRemote } from '../basket';
import { buildCatalogSnapshot } from '../catalog';

/**
 * Catalogue miniature (indépendant du contenu de src/data, régénéré à chaque
 * import de données ouvertes) : 3 ingrédients, 4 enseignes.
 */
const ingredient = (id: string): Ingredient => ({
  id,
  name: id,
  aisle: 'epicerie_salee',
  allergens: [],
  isMeat: false,
  isPork: false,
  isFish: false,
  isSeafood: false,
  isAnimalProduct: false,
  baseUnit: 'g',
});
const store = (chain: Store['chain']): Store => ({
  id: chain,
  chain,
  name: chain,
  city: 'France',
  pickup: chain === 'lidl' ? 'none' : 'drive',
  driveFeeCents: 0,
  deliveryFeeCents: chain === 'lidl' ? null : 690,
  minOrderCents: 0,
  searchUrlTemplate: `https://${chain}.example/s?q={query}`,
  driveUrl: `https://${chain}.example/`,
});
const product = (ingredientId: string): Product => ({
  id: `prd_${ingredientId}`,
  ean: '3111952035624',
  name: ingredientId,
  brand: 'Marque',
  isStoreBrand: false,
  ingredientId,
  packSize: 500,
  packUnit: 'g',
  allergens: [],
});
const STORE_IDS = ['leclerc', 'carrefour', 'auchan', 'lidl'] as const;
const INGREDIENT_IDS = ['riz', 'lentilles', 'pois_chiches'];
const PRICES: Price[] = INGREDIENT_IDS.flatMap((ing, i) =>
  STORE_IDS.map((s, j) => ({
    productId: `prd_${ing}`,
    storeId: s,
    priceCents: 150 + 10 * i + 7 * ((i + j) % 4),
    updatedAt: '2026-11-03T12:00:00.000Z',
    source: 'open_prices' as const,
    observationCount: 2,
    observedFrom: '2026-05-01',
  })),
);
const SNAPSHOT = buildCatalogSnapshot(
  {
    recipes: [],
    ingredients: INGREDIENT_IDS.map(ingredient),
    stores: STORE_IDS.map(store),
    products: INGREDIENT_IDS.map(product),
    prices: PRICES,
  },
  'local',
);
const getCatalog = () => SNAPSHOT;

function items(): ShoppingListItem[] {
  return INGREDIENT_IDS.map((id) => ({
    id,
    ingredientId: id,
    label: id,
    quantity: 400,
    unit: 'g' as const,
    aisle: 'epicerie_salee' as const,
    checked: false,
    source: 'plan' as const,
    recipeIds: [],
  }));
}

describe('basket service', () => {
  it('le mode « le moins cher » est Premium', () => {
    expect(effectiveBasketMode('cheapest', 'free')).toBe('single_store');
    expect(effectiveBasketMode('cheapest', 'premium')).toBe('cheapest');
    expect(effectiveBasketMode('single_store', 'premium')).toBe('single_store');
  });

  it('local : comparaison sur ≥ 3 enseignes et panier dans les magasins choisis', async () => {
    const service = createBasketService({ remote: null, getCatalog });
    const list = items();
    const res = await service.computeBasket({
      items: list,
      mode: 'cheapest',
      storeIds: ['leclerc', 'carrefour', 'auchan'],
      channel: 'drive',
      entitlement: 'premium',
    });
    expect(res.source).toBe('local');
    expect(res.mode).toBe('cheapest');
    const withOffers = res.comparisons.filter((c) => c.offers.length > 0);
    expect(withOffers.length).toBeGreaterThan(0);
    expect(withOffers.some((c) => new Set(c.offers.map((o) => o.storeId)).size >= 3)).toBe(true);
    for (const part of res.plan.parts) expect(['leclerc', 'carrefour', 'auchan']).toContain(part.storeId);
    expect(res.plan.totalCents).toBeGreaterThan(0);
  });

  it('gratuit : rétrogradé en « un seul magasin »', async () => {
    const res = await createBasketService({ remote: null, getCatalog }).computeBasket({
      items: items(),
      mode: 'cheapest',
      storeIds: [],
      channel: 'drive',
      entitlement: 'free',
    });
    expect(res.downgraded).toBe(true);
    expect(res.plan.mode).toBe('single_store');
    expect(res.plan.parts.length).toBe(1);
  });

  it('repli local si optimize-basket échoue ; articles cochés ignorés', async () => {
    const remote: BasketRemote = jest.fn().mockRejectedValue(new Error('500'));
    const list = items();
    list[0] = { ...list[0], checked: true };
    const res = await createBasketService({ remote, getCatalog }).computeBasket({
      items: list,
      mode: 'single_store',
      storeIds: [],
      channel: 'delivery',
      entitlement: 'free',
    });
    expect(res.source).toBe('fallback');
    expect((remote as jest.Mock).mock.calls[0][0].items).toHaveLength(list.length - 1);
    expect(res.comparisons.map((c) => c.itemId)).not.toContain(list[0].id);
  });

  it('refuse une réponse serveur multi-magasins pour un compte gratuit', async () => {
    const local = await createBasketService({ remote: null, getCatalog }).computeBasket({
      items: items(),
      mode: 'cheapest',
      storeIds: [],
      channel: 'drive',
      entitlement: 'premium',
    });
    const remote: BasketRemote = async () => ({ comparisons: local.comparisons, plan: local.plan, meta: { mode: 'cheapest' } });
    const res = await createBasketService({ remote, getCatalog }).computeBasket({
      items: items(),
      mode: 'cheapest',
      storeIds: [],
      channel: 'drive',
      entitlement: 'free',
    });
    expect(res.source).toBe('fallback');
    expect(res.mode).toBe('single_store');
  });
});

import type { MealPlan, ShoppingListItem } from '@/core';
import { buildShoppingList, startOfWeek, todayISO } from '@/core';

import { createBasketService, effectiveBasketMode, type BasketRemote } from '../basket';
import { getCatalogSnapshot } from '../catalog';

const WEEK = startOfWeek(todayISO());

function items(): ShoppingListItem[] {
  const cat = getCatalogSnapshot();
  const plan: MealPlan = {
    id: 'p',
    weekStart: WEEK,
    generatedAt: '',
    source: 'rules',
    meals: [
      { id: 'a', date: WEEK, type: 'diner', recipeId: 'rec_ratatouille', servings: 3 },
      { id: 'b', date: WEEK, type: 'dejeuner', recipeId: 'rec_curry_pois_chiches', servings: 3 },
    ],
  };
  return buildShoppingList(plan, cat.recipesById, cat.ingredientsById, { products: cat.products });
}

describe('basket service', () => {
  it('le mode « le moins cher » est Premium', () => {
    expect(effectiveBasketMode('cheapest', 'free')).toBe('single_store');
    expect(effectiveBasketMode('cheapest', 'premium')).toBe('cheapest');
    expect(effectiveBasketMode('single_store', 'premium')).toBe('single_store');
  });

  it('local : comparaison sur ≥ 3 enseignes et panier dans les magasins choisis', async () => {
    const service = createBasketService({ remote: null });
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
    const res = await createBasketService({ remote: null }).computeBasket({
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
    const res = await createBasketService({ remote }).computeBasket({
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
    const local = await createBasketService({ remote: null }).computeBasket({
      items: items(),
      mode: 'cheapest',
      storeIds: [],
      channel: 'drive',
      entitlement: 'premium',
    });
    const remote: BasketRemote = async () => ({ comparisons: local.comparisons, plan: local.plan, meta: { mode: 'cheapest' } });
    const res = await createBasketService({ remote }).computeBasket({
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

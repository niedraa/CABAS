import { assert, assertEquals, assertFalse } from '@std/assert';
import type { BasketPlan, Entitlement, ShoppingListItem } from '../_shared/core/index.ts';
import { HttpError } from '../_shared/http.ts';
import { silentLogger } from '../_shared/logger.ts';
import { INGREDIENTS, PRICES, PRODUCTS, STORES } from '../_shared/testing/fixtures.ts';
import { type BasketRepository, createOptimizeBasketHandler } from './handler.ts';

const NOW = new Date('2026-11-10T09:00:00.000Z');

const ITEMS: ShoppingListItem[] = [
  { id: 'riz', ingredientId: 'riz', label: 'Riz', quantity: 600, unit: 'g', aisle: 'epicerie_salee', checked: false, source: 'plan', recipeIds: [] },
  { id: 'tomate', ingredientId: 'tomate', label: 'Tomates', quantity: 800, unit: 'g', aisle: 'fruits_legumes', checked: false, source: 'plan', recipeIds: [] },
  { id: 'oignon', ingredientId: 'oignon', label: 'Oignons', quantity: 300, unit: 'g', aisle: 'fruits_legumes', checked: false, source: 'plan', recipeIds: [] },
  { id: 'sacs', label: 'Sacs poubelle', quantity: 1, unit: 'piece', aisle: 'hygiene_maison', checked: false, source: 'manual', recipeIds: [] },
];

function fakeRepo(opts: { entitlement?: Entitlement; preferred?: string[]; saveFails?: boolean } = {}) {
  const saved: { plan: BasketPlan; listId?: string }[] = [];
  const offerCalls: string[][] = [];
  const repo: BasketRepository = {
    loadEntitlement: () => Promise.resolve(opts.entitlement ?? 'premium'),
    loadPreferredStoreIds: () => Promise.resolve(opts.preferred ?? []),
    loadStores: () => Promise.resolve(STORES),
    loadOffers(ids) {
      offerCalls.push(ids);
      const products = PRODUCTS.filter((p) => ids.includes(p.ingredientId));
      const pids = new Set(products.map((p) => p.id));
      return Promise.resolve({ products, prices: PRICES.filter((p) => pids.has(p.productId)) });
    },
    loadIngredients: (ids) => Promise.resolve(INGREDIENTS.filter((i) => ids.includes(i.id))),
    saveBasketPlan(plan, listId) {
      if (opts.saveFails) return Promise.reject(new Error('db'));
      saved.push({ plan, listId });
      return Promise.resolve('basket_1');
    },
  };
  return { repo, saved, offerCalls };
}

function handlerWith(repo: BasketRepository) {
  return createOptimizeBasketHandler({
    logger: silentLogger,
    now: () => NOW,
    authenticate: () => Promise.resolve({ userId: 'user-a', repo }),
  });
}

// deno-lint-ignore no-explicit-any
async function call(repo: BasketRepository, body: unknown): Promise<{ status: number; data: any }> {
  const res = await handlerWith(repo)(
    new Request('http://localhost/optimize-basket', { method: 'POST', body: JSON.stringify(body) }),
  );
  return { status: res.status, data: await res.json() };
}

Deno.test('comparaison : chaque article comparé dans ≥ 3 enseignes, prix au kilo, MDD', async () => {
  const { repo, offerCalls } = fakeRepo();
  const { status, data } = await call(repo, { items: ITEMS, mode: 'single_store' });
  assertEquals(status, 200);
  assertEquals(offerCalls[0].sort(), ['oignon', 'riz', 'tomate']);
  const byId = Object.fromEntries(data.comparisons.map((c: { itemId: string }) => [c.itemId, c]));
  for (const id of ['riz', 'tomate', 'oignon']) {
    assert(byId[id].offers.length >= 3, `${id} : ${byId[id].offers.length} enseignes`);
    assertEquals(byId[id].offers[0].referenceUnit, 'kg');
  }
  // Riz : la MDD Lidl (1,29 €) bat la marque nationale chez Lidl (2,09 €).
  assertEquals(byId.riz.best.productId, 'prd_riz_mdd_lidl');
  assertEquals(byId.riz.cheaperAlternative.savingsCents, 80);
  // Article libre : aucune offre, signalé.
  assertEquals(byId.sacs.offers.length, 0);
  assertEquals(data.meta.itemsWithoutOffer, ['sacs']);
  assertEquals(data.meta.storesCompared, 4);
});

Deno.test('premium : « le moins cher » multi-magasins', async () => {
  const { repo } = fakeRepo({ entitlement: 'premium' });
  const { data } = await call(repo, { items: ITEMS, mode: 'cheapest' });
  assertEquals(data.plan.mode, 'cheapest');
  assertFalse(data.meta.downgraded);
  assert(data.plan.totalCents > 0);
  assertEquals(data.plan.missingItemIds, ['sacs'], 'seul l\'article libre est introuvable');
  // Le panier multi-magasins n'est jamais plus cher que le meilleur mono-magasin.
  const { data: single } = await call(repo, { items: ITEMS, mode: 'single_store' });
  assert(data.plan.totalCents <= single.plan.totalCents);
});

Deno.test('gratuit : « le moins cher » rétrogradé en « un seul magasin » (comparaison conservée)', async () => {
  const { repo } = fakeRepo({ entitlement: 'free' });
  const { status, data } = await call(repo, { items: ITEMS, mode: 'cheapest' });
  assertEquals(status, 200);
  assertEquals(data.plan.mode, 'single_store');
  assertEquals(data.plan.parts.length, 1);
  assert(data.meta.downgraded);
  assertEquals(data.meta.reason, 'premium_required');
  assertEquals(data.meta.requestedMode, 'cheapest');
  assertEquals(data.comparisons.length, ITEMS.length);
});

Deno.test('magasins : storeIds explicites > préférés du profil > tous ; ids inconnus ignorés', async () => {
  const pref = fakeRepo({ preferred: ['carrefour'] });
  const a = await call(pref.repo, { items: ITEMS, mode: 'single_store' });
  assertEquals(a.data.plan.parts.map((p: { storeId: string }) => p.storeId), ['carrefour']);
  assertEquals(a.data.meta.allowedStoreIds, ['carrefour']);
  // Comparaison toujours faite sur tous les magasins.
  assertEquals(a.data.meta.storesCompared, 4);

  const explicit = await call(pref.repo, { items: ITEMS, mode: 'single_store', storeIds: ['auchan', 'inconnu'] });
  assertEquals(explicit.data.meta.allowedStoreIds, ['auchan']);
  assertEquals(explicit.data.plan.parts[0].storeId, 'auchan');

  const unknownOnly = await call(fakeRepo().repo, { items: ITEMS, mode: 'single_store', storeIds: ['inconnu'] });
  assertEquals(unknownOnly.data.meta.allowedStoreIds.length, 4);
});

Deno.test('livraison : frais de livraison inclus', async () => {
  const { repo } = fakeRepo();
  const drive = await call(repo, { items: ITEMS, mode: 'single_store', storeIds: ['leclerc'] });
  const delivery = await call(repo, { items: ITEMS, mode: 'single_store', storeIds: ['leclerc'], channel: 'delivery' });
  assertEquals(delivery.data.plan.totalCents - drive.data.plan.totalCents, 599);
});

Deno.test('save : instantané enregistré (et échec non bloquant)', async () => {
  const ok = fakeRepo();
  const { data } = await call(ok.repo, { items: ITEMS, mode: 'single_store', save: true, listId: 'list_1' });
  assertEquals(data.meta.basketPlanId, 'basket_1');
  assertEquals(ok.saved[0].listId, 'list_1');
  assertEquals(ok.saved[0].plan.totalCents, data.plan.totalCents);

  const ko = fakeRepo({ saveFails: true });
  const res = await call(ko.repo, { items: ITEMS, mode: 'single_store', save: true });
  assertEquals(res.status, 200);
  assertEquals(res.data.meta.basketPlanId, undefined);
});

Deno.test('articles cochés : ignorés par le comparateur', async () => {
  const items = ITEMS.map((i) => (i.id === 'riz' ? { ...i, checked: true } : i));
  const { data } = await call(fakeRepo().repo, { items, mode: 'single_store' });
  assertFalse(data.comparisons.some((c: { itemId: string }) => c.itemId === 'riz'));
});

Deno.test('validation : requêtes invalides → 400', async () => {
  const { repo } = fakeRepo();
  for (const body of [
    {},
    { items: [] },
    { items: 'riz' },
    { items: [{ id: 'x', quantity: -1, unit: 'g' }] },
    { items: [{ id: 'x', quantity: 1, unit: 'kg' }] },
    { items: [{ id: 'x', quantity: 1, unit: 'g' }, { id: 'x', quantity: 2, unit: 'g' }] },
    { items: ITEMS, mode: 'gratuit' },
    { items: ITEMS, channel: 'pigeon' },
    { items: ITEMS, maxStores: 9 },
    { items: ITEMS, storeIds: 'lidl' },
    { items: Array.from({ length: 301 }, (_, i) => ({ id: `i${i}`, quantity: 1, unit: 'g' })) },
  ]) {
    const { status } = await call(repo, body);
    assertEquals(status, 400, JSON.stringify(body).slice(0, 80));
  }
});

Deno.test('authentification requise → 401', async () => {
  const handler = createOptimizeBasketHandler({
    logger: silentLogger,
    authenticate: () => Promise.reject(new HttpError(401, 'unauthorized', 'Connexion requise.')),
  });
  const res = await handler(new Request('http://x', { method: 'POST', body: '{}' }));
  assertEquals(res.status, 401);
  await res.body?.cancel();
});

Deno.test('erreur base de données → 500 générique sans détail interne', async () => {
  const { repo } = fakeRepo();
  repo.loadStores = () => Promise.reject(new Error('relation "stores" password=hunter2'));
  const { status, data } = await call(repo, { items: ITEMS, mode: 'single_store' });
  assertEquals(status, 500);
  assertEquals(data.error.code, 'internal_error');
  assertFalse(JSON.stringify(data).includes('hunter2'));
});

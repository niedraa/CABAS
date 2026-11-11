/// <reference types="jest" />
import { INGREDIENTS, PRICES, PRODUCTS, STORES } from './fixtures';
import { MAX_ENUMERATED_STORES, optimizeBasket, storeFees, storeTotals } from '../basketOptimizer';
import { buildCatalogIndex, compareList } from '../priceComparison';
import { mulberry32 } from '../random';
import type { ItemComparison, ShoppingListItem, Store, StoreOffer } from '../types';

const NOW = '2026-09-14T10:00:00.000Z';

function st(id: string, o: Partial<Store> = {}): Store {
  return {
    id,
    chain: 'leclerc',
    name: id.toUpperCase(),
    city: 'Lyon',
    pickup: 'drive',
    driveFeeCents: 0,
    deliveryFeeCents: 0,
    minOrderCents: 0,
    searchUrlTemplate: 'https://x.example/?q={query}',
    driveUrl: 'https://x.example/drive',
    ...o,
  };
}

function offer(storeId: string, totalCents: number, productId = `p_${storeId}`): StoreOffer {
  return {
    storeId,
    productId,
    packs: 1,
    unitPriceCents: totalCents,
    totalCents,
    pricePerBaseUnitCents: totalCents,
    referenceUnit: 'piece',
    isStoreBrand: false,
    isPromo: false,
  };
}

function cmp(itemId: string, offers: StoreOffer[]): ItemComparison {
  const sorted = offers.slice().sort((a, b) => a.totalCents - b.totalCents);
  return { itemId, label: itemId.toUpperCase(), offers: sorted, best: sorted[0] };
}

/**
 * Exemple calculé à la main.
 *        i1   i2   i3   i4   i5
 *  A    300  500  100   —    —     frais drive 0,  livraison 500
 *  B    200  450  150  400   —     frais drive 200, livraison 300
 *  C    250   —    50   —    —     frais drive 100, minimum 10 €, pas de livraison
 */
const A = st('a', { driveFeeCents: 0, deliveryFeeCents: 500 });
const B = st('b', { driveFeeCents: 200, deliveryFeeCents: 300 });
const C = st('c', { driveFeeCents: 100, deliveryFeeCents: null, minOrderCents: 1000 });
const STORES_ABC = [A, B, C];
const COMPARISONS = [
  cmp('i1', [offer('a', 300), offer('b', 200), offer('c', 250)]),
  cmp('i2', [offer('a', 500), offer('b', 450)]),
  cmp('i3', [offer('a', 100), offer('b', 150), offer('c', 50)]),
  cmp('i4', [offer('b', 400)]),
  cmp('i5', []),
];

describe('storeTotals', () => {
  it('total « tout dans ce magasin » avec frais', () => {
    expect(storeTotals(COMPARISONS, STORES_ABC)).toEqual([
      { storeId: 'a', subtotalCents: 900, feesCents: 0, totalCents: 900, coveredItemIds: ['i1', 'i2', 'i3'], missingItemIds: ['i4', 'i5'] },
      { storeId: 'b', subtotalCents: 1200, feesCents: 200, totalCents: 1400, coveredItemIds: ['i1', 'i2', 'i3', 'i4'], missingItemIds: ['i5'] },
      { storeId: 'c', subtotalCents: 300, feesCents: 100, totalCents: 400, coveredItemIds: ['i1', 'i3'], missingItemIds: ['i2', 'i4', 'i5'] },
    ]);
    expect(storeTotals(COMPARISONS, [C], { channel: 'delivery' })[0].feesCents).toBe(0);
    expect(storeTotals(COMPARISONS, [B], { includeFees: false })[0].totalCents).toBe(1200);
  });

  it('storeFees', () => {
    expect(storeFees(B)).toBe(200);
    expect(storeFees(B, 'delivery')).toBe(300);
    expect(storeFees(C, 'delivery')).toBeNull();
    expect(storeFees({ ...A, driveFeeCents: undefined as never })).toBe(0);
  });
});

describe('optimizeBasket — exemple calculé à la main', () => {
  it('le moins cher (2 magasins max) : A + B = 1 350 €, économie 50', () => {
    const plan = optimizeBasket(COMPARISONS, STORES_ABC, 'cheapest', { now: NOW });
    // {A}: 900 (3 art.) · {B}: 1400 (4) · {A,B}: i1→B, i2→B, i3→A, i4→B = 100 + 1050 + 200 = 1350 (4)
    // {A,C} et {B,C} : C sous son minimum de commande → invalides
    expect(plan.parts).toEqual([
      { storeId: 'a', lines: [{ itemId: 'i3', label: 'I3', productId: 'p_a', packs: 1, totalCents: 100 }], subtotalCents: 100, feesCents: 0 },
      {
        storeId: 'b',
        lines: [
          { itemId: 'i1', label: 'I1', productId: 'p_b', packs: 1, totalCents: 200 },
          { itemId: 'i2', label: 'I2', productId: 'p_b', packs: 1, totalCents: 450 },
          { itemId: 'i4', label: 'I4', productId: 'p_b', packs: 1, totalCents: 400 },
        ],
        subtotalCents: 1050,
        feesCents: 200,
      },
    ]);
    expect(plan.totalCents).toBe(1350);
    expect(plan.savingsCents).toBe(50); // vs B seul (1 400)
    expect(plan.missingItemIds).toEqual(['i5']);
    expect(plan.mode).toBe('cheapest');
    expect(plan.computedAt).toBe(NOW);
  });

  it('un seul magasin : couverture max puis total → B', () => {
    const plan = optimizeBasket(COMPARISONS, STORES_ABC, 'single_store', { now: NOW });
    expect(plan.parts.map((p) => p.storeId)).toEqual(['b']);
    expect(plan.totalCents).toBe(1400);
    expect(plan.savingsCents).toBe(0);
    expect(plan.missingItemIds).toEqual(['i5']);
  });

  it('sans frais', () => {
    const plan = optimizeBasket(COMPARISONS, STORES_ABC, 'cheapest', { includeFees: false });
    expect(plan.totalCents).toBe(1150);
    expect(plan.savingsCents).toBe(50);
    expect(plan.parts.every((p) => p.feesCents === 0)).toBe(true);
  });

  it('livraison : les frais changent la décision (B seul), C exclu', () => {
    const plan = optimizeBasket(COMPARISONS, STORES_ABC, 'cheapest', { channel: 'delivery' });
    // {A}: 900+500=1400 (3) · {B}: 1200+300=1500 (4) · {A,B}: 100+500 + 1050+300 = 1950 (4)
    expect(plan.parts.map((p) => p.storeId)).toEqual(['b']);
    expect(plan.totalCents).toBe(1500);
  });

  it('maxStores = 1 équivaut à un seul magasin', () => {
    expect(optimizeBasket(COMPARISONS, STORES_ABC, 'cheapest', { maxStores: 1 }).totalCents).toBe(1400);
  });

  it('minimum de commande : invalide sauf s’il n’y a pas d’autre choix', () => {
    const plan = optimizeBasket(COMPARISONS, STORES_ABC, 'cheapest', { allowedStoreIds: ['c'] });
    expect(plan.parts.map((p) => [p.storeId, p.subtotalCents, p.feesCents])).toEqual([['c', 300, 100]]);
    expect(plan.totalCents).toBe(400);
    expect(plan.missingItemIds).toEqual(['i2', 'i4', 'i5']);
  });

  it('aucun magasin éligible ou aucun article', () => {
    const none = optimizeBasket(COMPARISONS, STORES_ABC, 'cheapest', { allowedStoreIds: ['zzz'] });
    expect(none).toMatchObject({ parts: [], totalCents: 0, savingsCents: 0, missingItemIds: ['i1', 'i2', 'i3', 'i4', 'i5'] });
    const empty = optimizeBasket([], STORES_ABC, 'cheapest');
    expect(empty).toMatchObject({ parts: [], totalCents: 0, savingsCents: 0, missingItemIds: [] });
    expect(Number.isNaN(Date.parse(empty.computedAt))).toBe(false);
  });

  it('égalités : départage déterministe (moins de magasins, puis ids)', () => {
    const tie = [cmp('x', [offer('b', 100), offer('a', 100)])];
    const plan = optimizeBasket(tie, [B, A].map((s) => ({ ...s, driveFeeCents: 0 })), 'cheapest');
    expect(plan.parts.map((p) => p.storeId)).toEqual(['a']);
    // même résultat quel que soit l'ordre d'entrée
    expect(optimizeBasket(tie, [A, B].map((s) => ({ ...s, driveFeeCents: 0 })), 'cheapest')).toEqual({ ...plan, computedAt: expect.any(String) });
    // égalité de total entre deux offres d'une combinaison : prix au kilo
    // (les deux magasins sont imposés par des articles exclusifs)
    const t2 = [
      cmp('y', [{ ...offer('a', 100), pricePerBaseUnitCents: 90 }, { ...offer('b', 100), pricePerBaseUnitCents: 80 }]),
      cmp('only_a', [offer('a', 10)]),
      cmp('only_b', [offer('b', 10)]),
    ];
    const p2 = optimizeBasket(t2, [A, B].map((s) => ({ ...s, driveFeeCents: 0 })), 'cheapest', { maxStores: 2 });
    expect(p2.parts.find((p) => p.storeId === 'b')?.lines.map((l) => l.itemId)).toEqual(['y', 'only_b']);
  });
});

describe('optimizeBasket — exhaustivité vérifiée par force brute', () => {
  /** Force brute : toutes les affectations article → magasin (≤ k magasins utilisés). */
  function bruteForce(comparisons: ItemComparison[], stores: Store[], k: number): { covered: number; total: number } {
    let best = { covered: -1, total: Infinity };
    const n = comparisons.length;
    const choices = comparisons.map((c) => [...c.offers, undefined]);
    const idx = new Array(n).fill(0);
    for (;;) {
      const used = new Map<string, number>();
      let covered = 0;
      let feasible = true;
      // Une affectation qui laisse de côté un article disponible n'est pas
      // forcément sous-optimale si elle réduit le nombre de magasins : on
      // laisse le critère « couverture max » trancher.
      for (let i = 0; i < n; i++) {
        const o = choices[i][idx[i]];
        if (!o) continue;
        covered++;
        used.set(o.storeId, (used.get(o.storeId) ?? 0) + o.totalCents);
      }
      if (used.size > k) feasible = false;
      if (feasible) {
        let total = 0;
        for (const [sid, sub] of used) total += sub + (stores.find((s) => s.id === sid)?.driveFeeCents ?? 0);
        if (covered > best.covered || (covered === best.covered && total < best.total)) best = { covered, total };
      }
      let j = 0;
      while (j < n && ++idx[j] >= choices[j].length) idx[j++] = 0;
      if (j === n) break;
    }
    return best;
  }

  it('100 paniers aléatoires (4 magasins, 6 articles)', () => {
    const rand = mulberry32(99);
    for (let t = 0; t < 100; t++) {
      const stores = ['s1', 's2', 's3', 's4'].map((id) => st(id, { driveFeeCents: Math.floor(rand() * 4) * 100 }));
      const comps = Array.from({ length: 6 }, (_, i) =>
        cmp(
          `i${i}`,
          stores.filter(() => rand() < 0.7).map((s) => offer(s.id, 50 + Math.floor(rand() * 500))),
        ),
      );
      for (const k of [1, 2, 3]) {
        const plan = optimizeBasket(comps, stores, 'cheapest', { maxStores: k });
        const bf = bruteForce(comps, stores, k);
        const covered = comps.length - plan.missingItemIds.length;
        expect([t, k, covered, plan.totalCents]).toEqual([t, k, bf.covered, bf.total]);
        expect(plan.parts.length).toBeLessThanOrEqual(k);
      }
    }
  });

  it(`plus de ${MAX_ENUMERATED_STORES} magasins : présélection, résultat cohérent`, () => {
    const stores = Array.from({ length: 9 }, (_, i) => st(`m${i}`, { driveFeeCents: 100 }));
    const comps = [
      cmp('a', stores.map((s, i) => offer(s.id, 100 + i * 10))),
      cmp('b', stores.slice(3).map((s, i) => offer(s.id, 300 - i * 20))),
    ];
    const plan = optimizeBasket(comps, stores, 'cheapest');
    expect(plan.missingItemIds).toEqual([]);
    expect(plan.totalCents).toBeLessThanOrEqual(Math.min(...storeTotals(comps, stores).filter((t) => t.missingItemIds.length === 0).map((t) => t.totalCents)));
    expect(optimizeBasket(comps, stores, 'cheapest')).toEqual({ ...plan, computedAt: expect.any(String) });
  });
});

describe('chaîne complète comparateur → panier', () => {
  it('sur le catalogue de test', () => {
    const index = buildCatalogIndex(PRODUCTS, PRICES, STORES, INGREDIENTS);
    const items: ShoppingListItem[] = [
      { id: 'item_pates', ingredientId: 'pates', label: 'Pâtes', quantity: 1200, unit: 'g', aisle: 'epicerie_salee', checked: false, source: 'plan', recipeIds: [] },
      { id: 'item_tomate', ingredientId: 'tomate', label: 'Tomate', quantity: 955, unit: 'g', aisle: 'fruits_legumes', checked: false, source: 'plan', recipeIds: [] },
      { id: 'item_oignon', ingredientId: 'oignon', label: 'Oignon', quantity: 3, unit: 'piece', aisle: 'fruits_legumes', checked: false, source: 'plan', recipeIds: [] },
      { id: 'item_huile', ingredientId: 'huile_olive', label: 'Huile', quantity: 23, unit: 'ml', aisle: 'condiments', checked: false, source: 'plan', recipeIds: [] },
    ];
    const comps = compareList(items, index, NOW);
    expect(comps.every((c) => c.offers.length >= 2)).toBe(true);
    const single = optimizeBasket(comps, STORES, 'single_store', { now: NOW });
    const cheapest = optimizeBasket(comps, STORES, 'cheapest', { now: NOW });
    expect(cheapest.totalCents).toBeLessThanOrEqual(single.totalCents);
    expect(single.parts).toHaveLength(1);
    expect(cheapest.parts.length).toBeLessThanOrEqual(2);
    expect(cheapest.missingItemIds).toEqual([]);
    // Lidl n'a pas d'huile : un seul magasin = Carrefour (225 + 349 + 105 + 749 = 1 428) vs Leclerc (238 + 299 + 189 + 899 = 1 625)
    expect(single.parts[0].storeId).toBe('s_carrefour');
    expect(single.totalCents).toBe(1428);
    expect(single.savingsCents).toBe(1625 - 1428);
  });
});

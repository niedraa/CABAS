/// <reference types="jest" />
/**
 * Tests ADVERSARIAUX — unités, liste de courses et comparateur de prix.
 * Données sales (quantités nulles / négatives / NaN, unités inconnues,
 * conditionnements absents), bruit flottant, déterminisme vis-à-vis de
 * l'ordre des entrées, frontières de promotion, fuites de MDD.
 */
import { INGREDIENTS_BY_ID, emptyPlan, recipe } from './fixtures';
import { buildShoppingList, roundToPackaging } from '../shoppingList';
import {
  allOffersForItem,
  buildCatalogIndex,
  compareItem,
  compareList,
  effectivePrice,
  isPreferredPrice,
  pricePerReference,
} from '../priceComparison';
import { convertBase, formatQuantity, toBase } from '../units';
import { scaleRecipeIngredients } from '../portions';
import { mulberry32, seededShuffle } from '../random';
import type { Ingredient, PlannedMeal, Price, Product, Recipe, RecipeIngredient, ShoppingListItem, Store, Unit } from '../types';

const WEEK = '2026-11-09';
const NOW = '2026-11-10T10:00:00.000Z';

function meal(id: string, recipeId: string, servings: number): PlannedMeal {
  return { id, date: WEEK, type: 'diner', recipeId, servings };
}

function ri(ingredientId: string, quantity: number, unit: Unit): RecipeIngredient {
  return { ingredientId, quantity, unit };
}

function listFor(recipes: Recipe[], servings: number[] = recipes.map((r) => r.servings), opts = {}) {
  const plan = emptyPlan(
    WEEK,
    recipes.map((r, i) => meal(`m${i}`, r.id, servings[i])),
  );
  return buildShoppingList(plan, Object.fromEntries(recipes.map((r) => [r.id, r])), INGREDIENTS_BY_ID, opts);
}

function expectAllFinite(items: ShoppingListItem[]) {
  for (const i of items) {
    expect(Number.isFinite(i.quantity)).toBe(true);
    expect(i.quantity).toBeGreaterThanOrEqual(0);
    if (i.packaging) {
      expect(Number.isFinite(i.packaging.packs)).toBe(true);
      expect(i.packaging.packs).toBeGreaterThanOrEqual(1);
    }
  }
}

// ─── Unités & liste de courses ───────────────────────────────────────────────

describe('liste de courses — quantités sales', () => {
  it('NaN / négatif / Infini dans une recette ne contaminent pas les autres', () => {
    const ok = recipe('ok', { title: 'OK', servings: 4, ingredients: [ri('riz', 300, 'g')] });
    const nan = recipe('nan', { title: 'NaN', servings: 4, ingredients: [ri('riz', NaN, 'g')] });
    const neg = recipe('neg', { title: 'Neg', servings: 4, ingredients: [ri('riz', -200, 'g')] });
    const inf = recipe('inf', { title: 'Inf', servings: 4, ingredients: [ri('riz', Infinity, 'g')] });
    const items = listFor([ok, nan, neg, inf]);
    expectAllFinite(items);
    const riz = items.find((i) => i.ingredientId === 'riz');
    expect(riz?.quantity).toBe(300);
    expect(riz?.recipeIds).toEqual(['ok', 'nan', 'neg', 'inf']);
  });

  it('portions de repas 0 / NaN / négatives → aucune quantité négative ou NaN', () => {
    const r = recipe('r', { title: 'R', servings: 4, ingredients: [ri('riz', 400, 'g'), ri('oignon', 2, 'piece')] });
    for (const s of [0, NaN, -3, Infinity]) {
      expectAllFinite(listFor([r], [s]));
    }
  });

  it('recette à 0 portion (donnée corrompue) : pas de division par zéro', () => {
    const r = recipe('r0', { title: 'R0', servings: 0, ingredients: [ri('riz', 400, 'g')] });
    expectAllFinite(listFor([r], [4]));
    expect(scaleRecipeIngredients(r, 4)[0].quantity).toBe(400);
  });

  it('mélange pièces + grammes pour un ingrédient à poids unitaire connu → un seul article', () => {
    const a = recipe('a', { title: 'A', servings: 2, ingredients: [ri('oignon', 1, 'piece')] });
    const b = recipe('b', { title: 'B', servings: 2, ingredients: [ri('oignon', 220, 'g')] });
    const items = listFor([a, b]);
    const onions = items.filter((i) => i.ingredientId === 'oignon');
    expect(onions).toHaveLength(1);
    expect(onions[0]).toMatchObject({ unit: 'piece', quantity: 3 });
  });

  it('mélange pièces + grammes sans poids unitaire → deux articles distincts, ids uniques', () => {
    const a = recipe('a', { title: 'A', servings: 2, ingredients: [ri('persil', 1, 'botte')] });
    const b = recipe('b', { title: 'B', servings: 2, ingredients: [ri('persil', 20, 'g')] });
    const items = listFor([a, b]);
    const persil = items.filter((i) => i.ingredientId === 'persil');
    expect(persil.map((i) => i.unit).sort()).toEqual(['g', 'piece']);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });

  it('bruit flottant : 0,1 l + 0,2 l de lait = 300 ml (pas 301)', () => {
    const a = recipe('a', { title: 'A', servings: 1, ingredients: [ri('lait', 0.1, 'l')] });
    const b = recipe('b', { title: 'B', servings: 1, ingredients: [ri('lait', 0.2, 'l')] });
    expect(listFor([a, b]).find((i) => i.ingredientId === 'lait')?.quantity).toBe(300);
    // Mise à l'échelle ×3 de 0,1 kg (= 300,00000000000006 en flottant brut).
    const c = recipe('c', { title: 'C', servings: 1, ingredients: [ri('riz', 0.1, 'kg')] });
    expect(listFor([c], [3]).find((i) => i.ingredientId === 'riz')?.quantity).toBe(300);
  });

  it('unité inconnue (donnée corrompue) : pas de crash, quantité finie', () => {
    const r = recipe('u', { title: 'U', servings: 2, ingredients: [ri('riz', 2, 'cuillere' as Unit)] });
    expectAllFinite(listFor([r]));
    expect(() => formatQuantity(2, 'cuillere' as Unit)).not.toThrow();
  });

  it('ingrédient piégé (« constructor ») dans une recette du planning → ignoré', () => {
    const r = recipe('t', { title: 'T', servings: 2, ingredients: [ri('constructor', 2, 'g'), ri('riz', 100, 'g')] });
    const items = listFor([r]);
    expect(items.map((i) => i.ingredientId)).toEqual(['riz']);
  });

  it('quantités énormes : pas de dépassement ni de perte de précision gênante', () => {
    const r = recipe('big', { title: 'Big', servings: 1, ingredients: [ri('riz', 5000, 'kg')] });
    const products: Product[] = [prod('p_riz', 'riz', 500, 'g')];
    const items = listFor([r], [1], { products });
    expect(items[0]).toMatchObject({ quantity: 5_000_000, packaging: { packSize: 500, packs: 10_000, packUnit: 'g' } });
  });

  it('formatQuantity ne produit jamais « NaN »', () => {
    for (const u of ['g', 'ml', 'piece', 'cs', 'gousse'] as Unit[]) {
      expect(formatQuantity(NaN, u)).not.toMatch(/NaN|Infinity/);
      expect(formatQuantity(Infinity, u)).not.toMatch(/NaN|Infinity/);
    }
  });
});

describe('conditionnements', () => {
  it('aucune contenance / contenances invalides → pas de suggestion', () => {
    expect(roundToPackaging(500, [])).toBeUndefined();
    expect(roundToPackaging(500, [0, -250, NaN, -Infinity])).toBeUndefined();
    expect(roundToPackaging(0, [500])).toBeUndefined();
    expect(roundToPackaging(NaN, [500])).toBeUndefined();
    expect(roundToPackaging(-5, [500])).toBeUndefined();
  });

  it('bruit flottant : 0,3 avec des paquets de 0,1 → 3 paquets (pas 4)', () => {
    expect(roundToPackaging(0.1 + 0.2, [0.1])).toEqual({ packSize: 0.1, packs: 3 });
    expect(roundToPackaging(1000, [333.333])).toEqual({ packSize: 333.333, packs: 4 });
  });

  it('contenance infinie ignorée', () => {
    expect(roundToPackaging(500, [Infinity, 250])).toEqual({ packSize: 250, packs: 2 });
  });

  it('égalité de surplus → le moins de paquets', () => {
    expect(roundToPackaging(1000, [250, 500, 1000])).toEqual({ packSize: 1000, packs: 1 });
  });

  it('produit en pièces, article en grammes (conversion via poids unitaire)', () => {
    const r = recipe('t', { title: 'T', servings: 1, ingredients: [ri('tomate', 500, 'g')] });
    const items = listFor([r], [1], { products: [prod('p_tom', 'tomate', 6, 'piece')] });
    // 6 tomates × 120 g = 720 g par barquette.
    expect(items[0].packaging).toEqual({ packSize: 720, packs: 1, packUnit: 'g' });
  });

  it('conversion impossible (pièce sans poids unitaire) → pas de suggestion', () => {
    expect(convertBase(3, 'piece', 'g', INGREDIENTS_BY_ID.riz)).toBeNull();
    const r = recipe('t', { title: 'T', servings: 1, ingredients: [ri('riz', 500, 'g')] });
    expect(listFor([r], [1], { products: [prod('p_riz_piece', 'riz', 1, 'piece')] })[0].packaging).toBeUndefined();
  });

  it('toBase : densité nulle ou négative → densité par défaut (1)', () => {
    const weird = { ...INGREDIENTS_BY_ID.lait, density: 0 } as Ingredient;
    expect(toBase(100, 'g', weird)).toEqual({ quantity: 100, unit: 'ml' });
    expect(toBase(100, 'g', { ...weird, density: -3 })).toEqual({ quantity: 100, unit: 'ml' });
  });
});

// ─── Comparateur de prix ─────────────────────────────────────────────────────

function store(id: string, chain: Store['chain'], o: Partial<Store> = {}): Store {
  return {
    id,
    chain,
    name: id,
    city: 'Nantes',
    pickup: 'drive',
    driveFeeCents: 0,
    deliveryFeeCents: 500,
    minOrderCents: 0,
    searchUrlTemplate: 'https://x.example/?q={query}',
    driveUrl: 'https://x.example/drive',
    ...o,
  };
}

function prod(id: string, ingredientId: string, packSize: number, packUnit: Product['packUnit'], o: Partial<Product> = {}): Product {
  return { id, ean: '0', name: id, brand: 'B', isStoreBrand: false, ingredientId, packSize, packUnit, allergens: [], ...o };
}

function price(productId: string, storeId: string, priceCents: number, o: Partial<Price> = {}): Price {
  return { productId, storeId, priceCents, updatedAt: '2026-11-01', source: 'demo', ...o };
}

function item(ingredientId: string, quantity: number, unit: ShoppingListItem['unit'] = 'g', o: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return {
    id: `item_${ingredientId}`,
    ingredientId,
    label: ingredientId,
    quantity,
    unit,
    aisle: 'autre',
    checked: false,
    source: 'plan',
    recipeIds: [],
    ...o,
  };
}

const S1 = store('s1', 'leclerc');
const S2 = store('s2', 'carrefour');
const S3 = store('s3', 'lidl');

describe('promotions — frontières', () => {
  const p = price('x', 's1', 200, { promoPriceCents: 150, promoUntil: '2026-11-10' });

  it('dernier jour de promo inclus, lendemain exclu', () => {
    expect(effectivePrice(p, '2026-11-10T00:00:00.000Z')).toEqual({ cents: 150, isPromo: true });
    expect(effectivePrice(p, '2026-11-10T23:59:59.999Z')).toEqual({ cents: 150, isPromo: true });
    expect(effectivePrice(p, '2026-11-11T00:00:00.000Z')).toEqual({ cents: 200, isPromo: false });
  });

  it('promoUntil sous forme d’horodatage → seule la date compte', () => {
    expect(effectivePrice({ ...p, promoUntil: '2026-11-10T06:00:00Z' }, '2026-11-10T20:00:00Z').isPromo).toBe(true);
  });

  it('promo égale, supérieure, négative ou NaN → prix normal', () => {
    for (const promo of [200, 250, -1, NaN]) {
      expect(effectivePrice({ ...p, promoPriceCents: promo }, NOW)).toEqual({ cents: 200, isPromo: false });
    }
  });
});

describe('comparateur — données sales', () => {
  const products = [prod('p_a', 'riz', 1000, 'g'), prod('p_b', 'riz', 500, 'g')];

  it('prix NaN / négatifs / infinis ignorés (jamais d’offre absurde)', () => {
    const prices = [
      price('p_a', 's1', NaN),
      price('p_a', 's2', -300),
      price('p_a', 's3', Infinity),
      price('p_b', 's1', 150),
    ];
    const idx = buildCatalogIndex(products, prices, [S1, S2, S3]);
    const offers = allOffersForItem(item('riz', 800), idx, NOW);
    expect(offers.map((o) => [o.storeId, o.productId, o.totalCents])).toEqual([['s1', 'p_b', 300]]);
    for (const o of offers) expect(Number.isFinite(o.totalCents) && o.totalCents >= 0).toBe(true);
  });

  it('aucun prix / aucun produit / quantité nulle → aucune offre', () => {
    const idx = buildCatalogIndex(products, [], [S1]);
    expect(compareItem(item('riz', 800), idx, NOW)).toEqual({ itemId: 'item_riz', label: 'riz', offers: [] });
    const idx2 = buildCatalogIndex(products, [price('p_a', 's1', 100)], [S1]);
    expect(compareItem(item('inconnu', 800), idx2, NOW).offers).toEqual([]);
    expect(compareItem(item('riz', 0), idx2, NOW).offers).toEqual([]);
    expect(compareItem(item('riz', NaN), idx2, NOW).offers).toEqual([]);
    expect(compareItem({ ...item('riz', 800), ingredientId: undefined }, idx2, NOW).offers).toEqual([]);
  });

  it('prix d’un magasin inconnu ignoré ; produit à contenance nulle ignoré', () => {
    const idx = buildCatalogIndex(
      [prod('p_zero', 'riz', 0, 'g'), prod('p_ok', 'riz', 1000, 'g')],
      [price('p_zero', 's1', 1), price('p_ok', 'ghost', 1), price('p_ok', 's2', 200)],
      [S1, S2],
    );
    expect(allOffersForItem(item('riz', 500), idx, NOW).map((o) => o.storeId)).toEqual(['s2']);
    expect(pricePerReference(199, 0, 'g')).toBe(199);
  });

  it('MDD : jamais proposée dans une autre enseigne, ni comme alternative', () => {
    const ps = [prod('p_nat', 'riz', 1000, 'g'), prod('p_mdd_lec', 'riz', 1000, 'g', { isStoreBrand: true, storeChains: ['leclerc'] })];
    const prices = [
      price('p_nat', 's1', 300),
      price('p_nat', 's2', 280),
      price('p_mdd_lec', 's1', 200),
      price('p_mdd_lec', 's2', 1), // fuite : MDD Leclerc « vue » chez Carrefour
      price('p_mdd_lec', 's3', 1), // idem chez Lidl
    ];
    const cmp = compareItem(item('riz', 900), buildCatalogIndex(ps, prices, [S1, S2, S3]), NOW);
    expect(cmp.offers.map((o) => [o.storeId, o.productId])).toEqual([
      ['s1', 'p_mdd_lec'],
      ['s2', 'p_nat'],
    ]);
    expect(cmp.cheaperAlternative).toMatchObject({ storeId: 's1', productId: 'p_mdd_lec', savingsCents: 100 });
  });

  it('alternative MDD : jamais d’économie nulle ou négative', () => {
    const ps = [prod('p_nat', 'riz', 1000, 'g'), prod('p_mdd', 'riz', 1000, 'g', { isStoreBrand: true, storeChains: ['leclerc'] })];
    for (const mdd of [300, 350]) {
      const cmp = compareItem(item('riz', 900), buildCatalogIndex(ps, [price('p_nat', 's1', 300), price('p_mdd', 's1', mdd)], [S1]), NOW);
      expect(cmp.cheaperAlternative).toBeUndefined();
    }
  });

  it('prix en double pour un même (produit, magasin) à la même date → choix déterministe', () => {
    const a = price('p_a', 's1', 300, { updatedAt: '2026-11-05' });
    const b = price('p_a', 's1', 250, { updatedAt: '2026-11-05' });
    const r1 = buildCatalogIndex(products, [a, b], [S1]).pricesByProduct.get('p_a')?.get('s1');
    const r2 = buildCatalogIndex(products, [b, a], [S1]).pricesByProduct.get('p_a')?.get('s1');
    expect(r1).toEqual(r2);
  });

  it('le prix le plus RÉCENT gagne même avec des fuseaux différents', () => {
    // 10:00+02:00 = 08:00Z, donc plus ancien que 09:00Z.
    const older = price('p_a', 's1', 300, { updatedAt: '2026-11-05T10:00:00+02:00' });
    const newer = price('p_a', 's1', 250, { updatedAt: '2026-11-05T09:00:00Z' });
    for (const order of [[older, newer], [newer, older]]) {
      expect(buildCatalogIndex(products, order, [S1]).pricesByProduct.get('p_a')?.get('s1')?.priceCents).toBe(250);
    }
  });

  it('départage des prix à instant égal : ordre total, antisymétrique', () => {
    const base = price('p_a', 's1', 300, { updatedAt: '2026-11-05T08:00:00Z' });
    const variants: Price[] = [
      base,
      { ...base, priceCents: 310 },
      { ...base, promoPriceCents: 250 },
      { ...base, promoPriceCents: 260 },
      { ...base, promoPriceCents: 250, promoUntil: '2026-11-20' },
      { ...base, source: 'open_prices' },
      { ...base, promoLabel: '-10 %' },
      { ...base, updatedAt: 'date illisible' },
      { ...base, updatedAt: 'autre date illisible' },
      { ...base, updatedAt: '2026-11-05T09:00:00+01:00' }, // même instant que base
    ];
    for (const a of variants) {
      for (const b of variants) {
        if (a === b) continue;
        const ab = isPreferredPrice(a, b);
        const ba = isPreferredPrice(b, a);
        if (JSON.stringify({ ...a, updatedAt: 0 }) === JSON.stringify({ ...b, updatedAt: 0 }) && Date.parse(a.updatedAt) === Date.parse(b.updatedAt)) {
          continue; // strictement équivalents
        }
        expect(ab).not.toBe(ba);
      }
    }
    // À instant égal, le prix le plus élevé est retenu (estimation prudente).
    expect(isPreferredPrice({ ...base, priceCents: 310 }, base)).toBe(true);
  });

  it('articles cochés exclus de la comparaison', () => {
    const idx = buildCatalogIndex(products, [price('p_a', 's1', 100)], [S1]);
    expect(compareList([item('riz', 100, 'g', { checked: true }), item('riz', 100, 'g', { id: 'b' })], idx, NOW).map((c) => c.itemId)).toEqual(['b']);
  });
});

describe('comparateur — déterminisme (ordre des entrées indifférent)', () => {
  it('200 catalogues aléatoires mélangés → résultat identique', () => {
    const rand = mulberry32(42);
    const chains: Store['chain'][] = ['leclerc', 'carrefour', 'auchan', 'intermarche', 'lidl', 'monoprix'];
    for (let c = 0; c < 200; c++) {
      const stores = chains.slice(0, 2 + Math.floor(rand() * 4)).map((ch, i) => store(`s${i}`, ch));
      const ingredients = ['riz', 'pates', 'oignon', 'lait', 'tomate'];
      const products: Product[] = [];
      const prices: Price[] = [];
      for (const ing of ingredients) {
        const n = 1 + Math.floor(rand() * 3);
        for (let k = 0; k < n; k++) {
          const mdd = rand() < 0.3;
          const unit = INGREDIENTS_BY_ID[ing].baseUnit;
          const p = prod(`${ing}_${k}`, ing, unit === 'piece' ? 1 + Math.floor(rand() * 6) : 250 * (1 + Math.floor(rand() * 4)), unit, mdd ? { isStoreBrand: true, storeChains: [stores[Math.floor(rand() * stores.length)].chain] } : {});
          products.push(p);
          for (const s of stores) {
            if (rand() < 0.25) continue;
            // Prix volontairement à égalité fréquente pour stresser les départages.
            const cents = 100 + 10 * Math.floor(rand() * 5);
            prices.push(price(p.id, s.id, cents, rand() < 0.3 ? { promoPriceCents: cents - 10, promoUntil: rand() < 0.5 ? '2026-11-10' : '2026-11-09' } : {}));
            if (rand() < 0.1) prices.push(price(p.id, s.id, cents + 10)); // doublon même date
          }
        }
      }
      const items = ingredients.map((ing) => item(ing, 1 + Math.floor(rand() * 1500), INGREDIENTS_BY_ID[ing].baseUnit));
      const ref = compareList(items, buildCatalogIndex(products, prices, stores, INGREDIENTS_BY_ID), NOW);
      const shuffled = compareList(
        items,
        buildCatalogIndex(seededShuffle(products, rand), seededShuffle(prices, rand), seededShuffle(stores, rand), INGREDIENTS_BY_ID),
        NOW,
      );
      expect(shuffled).toEqual(ref);
      for (const cmp of ref) {
        // Au plus une offre par magasin, triées, MDD uniquement dans leur enseigne.
        expect(new Set(cmp.offers.map((o) => o.storeId)).size).toBe(cmp.offers.length);
        for (let i = 1; i < cmp.offers.length; i++) expect(cmp.offers[i].totalCents).toBeGreaterThanOrEqual(cmp.offers[i - 1].totalCents);
        for (const o of cmp.offers) {
          const p = products.find((x) => x.id === o.productId)!;
          if (p.isStoreBrand) expect(p.storeChains).toContain(stores.find((s) => s.id === o.storeId)?.chain);
        }
        if (cmp.cheaperAlternative) expect(cmp.cheaperAlternative.savingsCents).toBeGreaterThan(0);
      }
    }
  });
});

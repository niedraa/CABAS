/**
 * Tests unitaires du générateur de catalogue sur une PETITE fixture
 * d'instantané (valeurs calculées à la main) : identifiants, contenances,
 * allergènes, prix relevés et les trois méthodes d'estimation.
 */
import { describe, expect, it } from '@jest/globals';

import { gtinCheckDigit, isValidGtin } from '../../core/openPrices';
import { ALLERGENS, type Ingredient, type Price, type StoreChain } from '../../core/types';
import {
  buildCatalog,
  cleanProductName,
  firstBrand,
  GENERALIST_CHAINS,
  loosePack,
  weightedMedian,
  type OpenDataSnapshot,
} from '../generator/buildCatalog';
import type { IngredientSource } from '../productSources';
import { stores } from '../stores';

/** Code-barres valide à partir de 12 chiffres. */
const ean = (body: string) => `${body}${gtinCheckDigit(body)}`;
const EAN = {
  patesNational: ean('300000000001'),
  patesBio: ean('300000000002'),
  patesMddLeclerc: ean('300000000003'),
  patesMddMousquetaires: ean('300000000004'),
  patesMddLidl: ean('300000000005'),
  laitNational: ean('300000000006'),
  oeufNational: ean('300000000007'),
  oeufMddCarrefour: ean('300000000008'),
  huileNational: ean('300000000009'),
};

function ingredient(id: string, overrides: Partial<Ingredient>): Ingredient {
  return {
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
    ...overrides,
  };
}

const INGREDIENTS: Ingredient[] = [
  ingredient('pates', { allergens: ['gluten'] }),
  ingredient('tomate', { aisle: 'fruits_legumes', gramsPerPiece: 120 }),
  ingredient('lait', { aisle: 'cremerie', baseUnit: 'ml', allergens: ['lait'], isAnimalProduct: true }),
  ingredient('oeuf', { aisle: 'cremerie', baseUnit: 'piece', gramsPerPiece: 55, allergens: ['oeufs'], isAnimalProduct: true }),
  ingredient('citron', { aisle: 'fruits_legumes', baseUnit: 'piece', gramsPerPiece: 120 }),
  ingredient('huile', { baseUnit: 'ml', density: 0.92 }),
];

const SOURCES: IngredientSource[] = [
  {
    ingredientId: 'pates',
    national: { ean: EAN.patesNational },
    bio: { ean: EAN.patesBio },
    mdd: [
      { ean: EAN.patesMddLeclerc, chains: ['leclerc'] },
      { ean: EAN.patesMddMousquetaires, chains: ['intermarche', 'netto'] },
      { ean: EAN.patesMddLidl, chains: ['lidl'], name: 'Spaghetti Combino', brand: 'Combino' },
    ],
  },
  { ingredientId: 'tomate', loose: { categoryTags: ['en:tomatoes', 'en:fresh-tomatoes'], pricePer: 'KILOGRAM', name: 'Tomates en vrac' } },
  { ingredientId: 'lait', national: { ean: EAN.laitNational } },
  {
    ingredientId: 'oeuf',
    national: { ean: EAN.oeufNational },
    mdd: [{ ean: EAN.oeufMddCarrefour, chains: ['carrefour'] }],
  },
  { ingredientId: 'citron', loose: { categoryTags: ['en:lemons'], pricePer: 'UNIT', name: 'citrons bio', organic: true } },
  { ingredientId: 'huile', national: { ean: EAN.huileNational } },
];

const agg = (medianCents: number, count: number, from = '2026-01-10', to = '2026-10-20') => ({ medianCents, count, from, to });

const SNAPSHOT: OpenDataSnapshot = {
  schemaVersion: 1,
  snapshotAt: '2026-11-11',
  pricesFrom: '2025-11-11',
  pricesTo: '2026-11-11',
  chainIndex: {
    leclerc: { value: 1, basis: 'measured', commonProducts: 900 },
    carrefour: { value: 1.1, basis: 'measured', commonProducts: 400 },
    auchan: { value: 1.1, basis: 'measured', commonProducts: 300 },
    intermarche: { value: 1.08, basis: 'measured', commonProducts: 250 },
    superu: { value: 1.15, basis: 'measured', commonProducts: 220 },
    lidl: { value: 0.98, basis: 'press', commonProducts: 20 },
    aldi: { value: 1.02, basis: 'press', commonProducts: 1 },
    netto: { value: 1, basis: 'press', commonProducts: 0 },
    monoprix: { value: 1.25, basis: 'measured', commonProducts: 210 },
    franprix: { value: 1.4, basis: 'measured', commonProducts: 205 },
  },
  offProducts: {
    [EAN.patesNational]: { name: 'SPAGHETTI N°5', brands: 'Panzani', quantity: '500 g', size: 500, unit: 'g', nutriScore: 'A', allergens: ['gluten'] },
    [EAN.patesBio]: { name: 'Spaghetti bio', brands: 'Lustucru', size: 500, unit: 'g', allergens: ['gluten'], organic: true },
    [EAN.patesMddLeclerc]: { name: 'Spaghetti', brands: 'Eco+, Marque Repère', size: 500, unit: 'g', allergens: ['gluten'] },
    [EAN.patesMddMousquetaires]: { name: 'Spaghetti', brands: 'Top Budget', size: 1000, unit: 'g', allergens: [] },
    [EAN.patesMddLidl]: { name: 'Spaghetti', size: 250, unit: 'g', allergens: ['gluten'] },
    [EAN.laitNational]: {
      name: 'Lait demi-écrémé',
      brands: "C'est qui le Patron ?!",
      size: 1000,
      unit: 'ml',
      allergens: ['soja', 'lait'],
      allergensUnknown: ['fr:Lait1'],
    },
    [EAN.oeufNational]: { name: 'Œufs frais x12', brands: 'Loué', quantity: '12 œufs', size: 12, unit: 'piece', allergens: ['oeufs'] },
    [EAN.oeufMddCarrefour]: { name: 'Œufs x6', brands: 'Carrefour', size: 6, unit: 'piece', allergens: ['oeufs'] },
    [EAN.huileNational]: { name: 'Huile de tournesol', brands: 'Lesieur', quantity: '920 g', size: 920, unit: 'g', allergens: [] },
  },
  aggregates: {
    [`ean:${EAN.patesNational}`]: { leclerc: agg(100, 3), carrefour: agg(121, 1, '2026-05-01', '2026-11-02') },
    [`ean:${EAN.patesMddLeclerc}`]: { leclerc: agg(60, 2) },
    // La MDD Mousquetaires relevée chez Intermarché ET (par erreur de lieu) chez Auchan : Auchan est ignoré.
    [`ean:${EAN.patesMddMousquetaires}`]: { intermarche: agg(130, 1), auchan: agg(10, 9) },
    [`ean:${EAN.laitNational}`]: { lidl: agg(95, 1) },
    [`ean:${EAN.oeufNational}`]: { carrefour: agg(330, 2) },
    [`ean:${EAN.huileNational}`]: { leclerc: agg(500, 5) },
    'cat:en:tomatoes:KILOGRAM': { leclerc: agg(300, 4) },
    'cat:en:fresh-tomatoes:KILOGRAM': { leclerc: agg(999, 1), carrefour: agg(350, 2) },
    'cat:en:lemons:UNIT': { leclerc: agg(40, 10) },
    'cat:en:lemons:UNIT:organic': { monoprix: agg(89, 3) },
  },
};

const built = buildCatalog(SOURCES, SNAPSHOT, INGREDIENTS, stores, ALLERGENS);
const product = (id: string) => built.products.find((p) => p.id === id);
const pricesOf = (id: string) => built.prices.filter((p) => p.productId === id);
const priceAt = (id: string, chain: StoreChain) => built.prices.find((p) => p.productId === id && p.storeId === chain);
const centsByChain = (id: string) => Object.fromEntries(pricesOf(id).map((p) => [p.storeId, p.priceCents]));

describe('aides', () => {
  it('weightedMedian équivaut à la médiane des relevés', () => {
    expect(weightedMedian([{ value: 100, weight: 3 }, { value: 110, weight: 1 }])).toBe(100);
    expect(weightedMedian([{ value: 1, weight: 1 }, { value: 3, weight: 1 }])).toBe(2);
    expect(weightedMedian([{ value: 5, weight: 2 }, { value: 1, weight: 1 }, { value: 9, weight: 1 }])).toBe(5);
    expect(weightedMedian([{ value: 1, weight: 2 }, { value: 9, weight: 2 }])).toBe(5);
    expect(Number.isNaN(weightedMedian([]))).toBe(true);
  });

  it('nettoie noms et marques Open Food Facts', () => {
    expect(cleanProductName('SPAGHETTI N°5')).toBe('Spaghetti n°5');
    expect(cleanProductName('  lait   demi-écrémé ')).toBe('Lait demi-écrémé');
    expect(cleanProductName('AOP')).toBe('AOP');
    expect(cleanProductName('HERTA Lardons fumés - 2x75g', 'Herta')).toBe('Lardons fumés - 2x75g');
    expect(cleanProductName('LACTEL LAIT BIO 1/2 ÉCRÉMÉ', 'Lactel')).toBe('Lait bio 1/2 écrémé');
    expect(cleanProductName('Carrefour', 'Carrefour')).toBe('Carrefour');
    expect(cleanProductName('Herta', 'Herta')).toBe('Herta');
    expect(cleanProductName('Hertalogique', 'Herta')).toBe('Hertalogique');
    expect(firstBrand('Bio Village, Marque Repère')).toBe('Bio Village');
    expect(firstBrand(' ')).toBeUndefined();
    expect(firstBrand(undefined)).toBeUndefined();
  });

  it('dimensionne le vrac (pièce moyenne ≥ 100 g, pièce, conversions)', () => {
    const tomate = INGREDIENTS[1];
    const citron = INGREDIENTS[4];
    expect(loosePack({ categoryTags: ['x'], pricePer: 'KILOGRAM', name: 'x' }, tomate)).toEqual({ size: 120, factor: 0.12 });
    expect(loosePack({ categoryTags: ['x'], pricePer: 'KILOGRAM', name: 'x' }, { ...tomate, gramsPerPiece: 5 })).toEqual({
      size: 100,
      factor: 0.1,
    });
    expect(loosePack({ categoryTags: ['x'], pricePer: 'KILOGRAM', name: 'x', packSize: 500 }, tomate)).toEqual({ size: 500, factor: 0.5 });
    expect(loosePack({ categoryTags: ['x'], pricePer: 'UNIT', name: 'x' }, citron)).toEqual({ size: 1, factor: 1 });
    expect(loosePack({ categoryTags: ['x'], pricePer: 'KILOGRAM', name: 'x' }, citron)).toEqual({ size: 1, factor: 0.12 });
    expect(loosePack({ categoryTags: ['x'], pricePer: 'UNIT', name: 'x' }, tomate)).toEqual({ size: 120, factor: 1 });
    expect(loosePack({ categoryTags: ['x'], pricePer: 'UNIT', name: 'x' }, INGREDIENTS[0])).toBeNull();
    expect(loosePack({ categoryTags: ['x'], pricePer: 'KILOGRAM', name: 'x' }, INGREDIENTS[2])).toBeNull();
  });
});

describe('buildCatalog — produits', () => {
  it('suit les règles d’identifiants, dans l’ordre des sources', () => {
    expect(built.products.map((p) => p.id)).toEqual([
      'prd_pates',
      // prd_pates_bio : aucun prix relevé ni estimable → écarté
      'prd_pates_mdd_leclerc',
      'prd_pates_mdd_intermarche',
      'prd_pates_mdd_lidl',
      'prd_tomate_vrac',
      'prd_lait',
      'prd_oeuf',
      'prd_oeuf_mdd_carrefour',
      'prd_citron_vrac',
      'prd_huile',
    ]);
    expect(built.warnings).toContain('prd_pates_bio : écarté, aucun prix relevé ni estimable');
  });

  it('reprend la fiche Open Food Facts (nom, marque, contenance, Nutri-Score)', () => {
    expect(product('prd_pates')).toEqual({
      id: 'prd_pates',
      ean: EAN.patesNational,
      name: 'Spaghetti n°5',
      brand: 'Panzani',
      isStoreBrand: false,
      ingredientId: 'pates',
      packSize: 500,
      packUnit: 'g',
      nutriScore: 'A',
      allergens: ['gluten'],
    });
    expect(product('prd_pates_mdd_leclerc')).toMatchObject({ brand: 'Eco+', isStoreBrand: true, storeChains: ['leclerc'] });
    // Surcharges de la source.
    expect(product('prd_pates_mdd_lidl')).toMatchObject({ name: 'Spaghetti Combino', brand: 'Combino', packSize: 250 });
    // Contenance convertie dans l'unité de base de l'ingrédient (920 g d'huile → 1 l).
    expect(product('prd_huile')).toMatchObject({ packSize: 1000, packUnit: 'ml' });
    expect(product('prd_oeuf')).toMatchObject({ packSize: 12, packUnit: 'piece' });
  });

  it('laisse la source corriger le label bio d’Open Food Facts', () => {
    const result = buildCatalog(
      [{ ingredientId: 'pates', mdd: [{ ean: EAN.patesMddLeclerc, chains: ['leclerc'], organic: true }] }],
      SNAPSHOT,
      INGREDIENTS,
      stores,
      ALLERGENS,
    );
    expect(result.products[0]).toMatchObject({ id: 'prd_pates_mdd_leclerc', organic: true });
    expect(product('prd_pates_mdd_leclerc')?.organic).toBeUndefined();
    expect(built.warnings).toContain(
      `prd_pates_mdd_leclerc (${EAN.patesMddLeclerc}) : marques OFF « Eco+, Marque Repère », « Eco+ » retenue — préciser « brand » si besoin`,
    );
  });

  it('une MDD multi-enseignes prend l’id de sa PREMIÈRE enseigne', () => {
    expect(product('prd_pates_mdd_intermarche')).toMatchObject({ storeChains: ['intermarche', 'netto'], brand: 'Top Budget' });
  });

  it('unit allergènes de l’ingrédient et d’Open Food Facts (jamais moins que l’ingrédient)', () => {
    expect(product('prd_lait')?.allergens).toEqual(['soja', 'lait']);
    // OFF sans gluten pour la MDD Mousquetaires : le gluten de l'ingrédient reste.
    expect(product('prd_pates_mdd_intermarche')?.allergens).toEqual(['gluten']);
    expect(built.warnings).toContain(`prd_lait (${EAN.laitNational}) : allergène OFF à relire « fr:Lait1 »`);
    expect(built.warnings).toContain(`prd_lait (${EAN.laitNational}) : allergènes OFF absents de l'ingrédient ajoutés : soja`);
  });

  it('crée le vrac sans code-barres, avec sa catégorie et son conditionnement', () => {
    expect(product('prd_tomate_vrac')).toEqual({
      id: 'prd_tomate_vrac',
      offCategoryTag: 'en:tomatoes',
      name: 'Tomates en vrac',
      brand: 'Vrac',
      isStoreBrand: false,
      ingredientId: 'tomate',
      packSize: 120,
      packUnit: 'g',
      allergens: [],
    });
    expect(product('prd_citron_vrac')).toMatchObject({ name: 'Citrons bio', organic: true, packSize: 1, packUnit: 'piece' });
    for (const p of built.products) expect(p.ean === undefined).toBe(p.offCategoryTag !== undefined);
  });
});

describe('buildCatalog — prix', () => {
  it('reprend les prix relevés avec leur provenance', () => {
    expect(priceAt('prd_pates', 'carrefour')).toEqual({
      productId: 'prd_pates',
      storeId: 'carrefour',
      priceCents: 121,
      updatedAt: '2026-11-02',
      source: 'open_prices',
      observationCount: 1,
      observedFrom: '2026-05-01',
    });
  });

  it('estime une marque nationale dans les généralistes seulement (chain_index)', () => {
    // Équivalent Leclerc : médiane pondérée de 100 (×3) et 121 / 1,1 = 110 (×1) → 100.
    expect(centsByChain('prd_pates')).toEqual({
      leclerc: 100,
      carrefour: 121,
      auchan: 110,
      intermarche: 108,
      superu: 115,
      monoprix: 125,
      franprix: 140,
    });
    expect(priceAt('prd_pates', 'auchan')).toEqual({
      productId: 'prd_pates',
      storeId: 'auchan',
      priceCents: 110,
      updatedAt: '2026-11-11',
      source: 'estimate',
      estimateMethod: 'chain_index',
      estimateBasisCount: 4,
    });
    // Relevé chez Lidl : c'est un vrai prix ; estimé chez les généralistes, jamais chez Aldi / Netto.
    expect(centsByChain('prd_lait')).toEqual({
      leclerc: 97,
      carrefour: 107,
      auchan: 107,
      intermarche: 105,
      superu: 111,
      lidl: 95,
      monoprix: 121,
      franprix: 136,
    });
    // Une marque nationale n'est jamais estimée chez un discounter (seule une MDD qui y est vendue peut l'être).
    for (const p of built.prices) {
      if (p.estimateMethod !== 'chain_index') continue;
      if (product(p.productId)?.isStoreBrand) expect(product(p.productId)?.storeChains).toContain(p.storeId);
      else expect(GENERALIST_CHAINS).toContain(p.storeId);
    }
  });

  it('estime une MDD multi-enseignes par SON prix relevé dans une de ses enseignes (chain_index)', () => {
    // Relevée 130 c chez Intermarché (indice 1,08) → 120,4 c équivalent Leclerc → × 1,00 chez Netto.
    expect(centsByChain('prd_pates_mdd_intermarche')).toEqual({ intermarche: 130, netto: 120 });
    expect(priceAt('prd_pates_mdd_intermarche', 'netto')).toEqual({
      productId: 'prd_pates_mdd_intermarche',
      storeId: 'netto',
      priceCents: 120,
      updatedAt: '2026-11-11',
      source: 'estimate',
      estimateMethod: 'chain_index',
      estimateBasisCount: 1,
    });
  });

  it('suit le prix propre d’une MDD multi-enseignes, même loin des autres MDD de l’ingrédient', () => {
    // MDD Mousquetaires à 400 c / kg (les autres MDD de pâtes sont à ~120 c / kg) :
    // Netto suit son propre prix (400 / 1,08 = 370), pas la médiane des MDD.
    const result = buildCatalog(
      SOURCES,
      {
        ...SNAPSHOT,
        aggregates: { ...SNAPSHOT.aggregates, [`ean:${EAN.patesMddMousquetaires}`]: { intermarche: agg(400, 2) } },
      },
      INGREDIENTS,
      stores,
      ALLERGENS,
    );
    const netto = result.prices.find((p) => p.productId === 'prd_pates_mdd_intermarche' && p.storeId === 'netto');
    expect(netto).toMatchObject({ priceCents: 370, source: 'estimate', estimateMethod: 'chain_index', estimateBasisCount: 2 });
  });

  it('estime une MDD sans aucun relevé par le prix unitaire des MDD relevées (mdd_ratio)', () => {
    // MDD relevées : 60 c / 500 g chez Leclerc (×2) et 130 c / 1 kg chez Intermarché (×1, indice 1,08)
    // → 0,12 c/g équivalent Leclerc.
    expect(centsByChain('prd_pates_mdd_lidl')).toEqual({ lidl: 29 }); // 0,12 × 0,98 × 250
    expect(priceAt('prd_pates_mdd_lidl', 'lidl')).toMatchObject({ source: 'estimate', estimateMethod: 'mdd_ratio', estimateBasisCount: 3 });
    expect(centsByChain('prd_pates_mdd_leclerc')).toEqual({ leclerc: 60 });
  });

  it('estime une MDD sans MDD relevée par la marque nationale × 0,75', () => {
    // Œufs Loué : 330 c / 12 chez Carrefour (indice 1,1) → 25 c l'œuf équivalent Leclerc.
    expect(priceAt('prd_oeuf_mdd_carrefour', 'carrefour')).toMatchObject({
      priceCents: 124, // 25 × 0,75 × 1,1 × 6 = 123,75
      source: 'estimate',
      estimateMethod: 'mdd_ratio',
      estimateBasisCount: 2,
    });
    expect(pricesOf('prd_oeuf_mdd_carrefour')).toHaveLength(1);
  });

  it('prix le vrac par catégorie (ordre de préférence) et l’estime partout (category_median)', () => {
    // Leclerc : en:tomatoes (3 €/kg) ; Carrefour : en:fresh-tomatoes (3,50 €/kg) ; 120 g par pièce.
    expect(centsByChain('prd_tomate_vrac')).toEqual({
      leclerc: 36,
      carrefour: 42,
      auchan: 40,
      intermarche: 39,
      superu: 41,
      lidl: 35,
      aldi: 37,
      netto: 36,
      monoprix: 45,
      franprix: 50,
    });
    expect(priceAt('prd_tomate_vrac', 'lidl')).toMatchObject({ estimateMethod: 'category_median', estimateBasisCount: 6 });
    // Vrac bio : seuls les relevés bio comptent (89 c chez Monoprix, indice 1,25 → 71,2 c).
    expect(centsByChain('prd_citron_vrac')).toMatchObject({ leclerc: 71, monoprix: 89, franprix: 100, lidl: 70 });
  });

  it('ignore un relevé de MDD hors de ses enseignes, et ne crée jamais de promo', () => {
    expect(priceAt('prd_pates_mdd_intermarche', 'auchan')).toBeUndefined();
    for (const p of built.prices as Price[]) {
      expect(p.promoPriceCents).toBeUndefined();
      expect(p.promoLabel).toBeUndefined();
      expect(Number.isInteger(p.priceCents)).toBe(true);
      expect(p.priceCents).toBeGreaterThan(0);
    }
  });
});

describe('buildCatalog — méta', () => {
  it('décrit l’instantané, la couverture et les sources', () => {
    const { meta, prices } = built;
    expect(meta.snapshotAt).toBe('2026-11-11');
    expect(meta.pricesFrom).toBe('2025-11-11');
    expect(meta.observedPrices).toBe(prices.filter((p) => p.source === 'open_prices').length);
    expect(meta.estimatedPrices).toBe(prices.filter((p) => p.source === 'estimate').length);
    expect(meta.observedPrices + meta.estimatedPrices).toBe(prices.length);
    expect(Object.keys(meta.coverage)).toEqual(stores.map((s) => s.chain));
    expect(meta.coverage.netto).toEqual({ observed: 0, estimated: 3 });
    expect(meta.chainIndex.lidl).toEqual({ value: 0.98, basis: 'press', commonProducts: 20 });
    expect(meta.sources.map((s) => s.name)).toEqual(['Open Food Facts', 'Open Prices', 'OpenStreetMap']);
  });

  it('est déterministe', () => {
    expect(buildCatalog(SOURCES, SNAPSHOT, INGREDIENTS, stores, ALLERGENS)).toEqual(built);
  });
});

describe('buildCatalog — erreurs de source', () => {
  const run = (sources: IngredientSource[], snapshot: OpenDataSnapshot = SNAPSHOT) =>
    () => buildCatalog(sources, snapshot, INGREDIENTS, stores, ALLERGENS);

  it('refuse un ingrédient inconnu ou en double, ou sans produit', () => {
    expect(run([{ ingredientId: 'inconnu', national: { ean: EAN.patesNational } }])).toThrow(/ingrédient inconnu/);
    expect(run([SOURCES[0], SOURCES[0]])).toThrow(/en double/);
    expect(run([{ ingredientId: 'pates' }])).toThrow(/aucun produit/);
  });

  it('refuse un code-barres invalide, poids variable ou réutilisé', () => {
    expect(run([{ ingredientId: 'pates', national: { ean: '3000000000010' } }])).toThrow(/code-barres invalide/);
    const weighed = ean('212345012345');
    expect(isValidGtin(weighed)).toBe(false);
    expect(run([{ ingredientId: 'pates', national: { ean: weighed } }])).toThrow(/code-barres invalide/);
    expect(
      run([{ ingredientId: 'pates', national: { ean: EAN.patesNational }, bio: { ean: EAN.patesNational } }]),
    ).toThrow(/déjà utilisé/);
  });

  it('refuse deux MDD de même première enseigne (ids en collision) et une MDD sans enseigne', () => {
    expect(
      run([
        {
          ingredientId: 'pates',
          mdd: [
            { ean: EAN.patesMddLeclerc, chains: ['leclerc'] },
            { ean: EAN.patesMddLidl, chains: ['leclerc', 'lidl'] },
          ],
        },
      ]),
    ).toThrow(/en double/);
    expect(run([{ ingredientId: 'pates', mdd: [{ ean: EAN.patesMddLeclerc, chains: [] }] }])).toThrow(/sans enseigne/);
  });

  it('refuse un instantané sans indice pour une enseigne', () => {
    const partial: Partial<OpenDataSnapshot['chainIndex']> = { ...SNAPSHOT.chainIndex };
    delete partial.netto;
    expect(run(SOURCES, { ...SNAPSHOT, chainIndex: partial as OpenDataSnapshot['chainIndex'] })).toThrow(/Indice de prix manquant/);
  });

  it('écarte (avec un avertissement) un produit sans fiche ni nom', () => {
    const missing = ean('300000000099');
    const result = buildCatalog(
      [{ ingredientId: 'pates', national: { ean: missing } }, { ingredientId: 'huile', national: { ean: EAN.huileNational } }],
      SNAPSHOT,
      INGREDIENTS,
      stores,
      ALLERGENS,
    );
    expect(result.products.map((p) => p.id)).toEqual(['prd_huile']);
    expect(result.warnings.some((w) => w.includes(missing) && w.includes('aucun nom'))).toBe(true);
  });
});

import type { CatalogMeta, Ingredient, Price, Product, ShoppingListItem, Store } from '@/core';
import { catalogMeta as embeddedMeta } from '@/data';

import { createBasketService, withoutAllergenOffers } from '../basket';
import {
  buildCatalogSnapshot,
  catalogIndexWithoutAllergens,
  createRemoteCatalogRepository,
  getCatalogMeta,
  getCatalogSnapshot,
  localCatalogRepository,
  type CatalogData,
  type CatalogRepository,
} from '../catalog';

// ─── Catalogue miniature (indépendant du contenu de src/data) ────────────────

const INGREDIENTS: Ingredient[] = [
  {
    id: 'lentilles',
    name: 'Lentilles corail',
    aisle: 'epicerie_salee',
    allergens: [],
    isMeat: false,
    isPork: false,
    isFish: false,
    isSeafood: false,
    isAnimalProduct: false,
    baseUnit: 'g',
  },
];

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
const STORES: Store[] = [store('leclerc'), store('carrefour'), store('lidl')];

const product = (id: string, allergens: Product['allergens'] = []): Product => ({
  id,
  ean: '3111952035624',
  name: id,
  brand: 'Marque',
  isStoreBrand: false,
  ingredientId: 'lentilles',
  packSize: 500,
  packUnit: 'g',
  allergens,
});
// Les lentilles « Saint Eloi » déclarent du gluten (Open Food Facts) : jamais proposées à un profil sans gluten.
const PRODUCTS: Product[] = [product('prd_lentilles'), product('prd_lentilles_gluten', ['gluten'])];

const price = (productId: string, storeId: string, priceCents: number, extra: Partial<Price> = {}): Price => ({
  productId,
  storeId,
  priceCents,
  updatedAt: '2026-11-03T12:00:00.000Z',
  source: 'open_prices',
  observationCount: 3,
  observedFrom: '2026-06-01',
  ...extra,
});
const PRICES: Price[] = [
  price('prd_lentilles', 'leclerc', 199),
  price('prd_lentilles', 'carrefour', 219),
  price('prd_lentilles_gluten', 'leclerc', 149),
  price('prd_lentilles_gluten', 'lidl', 139, {
    source: 'estimate',
    observationCount: undefined,
    observedFrom: undefined,
    estimateMethod: 'chain_index',
    estimateBasisCount: 4,
    updatedAt: '2026-11-11T00:00:00.000Z',
  }),
];

const META: CatalogMeta = {
  snapshotAt: '2026-11-11',
  pricesFrom: '2025-11-11',
  pricesTo: '2026-11-11',
  observedPrices: 3,
  estimatedPrices: 1,
  chainIndex: embeddedMeta.chainIndex,
  coverage: embeddedMeta.coverage,
  sources: [{ name: 'Open Prices', url: 'https://prices.openfoodfacts.org', license: 'ODbL' }],
};

const DATA: CatalogData = { recipes: [], ingredients: INGREDIENTS, stores: STORES, products: PRODUCTS, prices: PRICES };

const ITEM: ShoppingListItem = {
  id: 'lentilles',
  ingredientId: 'lentilles',
  label: 'Lentilles corail',
  quantity: 400,
  unit: 'g',
  aisle: 'epicerie_salee',
  checked: false,
  source: 'plan',
  recipeIds: [],
};

function fakeSource(meta: () => Promise<CatalogMeta | null>): CatalogRepository {
  return {
    kind: 'remote',
    getRecipes: async () => [],
    getIngredients: async () => INGREDIENTS,
    getStores: async () => STORES,
    getProducts: async () => PRODUCTS,
    getPrices: async () => PRICES,
    getCatalogMeta: meta,
  };
}

describe('catalogue : description de l\'instantané (catalogMeta)', () => {
  it('local : instantané embarqué (src/data/meta.ts)', async () => {
    expect(await localCatalogRepository.getCatalogMeta()).toBe(embeddedMeta);
    expect(getCatalogMeta()).toBe(embeddedMeta);
    expect(getCatalogSnapshot().meta).toBe(embeddedMeta);
  });

  it('distant : base d\'abord, sinon instantané embarqué (absente ou en erreur)', async () => {
    expect(await createRemoteCatalogRepository(fakeSource(async () => META)).getCatalogMeta()).toBe(META);
    expect(await createRemoteCatalogRepository(fakeSource(async () => null)).getCatalogMeta()).toBe(embeddedMeta);
    const failing = createRemoteCatalogRepository(
      fakeSource(async () => {
        throw new Error('réseau');
      }),
    );
    expect(await failing.getCatalogMeta()).toBe(embeddedMeta);
  });

  it('instantané : meta fournie, sinon embarquée (ancien cache disque sans meta)', () => {
    expect(buildCatalogSnapshot({ ...DATA, meta: META }, 'remote').meta).toBe(META);
    expect(buildCatalogSnapshot(DATA, 'cache').meta).toBe(embeddedMeta);
  });
});

describe('allergènes : un produit contenant un allergène déclaré n\'est jamais proposé', () => {
  const snapshot = buildCatalogSnapshot(DATA, 'local');

  it('index filtré (mémoïsé), index complet sans allergie', () => {
    const safe = catalogIndexWithoutAllergens(snapshot, ['gluten']);
    expect(safe.productsByIngredient.get('lentilles')?.map((p) => p.id)).toEqual(['prd_lentilles']);
    expect(catalogIndexWithoutAllergens(snapshot, ['gluten'])).toBe(safe);
    expect(catalogIndexWithoutAllergens(snapshot, [])).toBe(snapshot.index);
    expect(catalogIndexWithoutAllergens(snapshot, undefined)).toBe(snapshot.index);
  });

  it('panier local : offres, alternative et choix explicite sans le produit à risque', async () => {
    const service = createBasketService({ remote: null, getCatalog: () => snapshot });
    const req = {
      items: [ITEM],
      mode: 'single_store' as const,
      storeIds: [],
      channel: 'drive' as const,
      entitlement: 'premium' as const,
    };
    const open = await service.computeBasket(req);
    expect(open.comparisons[0].best?.productId).toBe('prd_lentilles_gluten');

    const safe = await service.computeBasket({
      ...req,
      allergens: ['gluten'],
      productChoices: { lentilles: 'prd_lentilles_gluten' },
    });
    const ids = safe.comparisons.flatMap((c) => c.offers.map((o) => o.productId));
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).not.toContain('prd_lentilles_gluten');
    expect(safe.comparisons[0].cheaperAlternative?.productId).not.toBe('prd_lentilles_gluten');
    expect(JSON.stringify(safe.plan)).not.toContain('prd_lentilles_gluten');
  });

  it('réponse distante : offres à risque retirées ; panier à risque → recalcul local', async () => {
    const remoteOffer = (productId: string, storeId: string, totalCents: number) => ({
      storeId,
      productId,
      packs: 1,
      unitPriceCents: totalCents,
      totalCents,
      pricePerBaseUnitCents: totalCents * 2,
      referenceUnit: 'kg' as const,
      isStoreBrand: false,
      isPromo: false,
    });
    const comparisons = [
      {
        itemId: 'lentilles',
        label: 'Lentilles',
        offers: [remoteOffer('prd_lentilles_gluten', 'leclerc', 149), remoteOffer('prd_lentilles', 'leclerc', 199)],
        best: remoteOffer('prd_lentilles_gluten', 'leclerc', 149),
      },
    ];
    expect(withoutAllergenOffers(comparisons, ['gluten'], snapshot)[0].offers.map((o) => o.productId)).toEqual(['prd_lentilles']);
    const unsafePlan = {
      mode: 'single_store',
      parts: [
        {
          storeId: 'leclerc',
          lines: [{ itemId: 'lentilles', label: 'Lentilles', productId: 'prd_lentilles_gluten', packs: 1, totalCents: 149 }],
          subtotalCents: 149,
          feesCents: 0,
        },
      ],
      totalCents: 149,
      savingsCents: 0,
      missingItemIds: [],
      computedAt: '2026-11-11T00:00:00.000Z',
    };
    const service = createBasketService({
      remote: async () => ({ comparisons, plan: unsafePlan, meta: { mode: 'single_store' } }),
      getCatalog: () => snapshot,
    });
    const res = await service.computeBasket({
      items: [ITEM],
      mode: 'single_store',
      storeIds: [],
      channel: 'drive',
      entitlement: 'free',
      allergens: ['gluten'],
    });
    expect(res.source).toBe('fallback');
    expect(JSON.stringify(res)).not.toContain('prd_lentilles_gluten');
  });
});

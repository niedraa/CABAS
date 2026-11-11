import type { UserProfile } from '@/core';
import { DEFAULT_MEAL_SLOTS } from '@/core';

import { pgArray, profileToRow, rowToCatalogMeta, rowToPrice, rowToProduct, rowToProfile, rowToStore } from '../mappers';

const base: UserProfile = {
  id: 'u1',
  displayName: 'Camille',
  household: { adults: 2, children: 1 },
  diets: ['halal'],
  allergens: ['arachides'],
  dislikedIngredientIds: [],
  favoriteCuisines: [],
  weeklyBudgetCents: 12000,
  maxCookTimeWeekdayMin: 30,
  maxCookTimeWeekendMin: 60,
  equipment: ['four'],
  preferredStoreIds: ['leclerc'],
  mealSlots: DEFAULT_MEAL_SLOTS,
  healthDataConsentAt: '2026-11-01T10:00:00.000Z',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
};

describe('mappers profil', () => {
  it('aller-retour profil ⇄ ligne', () => {
    const row = profileToRow(base, '2026-11-01T10:00:00.000Z');
    expect(row).toMatchObject({ allergens: ['arachides'], diets: ['halal'], health_data_consent_at: base.healthDataConsentAt });
    const back = rowToProfile({ ...row, created_at: base.createdAt, updated_at: base.updatedAt });
    expect(back).toEqual(base);
  });

  it('sans consentement, allergies et régimes partent vides (contrainte de la base)', () => {
    const row = profileToRow({ ...base, healthDataConsentAt: null }, null);
    expect(row).toMatchObject({ allergens: [], diets: [], health_data_consent_at: null });
  });
});

describe('mappers catalogue (données ouvertes)', () => {
  it('produit vrac : sans code-barres, catégorie Open Food Facts', () => {
    const p = rowToProduct({
      id: 'prd_tomate_vrac',
      ean: null,
      off_category_tag: 'en:tomatoes',
      name: 'Tomates, en vrac',
      brand: '',
      is_store_brand: false,
      store_chains: [],
      ingredient_id: 'tomate',
      pack_size: '1000.000',
      pack_unit: 'g',
      allergens: [],
    });
    expect(p).toEqual({
      id: 'prd_tomate_vrac',
      offCategoryTag: 'en:tomatoes',
      name: 'Tomates, en vrac',
      brand: '',
      isStoreBrand: false,
      ingredientId: 'tomate',
      packSize: 1000,
      packUnit: 'g',
      allergens: [],
    });
    expect('ean' in p).toBe(false);
  });

  it('MDD : store_chains (référence), ancienne colonne store_chain, littéral Postgres', () => {
    const base = { id: 'x', ean: '3250390314271', is_store_brand: true, ingredient_id: 'pates', pack_size: 500, pack_unit: 'g' };
    expect(rowToProduct({ ...base, store_chains: ['intermarche', 'netto'], store_chain: 'intermarche' }).storeChains).toEqual([
      'intermarche',
      'netto',
    ]);
    expect(rowToProduct({ ...base, store_chain: 'lidl' }).storeChains).toEqual(['lidl']);
    expect(rowToProduct({ ...base, store_chains: '{intermarche,netto,pirate}' }).storeChains).toEqual(['intermarche', 'netto']);
    expect(pgArray('{}')).toEqual([]);
    expect(pgArray(null)).toEqual([]);
  });

  it('prix : provenance relevé / estimation', () => {
    const observed = rowToPrice({
      product_id: 'p',
      store_id: 'leclerc',
      price_cents: '189',
      source: 'open_prices',
      updated_at: '2026-11-03T12:00:00+00:00',
      observation_count: 14,
      observed_from: '2026-01-04',
      estimate_method: null,
      estimate_basis_count: null,
    });
    expect(observed).toEqual({
      productId: 'p',
      storeId: 'leclerc',
      priceCents: 189,
      updatedAt: '2026-11-03T12:00:00.000Z',
      source: 'open_prices',
      observationCount: 14,
      observedFrom: '2026-01-04',
    });
    const estimated = rowToPrice({
      product_id: 'p',
      store_id: 'aldi',
      price_cents: 199,
      source: 'estimate',
      price_updated_at: '2026-11-11',
      estimate_method: 'mdd_ratio',
      estimate_basis_count: 6,
    });
    expect([estimated.source, estimated.estimateMethod, estimated.estimateBasisCount]).toEqual(['estimate', 'mdd_ratio', 6]);
    expect(rowToPrice({ product_id: 'p', store_id: 's', price_cents: 1, estimate_method: 'magie' }).estimateMethod).toBeUndefined();
  });

  it('magasin : mode de retrait, livraison absente', () => {
    expect(rowToStore({ id: 'lidl', chain: 'lidl', name: 'Lidl', pickup: 'none', delivery_fee_cents: null })).toMatchObject({
      pickup: 'none',
      deliveryFeeCents: null,
    });
    expect(rowToStore({ id: 'x', chain: 'leclerc', pickup: 'inconnu' }).pickup).toBe('drive');
  });

  it('description de l\'instantané : validée, sources filtrées', () => {
    expect(rowToCatalogMeta(null)).toBeNull();
    expect(rowToCatalogMeta({ meta: { snapshotAt: '2026-11-11' } })).toBeNull();
    const meta = rowToCatalogMeta({
      meta: {
        snapshotAt: '2026-11-11',
        pricesFrom: '2025-11-11',
        pricesTo: '2026-11-11',
        observedPrices: 10,
        estimatedPrices: 5,
        chainIndex: { leclerc: { value: 1, basis: 'measured', commonProducts: 300 } },
        coverage: {},
        sources: [{ name: 'Open Prices', url: 'https://prices.openfoodfacts.org', license: 'ODbL' }, 'x'],
      },
    });
    expect(meta?.sources).toEqual([{ name: 'Open Prices', url: 'https://prices.openfoodfacts.org', license: 'ODbL' }]);
    expect(meta?.observedPrices).toBe(10);
  });
});

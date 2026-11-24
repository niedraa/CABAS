import { jest } from '@jest/globals';
/**
 * Données réelles Open Prices : qualité et cohérence avec le catalogue.
 */
import { describe, expect, it } from '@jest/globals';

import { catalog, ingredientsById, openPricesPrices, openPricesProducts, prices, products, storesById } from '../index';
import { realPriceShare } from '../mergeCatalog';

const realById = new Map(openPricesProducts.map((p) => [p.id, p]));

describe('produits réels (Open Food Facts)', () => {
  it('existent et sont rattachés à un ingrédient, avec un code-barres', () => {
    expect(openPricesProducts.length).toBeGreaterThan(100);
    for (const p of openPricesProducts) {
      expect(p.verified).toBe(true);
      expect(p.id).toBe(`prd_off_${p.ean}`);
      expect(p.ean).toMatch(/^\d{8,14}$/);
      const ing = ingredientsById[p.ingredientId];
      expect(ing).toBeDefined();
      expect(p.packUnit).toBe(ing.baseUnit);
      expect(p.packSize).toBeGreaterThan(0);
      expect(p.name.trim().length).toBeGreaterThan(2);
    }
  });

  it('ont des identifiants et codes-barres uniques', () => {
    expect(new Set(openPricesProducts.map((p) => p.id)).size).toBe(openPricesProducts.length);
    expect(new Set(openPricesProducts.map((p) => p.ean)).size).toBe(openPricesProducts.length);
  });
});

describe('prix relevés (Open Prices)', () => {
  it('sont datés, sourcés et en centimes entiers plausibles', () => {
    expect(openPricesPrices.length).toBeGreaterThan(200);
    for (const p of openPricesPrices) {
      expect(p.source).toBe('open_prices');
      expect(realById.has(p.productId)).toBe(true);
      expect(storesById[p.storeId]).toBeDefined();
      expect(Number.isInteger(p.priceCents)).toBe(true);
      expect(p.priceCents).toBeGreaterThan(0);
      expect(p.priceCents).toBeLessThan(30_000);
      expect(p.updatedAt >= '2025-11-01').toBe(true);
      if (p.promoPriceCents !== undefined) expect(p.promoPriceCents).toBeLessThan(p.priceCents);
    }
  });

  it('placent une marque distributeur uniquement dans son enseigne', () => {
    for (const p of openPricesPrices) {
      const product = realById.get(p.productId)!;
      if (product.isStoreBrand) expect(storesById[p.storeId].chain).toBe(product.storeChain);
    }
  });

  it('restent dans un ordre de grandeur réaliste face aux estimations (÷4 à ×4 au kilo)', () => {
    const refByIngredient = new Map<string, number[]>();
    for (const price of prices) {
      const prod = products.find((x) => x.id === price.productId);
      if (!prod || prod.isStoreBrand || prod.organic) continue;
      const l = refByIngredient.get(prod.ingredientId) ?? [];
      l.push(price.priceCents / prod.packSize);
      refByIngredient.set(prod.ingredientId, l);
    }
    for (const p of openPricesPrices) {
      const prod = realById.get(p.productId)!;
      const refs = refByIngredient.get(prod.ingredientId);
      if (!refs) continue;
      const ref = refs.reduce((a, b) => a + b, 0) / refs.length;
      const unit = p.priceCents / prod.packSize;
      expect(unit).toBeGreaterThanOrEqual(ref * 0.25);
      expect(unit).toBeLessThanOrEqual(ref * 4);
    }
  });
});

describe('catalogue fusionné', () => {
  it('remplace les estimations par les relevés pour un même ingrédient dans un même magasin', () => {
    const ingredientOf = new Map(catalog.products.map((p) => [p.id, p.ingredientId]));
    const real = new Set(openPricesPrices.map((p) => `${ingredientOf.get(p.productId)}|${p.storeId}`));
    for (const p of catalog.prices) {
      if (p.source !== 'demo') continue;
      expect(real.has(`${ingredientOf.get(p.productId)}|${p.storeId}`)).toBe(false);
    }
  });

  it('contient une part significative de prix réels en France', () => {
    const fr = catalog.prices.filter((p) => storesById[p.storeId].country === 'FR');
    expect(realPriceShare(fr)).toBeGreaterThan(0.1);
  });
});

describe('recalage des estimations sur les prix relevés', () => {
  it('borne le facteur et ne touche pas aux ingrédients sans relevé', () => {
    const { calibrationFactors } = jest.requireActual('../mergeCatalog') as typeof import('../mergeCatalog');
    const all = [...products, ...openPricesProducts];
    const f = calibrationFactors(all, prices, openPricesPrices);
    expect(f.size).toBeGreaterThan(50);
    for (const v of f.values()) {
      expect(v).toBeGreaterThanOrEqual(0.5);
      expect(v).toBeLessThanOrEqual(2);
    }
    const relevés = new Set(openPricesProducts.map((p) => p.ingredientId));
    for (const ing of f.keys()) expect(relevés.has(ing)).toBe(true);
  });
});

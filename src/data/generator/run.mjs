#!/usr/bin/env node
/**
 * Régénère `src/data/products.ts` et `src/data/prices.ts` à partir de
 * `src/data/productSpecs.ts` (générateur déterministe `buildCatalog.ts`).
 *
 * Usage : node src/data/generator/run.mjs
 * (Node ≥ 22.18 : les fichiers .ts sont chargés par « type stripping ».)
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ALLERGENS } from '../../core/types.ts';
import { ingredients } from '../ingredients.ts';
import { productSpecs } from '../productSpecs.ts';
import { stores } from '../stores.ts';
import { buildPrices, buildProducts, DEMO_PRICES_UPDATED_AT } from './buildCatalog.ts';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const products = buildProducts(productSpecs, ingredients, stores, ALLERGENS);
const prices = buildPrices(productSpecs, products, stores);

const HEADER = (what) => `/**
 * ${what} du catalogue de démonstration Cabas.
 *
 * ⚠️ FICHIER GÉNÉRÉ — ne pas modifier à la main.
 * Source : src/data/productSpecs.ts · Générateur : src/data/generator/run.mjs
 * (\`node src/data/generator/run.mjs\`). Un test vérifie qu'il est à jour.
 */
`;

// ── products.ts : un objet JSON par ligne ──
const productLines = products.map((p) => `  ${JSON.stringify(p)},`).join('\n');
const productsTs = `${HEADER('Produits')}import type { Product } from '../core/types';

export const products: Product[] = [
${productLines}
];
`;

// ── prices.ts : lignes compactes [produit, magasin, prix, promo?] ──
const priceLines = prices
  .map((p) => {
    const row = [p.productId, p.storeId, p.priceCents];
    if (p.promoPriceCents !== undefined) row.push([p.promoPriceCents, p.promoLabel, p.promoUntil]);
    return `  ${JSON.stringify(row)},`;
  })
  .join('\n');
const pricesTs = `${HEADER('Prix')}import type { Price } from '../core/types';

/** Date du relevé des prix de démonstration. */
export const DEMO_PRICES_UPDATED_AT = '${DEMO_PRICES_UPDATED_AT}';

/** [productId, storeId, priceCents, [promoPriceCents, promoLabel, promoUntil]?] */
type PriceRow = [string, string, number] | [string, string, number, [number, string, string]];

const ROWS: PriceRow[] = [
${priceLines}
];

export const prices: Price[] = ROWS.map((row) => {
  const price: Price = {
    productId: row[0],
    storeId: row[1],
    priceCents: row[2],
    updatedAt: DEMO_PRICES_UPDATED_AT,
    source: 'demo',
  };
  const promo = row[3];
  if (promo) {
    price.promoPriceCents = promo[0];
    price.promoLabel = promo[1];
    price.promoUntil = promo[2];
  }
  return price;
});
`;

writeFileSync(join(dataDir, 'products.ts'), productsTs);
writeFileSync(join(dataDir, 'prices.ts'), pricesTs);
console.log(`✔ ${products.length} produits, ${prices.length} prix générés dans ${dataDir}`);

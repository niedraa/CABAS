#!/usr/bin/env node
/**
 * Étape 3 du pipeline : régénère `src/data/products.ts`, `prices.ts` et
 * `meta.ts` à partir de `productSources.ts` et de l'instantané de données
 * ouvertes `openData/snapshot.json` (générateur déterministe `buildCatalog.ts`).
 *
 * Usage :
 *   npm run data:generate
 *   node src/data/generator/run.mjs [--sources fichier.json --out dossier]
 *     [--snapshot instantane.json]
 * (Node ≥ 22.18 : les fichiers .ts sont chargés par « type stripping ».)
 *
 * Les fichiers écrits n'importent que des TYPES (chargeables par Node / Deno).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { ALLERGENS } from '../../core/types.ts';
import { ingredients } from '../ingredients.ts';
import { productSources } from '../productSources.ts';
import { stores } from '../stores.ts';
import { buildCatalog } from './buildCatalog.ts';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(dataDir, '..', '..');
const abs = (p) => (isAbsolute(p) ? p : resolve(process.cwd(), p));

const { values: args } = parseArgs({
  options: {
    sources: { type: 'string' },
    snapshot: { type: 'string' },
    out: { type: 'string' },
  },
});
if (args.sources && !args.out) {
  console.error('✗ --sources exige --out : on n’écrase pas le catalogue avec une liste de test.');
  process.exit(1);
}

const snapshotFile = args.snapshot ? abs(args.snapshot) : join(dataDir, 'openData', 'snapshot.json');
const snapshot = JSON.parse(readFileSync(snapshotFile, 'utf8'));
const sources = args.sources ? JSON.parse(readFileSync(abs(args.sources), 'utf8')) : productSources;
const outDir = args.out ? abs(args.out) : dataDir;

const { products, prices, meta, warnings } = buildCatalog(sources, snapshot, ingredients, stores, ALLERGENS);

/** Tableau littéral, une ligne par élément (`[]` si vide). */
const block = (lines) => (lines.length === 0 ? '[]' : `[\n${lines.join('\n')}\n]`);

const HEADER = (what) => `/**
 * ${what} du catalogue Cabas — données ouvertes (licence ODbL, voir DATA_LICENSE.md).
 *
 * ⚠️ FICHIER GÉNÉRÉ — ne pas modifier à la main.
 * Sources : src/data/productSources.ts + src/data/openData/snapshot.json
 * (instantané du ${meta.snapshotAt}) · Générateur : src/data/generator/run.mjs
 * (\`npm run data:generate\`). Un test vérifie qu'il est à jour.
 */
`;

// ── products.ts : un objet JSON par ligne ──
const productsTs = `${HEADER('Produits')}import type { Product } from '../core/types';

export const products: Product[] = ${block(products.map((p) => `  ${JSON.stringify(p)},`))};
`;

// ── prices.ts : lignes compactes avec provenance ──
const priceLines = prices.map((p) => {
  const row =
    p.source === 'open_prices'
      ? [p.productId, p.storeId, p.priceCents, 'o', p.updatedAt, p.observationCount, p.observedFrom]
      : [p.productId, p.storeId, p.priceCents, 'e', p.estimateMethod, p.estimateBasisCount];
  return `  ${JSON.stringify(row)},`;
});
const pricesTs = `${HEADER('Prix')}import type { EstimateMethod, Price } from '../core/types';

/** Date de l'instantané : date des prix estimés. */
const SNAPSHOT_AT = '${meta.snapshotAt}';

/**
 * Lignes compactes :
 * - relevé Open Prices : [produit, magasin, prix (c), 'o', dernier relevé, nombre de relevés, premier relevé]
 * - estimation          : [produit, magasin, prix (c), 'e', méthode, nombre de prix réels utilisés]
 */
type PriceRow =
  | [string, string, number, 'o', string, number, string]
  | [string, string, number, 'e', EstimateMethod, number];

const ROWS: PriceRow[] = ${block(priceLines)};

export const prices: Price[] = ROWS.map((row): Price => {
  if (row[3] === 'o') {
    return {
      productId: row[0],
      storeId: row[1],
      priceCents: row[2],
      updatedAt: row[4],
      source: 'open_prices',
      observationCount: row[5],
      observedFrom: row[6],
    };
  }
  return {
    productId: row[0],
    storeId: row[1],
    priceCents: row[2],
    updatedAt: SNAPSHOT_AT,
    source: 'estimate',
    estimateMethod: row[4],
    estimateBasisCount: row[5],
  };
});
`;

// ── meta.ts ──
const metaTs = `${HEADER('Description de l’instantané')}import type { CatalogMeta } from '../core/types';

export const catalogMeta: CatalogMeta = ${JSON.stringify(meta, null, 2)};
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'products.ts'), productsTs);
writeFileSync(join(outDir, 'prices.ts'), pricesTs);
writeFileSync(join(outDir, 'meta.ts'), metaTs);

const total = meta.observedPrices + meta.estimatedPrices;
console.log(
  `✔ ${products.length} produits, ${total} prix (${meta.observedPrices} relevés, ${meta.estimatedPrices} estimés) → ${relative(rootDir, outDir) || '.'}`,
);
for (const chain of Object.keys(meta.coverage)) {
  const c = meta.coverage[chain];
  console.log(`  ${chain.padEnd(12)} ${String(c.observed).padStart(5)} relevés · ${String(c.estimated).padStart(5)} estimés`);
}
if (warnings.length > 0) {
  console.log(`\n${warnings.length} point(s) à relire :`);
  for (const w of warnings) console.log(`  • ${w}`);
}

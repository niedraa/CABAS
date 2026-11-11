/**
 * Tests des scripts de génération (node:test) :
 *   node --test supabase/tests/scripts.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { rewriteImports } from '../../scripts/sync-shared.mjs';
import { buildSeedSql, sqlArray, sqlJson, sqlString, sqlTyped, sqlValue, validateCatalog } from '../../scripts/generate-seed.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Base PGlite avec le bouchon Supabase et TOUTES les migrations. */
async function freshDb() {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(readFileSync(join(ROOT, 'supabase/tests/supabase-stub.sql'), 'utf8'));
  const dir = join(ROOT, 'supabase/migrations');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(dir, f), 'utf8'));
  }
  return db;
}
const rows = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const n = async (db, sql, params = []) => Number(Object.values((await db.query(sql, params)).rows[0])[0]);

test('sync-shared : ajoute .ts aux imports relatifs uniquement', () => {
  const src = [
    "import type { A } from './types';",
    "import { b } from '../x/y';",
    "export * from './units';",
    "export { c } from \"./c\";",
    "import './side';",
    "const m = await import('./lazy');",
    "import { d } from './already.ts';",
    "import { e } from 'npm:pkg';",
    "import { f } from '@scope/pkg';",
  ].join('\n');
  assert.equal(
    rewriteImports(src),
    [
      "import type { A } from './types.ts';",
      "import { b } from '../x/y.ts';",
      "export * from './units.ts';",
      "export { c } from \"./c.ts\";",
      "import './side.ts';",
      "const m = await import('./lazy.ts');",
      "import { d } from './already.ts';",
      "import { e } from 'npm:pkg';",
      "import { f } from '@scope/pkg';",
    ].join('\n'),
  );
  // Idempotent.
  assert.equal(rewriteImports(rewriteImports(src)), rewriteImports(src));
});

test('generate-seed : échappement SQL', () => {
  assert.equal(sqlString("L'œuf d'or"), "'L''œuf d''or'");
  assert.equal(sqlString("'; drop table recipes; --"), "'''; drop table recipes; --'");
  assert.throws(() => sqlString('a\u0000b'));
  assert.equal(sqlValue(null), 'null');
  assert.equal(sqlValue(undefined), 'null');
  assert.equal(sqlValue(true), 'true');
  assert.equal(sqlValue(1.5), '1.5');
  assert.throws(() => sqlValue(Number.NaN));
  assert.equal(sqlTyped(undefined, 'date'), 'null');
  assert.equal(sqlTyped('2026-11-30', 'date'), "'2026-11-30'::date");
  assert.equal(sqlArray([], 'public.allergen'), "'{}'::public.allergen[]");
  assert.equal(sqlArray(['lait', "x'y"], 'text'), "array['lait', 'x''y']::text[]");
  assert.equal(sqlJson([{ text: "C'est prêt" }]), `'[{"text":"C''est prêt"}]'::jsonb`);
});

// ─── Catalogues de test ──────────────────────────────────────────────────────

const ING = (id, extra = {}) => ({
  id, name: id, aisle: 'epicerie_salee', baseUnit: 'g', allergens: [], isMeat: false, isPork: false, isFish: false,
  isSeafood: false, isAnimalProduct: false, ...extra,
});
const STORE = (chain, extra = {}) => ({
  id: chain, chain, name: chain, city: 'France', pickup: 'drive', driveFeeCents: 0, deliveryFeeCents: 690, minOrderCents: 0,
  searchUrlTemplate: `https://${chain}.example/s?q={query}`, driveUrl: `https://${chain}.example/`, ...extra,
});
const RECIPE = (id, ingredientIds) => ({
  id, title: id, description: '', emoji: '🍽️', color: '#FFEEDD', cuisine: 'francaise', tags: [], mealTypes: ['diner'], servings: 2,
  prepTimeMin: 5, cookTimeMin: 5, difficulty: 1, equipment: [], costLevel: 1,
  ingredients: ingredientIds.map((ingredientId) => ({ ingredientId, quantity: 100, unit: 'g' })), steps: [{ text: 'Cuisine.' }],
});
const PRODUCT = (id, ingredientId, extra = {}) => ({
  id, name: id, brand: 'Marque', isStoreBrand: false, ingredientId, packSize: 500, packUnit: 'g', allergens: [], ...extra,
});
const PRICE = (productId, storeId, priceCents, extra = {}) => ({
  productId, storeId, priceCents, updatedAt: '2026-11-09T06:00:00.000Z', source: 'demo', ...extra,
});

/** Ancien catalogue fictif (forme de l'ancien générateur : `storeChain`). */
function demoCatalog() {
  return {
    ingredients: [ING('riz'), ING('tomate', { aisle: 'fruits_legumes' })],
    recipes: [RECIPE('rec_riz', ['riz']), RECIPE('rec_retiree', ['tomate'])],
    stores: [STORE('leclerc'), STORE('lidl', { pickup: 'none', deliveryFeeCents: null }), STORE('casino')].map((s) =>
      s.id === 'casino' ? { ...s, chain: 'monoprix' } : s
    ),
    products: [
      PRODUCT('prd_riz', 'riz', { ean: '3000000000017' }),
      PRODUCT('prd_riz_mdd_lidl', 'riz', { ean: '3000000000024', isStoreBrand: true, storeChain: 'lidl' }),
      PRODUCT('prd_tomate', 'tomate', { ean: '3000000000031' }),
      PRODUCT('prd_fictif', 'tomate', { ean: '3000000000048' }),
    ],
    prices: [
      PRICE('prd_riz', 'leclerc', 189),
      PRICE('prd_riz', 'lidl', 209),
      PRICE('prd_riz_mdd_lidl', 'lidl', 129, { promoPriceCents: 99, promoLabel: "-25 % l'unité", promoUntil: '2026-11-30' }),
      PRICE('prd_tomate', 'leclerc', 349),
      PRICE('prd_tomate', 'lidl', 279),
      PRICE('prd_fictif', 'leclerc', 199),
    ],
  };
}

const META = {
  snapshotAt: '2026-11-11T00:00:00.000Z',
  pricesFrom: '2025-11-11',
  pricesTo: '2026-11-10',
  observedPrices: 3,
  estimatedPrices: 2,
  chainIndex: { leclerc: { value: 1, basis: 'measured', commonProducts: 300 } },
  coverage: { leclerc: { observed: 3, estimated: 0 } },
  sources: [{ name: 'Open Prices', url: 'https://prices.openfoodfacts.org', license: 'ODbL' }],
};

/** Catalogue réel (instantané) qui succède au catalogue fictif. */
function realCatalog() {
  return {
    ingredients: [ING('riz'), ING('tomate', { aisle: 'fruits_legumes' })],
    recipes: [RECIPE('rec_riz', ['riz'])],
    stores: [STORE('leclerc'), STORE('lidl', { pickup: 'none', deliveryFeeCents: null }), STORE('netto', { pickup: 'none', deliveryFeeCents: null })],
    products: [
      // Même id, vrai code-barres : identité changée.
      PRODUCT('prd_riz', 'riz', { ean: '3111952035624' }),
      // MDD Mousquetaires vendue chez Netto (et Intermarché).
      PRODUCT('prd_riz_mdd_intermarche', 'riz', { ean: '3250392603588', isStoreBrand: true, storeChains: ['intermarche', 'netto'] }),
      // Même id, même code-barres.
      PRODUCT('prd_tomate', 'tomate', { ean: '3000000000031' }),
      // Vrac.
      PRODUCT('prd_tomate_vrac', 'tomate', { offCategoryTag: 'en:tomatoes', packSize: 1000 }),
    ],
    prices: [
      PRICE('prd_riz', 'leclerc', 175, { source: 'open_prices', updatedAt: '2026-11-03', observationCount: 12, observedFrom: '2026-01-05' }),
      PRICE('prd_riz', 'lidl', 180, { source: 'open_prices', updatedAt: '2026-10-20', observationCount: 1, observedFrom: '2026-10-20' }),
      PRICE('prd_riz_mdd_intermarche', 'netto', 119, { source: 'estimate', updatedAt: '2026-11-11', estimateMethod: 'mdd_ratio', estimateBasisCount: 4 }),
      PRICE('prd_tomate', 'leclerc', 329, { source: 'open_prices', updatedAt: '2026-10-01', observationCount: 3, observedFrom: '2026-06-01' }),
      PRICE('prd_tomate', 'lidl', 299, { source: 'estimate', updatedAt: '2026-11-11', estimateMethod: 'chain_index', estimateBasisCount: 3 }),
      PRICE('prd_tomate_vrac', 'leclerc', 289, { source: 'open_prices', updatedAt: '2026-11-08', observationCount: 20, observedFrom: '2026-02-01' }),
      PRICE('prd_tomate_vrac', 'netto', 279, { source: 'estimate', updatedAt: '2026-11-11', estimateMethod: 'category_median', estimateBasisCount: 20 }),
    ],
    meta: META,
  };
}

test('generate-seed : le SQL produit est exécutable et restitue les valeurs piégeuses', async () => {
  const data = {
    ingredients: [
      { id: 'oeuf', name: "Œuf d'or", aisle: 'cremerie', baseUnit: 'piece', allergens: ['oeufs'], isMeat: false, isPork: false, isFish: false, isSeafood: false, isAnimalProduct: true, gramsPerPiece: 55.5, seasonMonths: [1, 2] },
    ],
    recipes: [
      {
        id: 'rec_test', title: "Omelette 'maison' -- ; drop", description: 'Rapide\nfacile', emoji: '🍳', color: '#FFEEDD', cuisine: 'francaise',
        tags: ["l'été"], mealTypes: ['diner'], servings: 2, prepTimeMin: 5, cookTimeMin: 5, difficulty: 1, equipment: ['plaques'], costLevel: 1,
        ingredients: [{ ingredientId: 'oeuf', quantity: 3, unit: 'piece', note: "battus à l'ancienne" }], steps: [{ text: "Bats les œufs. C'est tout", timerMin: 2 }],
      },
    ],
    stores: [STORE('lidl', { city: 'Lyon', pickup: 'none', deliveryFeeCents: null })],
    products: [{ id: 'prd_oeuf', ean: '3000000000017', name: 'Œufs x6', brand: '', isStoreBrand: true, storeChains: ['lidl'], ingredientId: 'oeuf', packSize: 6, packUnit: 'piece', allergens: ['oeufs'] }],
    prices: [{ productId: 'prd_oeuf', storeId: 'lidl', priceCents: 199, promoPriceCents: 149, promoLabel: "-25 % l'unité", promoUntil: '2026-11-30', updatedAt: '2026-11-09T06:00:00.000Z', source: 'demo' }],
  };
  const sql = buildSeedSql(data);
  const db = await freshDb();
  await db.exec(sql);
  await db.exec(sql); // idempotent
  const r = (await db.query(`select title, tags, steps, description from public.recipes`)).rows[0];
  assert.equal(r.title, "Omelette 'maison' -- ; drop");
  assert.deepEqual(r.tags, ["l'été"]);
  assert.deepEqual(r.steps, [{ text: "Bats les œufs. C'est tout", timerMin: 2 }]);
  assert.equal(r.description, 'Rapide\nfacile');
  const p = (await db.query(`select promo_label, promo_until::text as d from public.prices`)).rows[0];
  assert.deepEqual(p, { promo_label: "-25 % l'unité", d: '2026-11-30' });
  assert.equal((await db.query('select count(*)::int as n from public.recipe_ingredients')).rows[0].n, 1);
  assert.deepEqual((await db.query(`select pickup, delivery_fee_cents from public.stores`)).rows[0], { pickup: 'none', delivery_fee_cents: null });
  assert.equal(await n(db, 'select count(*) from public.price_history'), 1);
  await db.close();
});

test('generate-seed : passage du catalogue fictif au catalogue réel sans casser les données', async () => {
  const db = await freshDb();
  await db.exec(buildSeedSql(demoCatalog()));
  // Ancien écrivain : storeChain → store_chains.
  assert.deepEqual(await rows(db, `select store_chains::text[] as c from public.products where id = 'prd_riz_mdd_lidl'`), [{ c: ['lidl'] }]);
  assert.equal(await n(db, 'select count(*) from public.catalog_meta'), 0);

  // Données utilisateur et collecte postérieures au seed fictif.
  const u = (await rows(db, `insert into auth.users (email) values ('a@example.com') returning id`))[0].id;
  await db.query(
    `insert into public.order_handoffs (user_id, id, store_id, total_cents, lines)
     values ($1, 'o1', 'casino', 500, '[{"itemId":"riz","label":"Riz","productId":"prd_fictif","packs":1,"totalCents":500}]')`,
    [u],
  );
  await db.query(
    `insert into public.price_watches (user_id, product_id, store_id, reference_cents) values
       ($1, 'prd_fictif', 'leclerc', 199), ($1, 'prd_riz', 'leclerc', 189), ($1, 'prd_tomate', 'leclerc', 349)`,
    [u],
  );
  // collect-prices a relevé un prix RÉEL, plus récent que l'instantané, et un relevé ancien.
  await db.query(
    `update public.prices set source = 'open_prices', price_cents = 319, observation_count = 4, observed_from = '2026-10-01',
            updated_at = '2026-11-10T12:00:00Z' where product_id = 'prd_tomate' and store_id = 'leclerc'`,
  );
  await db.query(
    `update public.prices set source = 'open_prices', price_cents = 289, observation_count = 1, observed_from = '2025-06-01',
            updated_at = '2025-06-01T12:00:00Z' where product_id = 'prd_tomate' and store_id = 'lidl'`,
  );
  await db.query(
    `insert into public.prices (product_id, store_id, price_cents, source, observation_count, observed_from, updated_at)
     values ('prd_tomate', 'casino', 399, 'open_prices', 2, '2026-09-01', '2026-09-02T12:00:00Z')`,
  );
  await db.query(
    `insert into public.price_observations (product_id, chain, kind, open_prices_id, regular_milli, observed_on, source_created_at) values
       ('prd_tomate', 'leclerc', 'observation', 1, 3190, '2026-11-10', '2026-11-10T20:00:00Z'),
       ('prd_tomate', 'leclerc', 'observation', 2, 3190, '2026-11-10', '2026-11-12T08:00:00Z')`,
  );
  await db.query(`insert into public.price_collection_state (id, created_cursor) values (true, '2026-11-12T09:00:00Z')`);

  const real = realCatalog();
  const sql = buildSeedSql(real);
  await db.exec(sql);

  // Produits : fictif supprimé (historique purgé, alerte en cascade), nouveaux créés.
  assert.deepEqual(
    (await rows(db, 'select id from public.products order by id')).map((r) => r.id),
    ['prd_riz', 'prd_riz_mdd_intermarche', 'prd_tomate', 'prd_tomate_vrac'],
  );
  assert.equal(await n(db, `select count(*) from public.price_history where product_id in ('prd_fictif', 'prd_riz_mdd_lidl')`), 0);
  assert.deepEqual(
    await rows(db, `select store_chains::text[] as c, store_chain::text as s from public.products where id = 'prd_riz_mdd_intermarche'`),
    [{ c: ['intermarche', 'netto'], s: 'intermarche' }],
  );
  // Alertes : produit supprimé → cascade ; identité changée (prd_riz) → supprimée ; même produit → gardée.
  assert.deepEqual((await rows(db, 'select product_id from public.price_watches')).map((r) => r.product_id), ['prd_tomate']);
  // Commande passée : magasin retiré DÉSACTIVÉ (FK restrict), lignes jsonb intactes.
  assert.deepEqual(await rows(db, `select is_active from public.stores where id = 'casino'`), [{ is_active: false }]);
  assert.equal(await n(db, `select count(*) from public.order_handoffs`), 1);
  assert.deepEqual(await rows(db, `select pickup from public.stores where id = 'netto'`), [{ pickup: 'none' }]);
  assert.deepEqual(await rows(db, `select is_published from public.recipes where id = 'rec_retiree'`), [{ is_published: false }]);

  const price = async (p, s) =>
    (await rows(
      db,
      `select price_cents, source::text, observation_count, estimate_method::text from public.prices where product_id = $1 and store_id = $2`,
      [p, s],
    ))[0];
  // Relevé collecté plus récent que l'instantané : conservé (non-régression).
  assert.deepEqual(await price('prd_tomate', 'leclerc'), { price_cents: 319, source: 'open_prices', observation_count: 4, estimate_method: null });
  // Relevé réel sorti de la fenêtre : remplacé par l'estimation à jour.
  assert.deepEqual(await price('prd_tomate', 'lidl'), { price_cents: 299, source: 'estimate', observation_count: null, estimate_method: 'chain_index' });
  // Relevé réel absent du seed : conservé.
  assert.equal((await price('prd_tomate', 'casino')).price_cents, 399);
  // Prix fictifs : remplacés par le relevé (identité changée), ou supprimés.
  assert.deepEqual(await price('prd_riz', 'leclerc'), { price_cents: 175, source: 'open_prices', observation_count: 12, estimate_method: null });
  assert.equal(await n(db, `select count(*) from public.prices where source = 'demo'`), 0);
  assert.deepEqual(await price('prd_tomate_vrac', 'netto'), { price_cents: 279, source: 'estimate', observation_count: null, estimate_method: 'category_median' });

  // Instantané : description, socles (vrac au kilo), relevés déjà inclus purgés, curseur jamais reculé.
  assert.deepEqual((await rows(db, 'select meta from public.catalog_meta'))[0].meta, META);
  assert.deepEqual(
    await rows(
      db,
      `select product_id, chain::text, weight, regular_milli, price_per, observed_on::text as d, observed_from::text as f
         from public.price_observations where kind = 'snapshot' order by product_id, chain`,
    ),
    [
      { product_id: 'prd_riz', chain: 'leclerc', weight: 12, regular_milli: 1750, price_per: null, d: '2026-11-03', f: '2026-01-05' },
      { product_id: 'prd_riz', chain: 'lidl', weight: 1, regular_milli: 1800, price_per: null, d: '2026-10-20', f: '2026-10-20' },
      { product_id: 'prd_tomate', chain: 'leclerc', weight: 3, regular_milli: 3290, price_per: null, d: '2026-10-01', f: '2026-06-01' },
      { product_id: 'prd_tomate_vrac', chain: 'leclerc', weight: 20, regular_milli: 2890, price_per: 'KILOGRAM', d: '2026-11-08', f: '2026-02-01' },
    ],
  );
  assert.deepEqual(
    (await rows(db, `select open_prices_id from public.price_observations where kind = 'observation'`)).map((r) => Number(r.open_prices_id)),
    [2],
  );
  assert.equal(
    (await rows(db, `select created_cursor from public.price_collection_state`))[0].created_cursor.toISOString(),
    '2026-11-12T09:00:00.000Z',
  );

  // Rejouer le même seed : rien ne bouge (ni prix, ni historique, ni socles).
  const hist = await n(db, 'select count(*) from public.price_history');
  const snap = await n(db, 'select count(*) from public.price_observations');
  await db.exec(sql);
  assert.equal(await n(db, 'select count(*) from public.price_history'), hist);
  assert.equal(await n(db, 'select count(*) from public.price_observations'), snap);
  assert.equal((await price('prd_tomate', 'leclerc')).price_cents, 319);

  // Un relevé réel PLUS RÉCENT dans un nouvel instantané remplace le relevé collecté.
  const next = realCatalog();
  next.meta = { ...META, snapshotAt: '2026-11-20T00:00:00.000Z', pricesTo: '2026-11-19' };
  next.prices = next.prices.map((p) =>
    p.productId === 'prd_tomate' && p.storeId === 'leclerc'
      ? { ...p, priceCents: 315, updatedAt: '2026-11-18', observationCount: 9 }
      : p
  );
  await db.exec(buildSeedSql(next));
  assert.deepEqual(await price('prd_tomate', 'leclerc'), { price_cents: 315, source: 'open_prices', observation_count: 9, estimate_method: null });
  assert.equal(await n(db, `select count(*) from public.price_observations where kind = 'observation'`), 0);
  assert.equal(
    (await rows(db, `select created_cursor from public.price_collection_state`))[0].created_cursor.toISOString(),
    '2026-11-20T00:00:00.000Z',
  );

  // Retour à un catalogue sans instantané : catalog_meta vidée, relevés réels conservés.
  await db.exec(buildSeedSql({ ...demoCatalog(), meta: undefined }));
  assert.equal(await n(db, 'select count(*) from public.catalog_meta'), 0);
  assert.equal(await n(db, `select count(*) from public.price_observations where kind = 'snapshot'`), 0);
  await db.close();
});

test('generate-seed : seed atomique — une erreur annule tout', async () => {
  const db = await freshDb();
  await db.exec(buildSeedSql(demoCatalog()));
  const broken = realCatalog();
  // Contrainte de la base : une estimation sans méthode.
  broken.prices[2] = { ...broken.prices[2], estimateMethod: undefined };
  await assert.rejects(() => db.exec(buildSeedSql(broken)), /prices_estimate_method/);
  await db.exec('rollback').catch(() => {});
  assert.equal(await n(db, `select count(*) from public.products where id = 'prd_fictif'`), 1, 'ancien catalogue intact');
  assert.equal(await n(db, 'select count(*) from public.catalog_meta'), 0);
  await db.close();
});

test('generate-seed : validation explicite du catalogue', () => {
  const base = realCatalog();
  const bad = (mutate, pattern) => {
    const d = structuredClone(base);
    mutate(d);
    assert.throws(() => validateCatalog(d), pattern);
  };
  validateCatalog(base);
  bad((d) => d.products.push({ ...d.products[0] }), /Produit en double/);
  bad((d) => (d.products[1].ean = d.products[0].ean), /Code-barres en double/);
  bad((d) => d.prices.push({ ...d.prices[0] }), /Prix en double/);
  bad((d) => (d.products[3].ean = '3000000000055'), /exactement un des deux/);
  bad((d) => delete d.products[0].ean, /exactement un des deux/);
  bad((d) => (d.products[1].storeChains = []), /une MDD a au moins une enseigne/);
  bad((d) => d.prices.push(PRICE('prd_riz_mdd_intermarche', 'leclerc', 99)), /MDD hors de ses enseignes/);
  bad((d) => d.prices.push(PRICE('prd_inconnu', 'leclerc', 99)), /produit inconnu/);
  bad((d) => d.prices.push(PRICE('prd_tomate', 'auchan', 99)), /magasin inconnu/);
  bad((d) => (d.prices[0].source = 'scraping'), /source inconnue/);
  bad((d) => delete d.meta.snapshotAt, /catalogMeta : champ snapshotAt/);
});

test('fichiers générés à jour (sync-shared --check, generate-seed --check)', () => {
  execFileSync(process.execPath, [join(ROOT, 'scripts/sync-shared.mjs'), '--check'], { stdio: 'pipe' });
  execFileSync(process.execPath, ['--no-warnings', join(ROOT, 'scripts/generate-seed.mjs'), '--check'], { stdio: 'pipe' });
});

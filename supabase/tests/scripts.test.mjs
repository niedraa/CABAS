/**
 * Tests des scripts de génération (node:test) :
 *   node --test supabase/tests/scripts.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { rewriteImports } from '../../scripts/sync-shared.mjs';
import { buildSeedSql, sqlArray, sqlJson, sqlString, sqlValue } from '../../scripts/generate-seed.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

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
  assert.equal(sqlArray([], 'public.allergen'), "'{}'::public.allergen[]");
  assert.equal(sqlArray(['lait', "x'y"], 'text'), "array['lait', 'x''y']::text[]");
  assert.equal(sqlJson([{ text: "C'est prêt" }]), `'[{"text":"C''est prêt"}]'::jsonb`);
});

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
    stores: [{ id: 'lidl', chain: 'lidl', name: 'Lidl', city: 'Lyon', driveFeeCents: 0, deliveryFeeCents: null, minOrderCents: 0, searchUrlTemplate: 'https://x/?q={query}', driveUrl: 'https://x' }],
    products: [{ id: 'prd_oeuf', ean: '3000000000017', name: 'Œufs x6', brand: '', isStoreBrand: true, storeChain: 'lidl', ingredientId: 'oeuf', packSize: 6, packUnit: 'piece', allergens: ['oeufs'] }],
    prices: [{ productId: 'prd_oeuf', storeId: 'lidl', priceCents: 199, promoPriceCents: 149, promoLabel: "-25 % l'unité", promoUntil: '2026-11-30', updatedAt: '2026-11-09T06:00:00.000Z', source: 'demo' }],
  };
  const sql = buildSeedSql(data);
  const db = await PGlite.create();
  // Schéma minimal : on rejoue les vraies migrations catalogue sur un bouchon Supabase.
  const { readFileSync } = await import('node:fs');
  await db.exec(readFileSync(join(ROOT, 'supabase/tests/supabase-stub.sql'), 'utf8'));
  for (const f of ['20260901000000_extensions_and_types.sql', '20260901000100_catalog.sql']) {
    await db.exec(readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8').replace(/create extension if not exists pgcrypto[^;]*;/, ''));
  }
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
  await db.close();
});

test('fichiers générés à jour (sync-shared --check, generate-seed --check)', () => {
  execFileSync(process.execPath, [join(ROOT, 'scripts/sync-shared.mjs'), '--check'], { stdio: 'pipe' });
  execFileSync(process.execPath, ['--no-warnings', join(ROOT, 'scripts/generate-seed.mjs'), '--check'], { stdio: 'pipe' });
});

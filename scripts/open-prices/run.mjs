#!/usr/bin/env node
/**
 * Rafraîchit les prix RÉELS du catalogue depuis Open Prices (Open Food Facts, ODbL) :
 *  1. collect.mjs : vrais produits (code-barres) par ingrédient + relevés récents FR / ES ;
 *  2. build.mjs   : normalisation, garde-fous → src/data/openPrices.ts ;
 *  3. régénère le seed Supabase.
 * Usage : npm run prices:refresh   (une dizaine de minutes ; à relancer chaque mois).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const work = mkdtempSync(join(tmpdir(), 'cabas-prices-'));
const { ingredients } = await import(join(ROOT, 'src/data/ingredients.ts'));
writeFileSync(join(work, 'ingredients.json'), JSON.stringify(ingredients.map((i) => ({ id: i.id, name: i.name, baseUnit: i.baseUnit }))));
const run = (file, args) => execFileSync(process.execPath, [join(HERE, file), ...args], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
run('collect.mjs', [join(work, 'ingredients.json'), join(work, 'collected.json')]);
run('build.mjs', [join(work, 'collected.json'), ROOT]);
execFileSync(process.execPath, ['--no-warnings', join(ROOT, 'scripts/generate-seed.mjs')], { stdio: 'inherit' });
console.log('✔ Prix réels mis à jour (src/data/openPrices.ts, supabase/seed.sql).');

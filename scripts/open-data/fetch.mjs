#!/usr/bin/env node
/**
 * Étape 1 du pipeline de données ouvertes : téléchargements (hors CI).
 *
 *  1. Exports quotidiens d'Open Prices (prices.jsonl.gz, locations.jsonl.gz,
 *     ODbL) → .cache/open-data/ (≈ 25 Mo, ignorés par git) ;
 *  2. fiches Open Food Facts de TOUS les codes-barres de productSources, par
 *     lots de 100 (`/api/v2/search?code=…`), ≤ 6 requêtes / min, reprise
 *     sur 503 / 429 avec attente croissante → .cache/open-data/off-products.json
 *     (reprise possible : seuls les codes absents du cache sont demandés).
 *
 * Usage :
 *   npm run data:fetch
 *   node scripts/open-data/fetch.mjs [--sources fichier.json] [--skip-dumps]
 *     [--skip-off] [--refresh-dumps] [--refresh-off] [--cache-dir dossier]
 *
 * Aucune donnée personnelle n'est envoyée (User-Agent générique) ni conservée.
 */
import { createWriteStream, mkdirSync, renameSync, statSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';

import {
  absPath,
  DEFAULT_CACHE_DIR,
  isoDay,
  loadOpenPrices,
  loadSources,
  readJsonIfExists,
  reexecWithEnvProxy,
  section,
  sleep,
  sourceEanRefs,
  stableStringify,
} from './lib.mjs';

async function main() {
  const { values: args } = parseArgs({
    options: {
      sources: { type: 'string' },
      'cache-dir': { type: 'string' },
      'skip-dumps': { type: 'boolean', default: false },
      'skip-off': { type: 'boolean', default: false },
      'refresh-dumps': { type: 'boolean', default: false },
      'refresh-off': { type: 'boolean', default: false },
      'max-age-hours': { type: 'string', default: '20' },
    },
  });
  const op = await loadOpenPrices();
  const cacheDir = args['cache-dir'] ? absPath(args['cache-dir']) : DEFAULT_CACHE_DIR;
  mkdirSync(cacheDir, { recursive: true });

  if (!args['skip-dumps']) await fetchDumps(op, cacheDir, args['refresh-dumps'], Number(args['max-age-hours']));
  if (!args['skip-off']) await fetchOffProducts(op, cacheDir, args.sources, args['refresh-off']);
}

// ─── Exports Open Prices ─────────────────────────────────────────────────────

async function fetchDumps(op, cacheDir, refresh, maxAgeHours) {
  console.log(section('Exports Open Prices'));
  const metaFile = join(cacheDir, 'dumps.json');
  const meta = readJsonIfExists(metaFile, {});
  let first = true;
  for (const [name, url] of Object.entries(op.OPEN_PRICES_DUMP_URLS)) {
    const dest = join(cacheDir, `${name}.jsonl.gz`);
    if (!refresh && existsSync(dest)) {
      const ageH = (Date.now() - statSync(dest).mtimeMs) / 3_600_000;
      if (ageH < maxAgeHours) {
        console.log(`  ${name} : en cache (${ageH.toFixed(1)} h) — --refresh-dumps pour forcer`);
        continue;
      }
    }
    if (!first) await sleep(2000); // Open Prices : ≤ 1 requête / 2 s
    first = false;
    const started = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': op.OPEN_DATA_USER_AGENT } });
    if (!res.ok || !res.body) throw new Error(`${url} : HTTP ${res.status}`);
    const part = `${dest}.part`;
    await pipeline(Readable.fromWeb(res.body), createWriteStream(part));
    const bytes = statSync(part).size;
    if (bytes < 1000) {
      rmSync(part);
      throw new Error(`${url} : fichier trop petit (${bytes} o)`);
    }
    renameSync(part, dest);
    meta[name] = {
      url,
      downloadedAt: new Date().toISOString(),
      bytes,
      lastModified: res.headers.get('last-modified'),
    };
    console.log(`  ${name} : ${(bytes / 1e6).toFixed(1)} Mo en ${((Date.now() - started) / 1000).toFixed(1)} s`);
  }
  writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
}

// ─── Fiches Open Food Facts ──────────────────────────────────────────────────

/** Champs demandés (et seuls conservés) : aucune donnée personnelle. */
const OFF_FIELDS = [
  'code',
  'product_name_fr',
  'product_name',
  'brands',
  'quantity',
  'product_quantity',
  'product_quantity_unit',
  'nutriscore_grade',
  'allergens_tags',
  'traces_tags',
  'labels_tags',
  'last_modified_t',
];
const OFF_SEARCH_URL = 'https://world.openfoodfacts.org/api/v2/search';
const BATCH_SIZE = 100;
/** ≤ 6 requêtes / min (limite OFF : 10 recherches / min / IP, partagée). */
const MIN_INTERVAL_MS = 10_000;
const RETRY_WAITS_S = [15, 30, 60, 120, 240];

async function fetchOffProducts(op, cacheDir, sourcesPath, refresh) {
  console.log(section('Fiches Open Food Facts'));
  const { sources, origin } = await loadSources(sourcesPath);
  const refs = sourceEanRefs(sources);
  const invalid = refs.filter((r) => !op.isValidGtin(r.ean));
  const eans = Array.from(new Set(refs.filter((r) => op.isValidGtin(r.ean)).map((r) => r.ean))).sort();
  console.log(`  sources : ${origin} — ${sources.length} ingrédients, ${eans.length} codes-barres`);
  for (const r of invalid) console.log(`  ✗ code-barres invalide ignoré : ${r.ean} (${r.ingredientId}, ${r.role})`);

  const cacheFile = join(cacheDir, 'off-products.json');
  const cache = readJsonIfExists(cacheFile, { schemaVersion: 1, products: {}, missing: {} });
  cache.products ??= {};
  cache.missing ??= {};
  const todo = eans.filter((e) => refresh || !cache.products[e]);
  if (todo.length === 0) {
    console.log(eans.length === 0 ? '  aucun code-barres à demander' : '  tout est en cache — --refresh-off pour tout redemander');
    return;
  }
  console.log(`  à demander : ${todo.length} (${Math.ceil(todo.length / BATCH_SIZE)} requêtes, ≥ ${MIN_INTERVAL_MS / 1000} s d'intervalle)`);

  let lastRequestAt = 0;
  const today = isoDay();
  for (let k = 0; k < todo.length; k += BATCH_SIZE) {
    const batch = todo.slice(k, k + BATCH_SIZE);
    const params = new URLSearchParams({ code: batch.join(','), fields: OFF_FIELDS.join(','), page_size: String(BATCH_SIZE) });
    const url = `${OFF_SEARCH_URL}?${params}`;
    const body = await getJsonWithRetry(url, op.OPEN_DATA_USER_AGENT, async () => {
      const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastRequestAt = Date.now();
    });
    const wanted = new Set(batch);
    const found = new Set();
    for (const p of Array.isArray(body?.products) ? body.products : []) {
      const ean = matchCode(String(p.code ?? ''), wanted);
      if (!ean) continue;
      const kept = {};
      for (const f of OFF_FIELDS) if (p[f] !== undefined && p[f] !== null && p[f] !== '') kept[f] = p[f];
      kept.code = ean;
      kept.fetchedAt = today;
      cache.products[ean] = kept;
      delete cache.missing[ean];
      found.add(ean);
    }
    for (const ean of batch) if (!found.has(ean)) cache.missing[ean] = today;
    writeFileSync(cacheFile, `${stableStringify(cache, 1)}\n`);
    console.log(`  lot ${k / BATCH_SIZE + 1} : ${found.size}/${batch.length} fiches`);
  }

  const missing = eans.filter((e) => !cache.products[e]);
  if (missing.length > 0) {
    console.log(section(`Codes-barres absents d'Open Food Facts (${missing.length})`));
    const byEan = new Map(refs.map((r) => [r.ean, r]));
    for (const e of missing) console.log(`  ${e}  ${byEan.get(e)?.ingredientId} (${byEan.get(e)?.role})`);
  }
}

/** Code renvoyé par OFF → code demandé (OFF peut ajouter / retirer des zéros initiaux). */
function matchCode(code, wanted) {
  if (wanted.has(code)) return code;
  const bare = code.replace(/^0+/, '');
  for (const w of wanted) if (w.replace(/^0+/, '') === bare) return w;
  return null;
}

/** GET JSON avec reprise sur 429 / 5xx / erreur réseau (attente croissante, Retry-After respecté). */
async function getJsonWithRetry(url, userAgent, beforeRequest) {
  for (let attempt = 0; ; attempt++) {
    await beforeRequest();
    let status = 0;
    let retryAfter = null;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
      status = res.status;
      if (res.ok) {
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch {
          status = 503; // page HTML « temporarily unavailable » servie en 200
        }
      } else {
        retryAfter = Number(res.headers.get('retry-after')) || null;
        await res.body?.cancel();
        if (status !== 429 && status < 500) throw new Error(`HTTP ${status} : ${url.slice(0, 120)}…`);
      }
    } catch (err) {
      if (status && status !== 429 && status < 500) throw err;
      if (!status) console.log(`  réseau : ${err.message}`);
    }
    if (attempt >= RETRY_WAITS_S.length) throw new Error(`Abandon après ${attempt + 1} essais (HTTP ${status || 'réseau'})`);
    const waitS = Math.max(RETRY_WAITS_S[attempt], retryAfter ?? 0);
    console.log(`  HTTP ${status || 'réseau'} — nouvel essai dans ${waitS} s`);
    await sleep(waitS * 1000);
  }
}

// Lancement en fin de module (les constantes ci-dessus sont alors initialisées).
if (!reexecWithEnvProxy()) await main();

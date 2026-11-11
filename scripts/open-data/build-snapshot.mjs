#!/usr/bin/env node
/**
 * Étape 2 du pipeline : instantané versionné des données ouvertes.
 *
 * Lit en flux les exports Open Prices (`.cache/open-data/`, voir fetch.mjs),
 * joint les lieux, applique `normalizeObservation` (TOUS les filtres
 * obligatoires, fenêtre de 365 j jusqu'à la date de l'instantané) puis écrit
 * `src/data/openData/snapshot.json` (déterministe, clés triées) :
 *  - `chainIndex` : indice de prix de chaque enseigne (Leclerc = 1), mesuré
 *    sur TOUS les codes-barres FR communs (médianes hors proximité) ;
 *  - `aggregates` : pour chaque clé du catalogue (codes-barres de
 *    productSources, catégories vrac), le prix national de chaque enseigne ;
 *  - `offProducts` : champs utiles des fiches Open Food Facts (nom, marque,
 *    contenance, Nutri-Score, allergènes mappés, bio).
 * Jamais de champ `owner` ni de relevé individuel. Un rapport de relecture
 * (fiches manquantes, produits sans relevé, allergènes à vérifier) est
 * affiché sur la sortie standard.
 *
 * Usage :
 *   npm run data:snapshot
 *   node scripts/open-data/build-snapshot.mjs [--date YYYY-MM-DD]
 *     [--sources fichier.json --out instantane.json] [--cache-dir dossier]
 */
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { createGunzip } from 'node:zlib';

import {
  absPath,
  addDays,
  DEFAULT_CACHE_DIR,
  DEFAULT_SNAPSHOT_PATH,
  importSrc,
  isoDay,
  loadOpenPrices,
  loadSources,
  looseKeys,
  readJsonIfExists,
  ROOT,
  section,
  sourceEanRefs,
  stableStringify,
} from './lib.mjs';

const WINDOW_DAYS = 365;
const ORGANIC_LABELS = new Set(['en:organic', 'en:eu-organic', 'fr:ab-agriculture-biologique']);
/** Champs de lieu utiles aux filtres (le reste de l'export n'est pas lu). */
const LOCATION_FIELDS = [
  'osm_brand',
  'osm_name',
  'osm_address_country_code',
  'osm_address_country',
  'osm_address_postcode',
  'osm_tag_value',
];

const { values: args } = parseArgs({
  options: {
    sources: { type: 'string' },
    out: { type: 'string' },
    date: { type: 'string' },
    'cache-dir': { type: 'string' },
  },
});

if (args.sources && !args.out) {
  console.error('✗ --sources exige --out : on n’écrase pas l’instantané du catalogue avec une liste de test.');
  process.exit(1);
}

const op = await loadOpenPrices();
const { ingredients } = await importSrc('src/data/ingredients.ts');
const { sources, origin } = await loadSources(args.sources);
const cacheDir = args['cache-dir'] ? absPath(args['cache-dir']) : DEFAULT_CACHE_DIR;
const outFile = args.out ? absPath(args.out) : DEFAULT_SNAPSHOT_PATH;

const snapshotAt = args.date ?? isoDay();
if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotAt)) throw new Error(`--date invalide : ${snapshotAt}`);
const window = { from: addDays(snapshotAt, -WINDOW_DAYS), to: snapshotAt };

for (const f of ['prices.jsonl.gz', 'locations.jsonl.gz']) {
  if (!existsSync(join(cacheDir, f))) {
    console.error(`✗ ${join(cacheDir, f)} absent : lance d'abord npm run data:fetch`);
    process.exit(1);
  }
}

// ─── Clés du catalogue ───────────────────────────────────────────────────────

const eanRefs = sourceEanRefs(sources);
const wantedKeys = new Set();
for (const r of eanRefs) if (op.isValidGtin(r.ean)) wantedKeys.add(op.eanKey(r.ean));
for (const s of sources) for (const k of looseKeys(s.loose, op.categoryKey)) wantedKeys.add(k);

// ─── Lecture des exports ─────────────────────────────────────────────────────

/** Itère les lignes JSON d'un export .jsonl.gz. */
async function* readJsonl(file) {
  const rl = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) yield JSON.parse(line);
}

const locations = new Map();
let locationCount = 0;
for await (const loc of readJsonl(join(cacheDir, 'locations.jsonl.gz'))) {
  locationCount++;
  const kept = {};
  for (const f of LOCATION_FIELDS) kept[f] = loc[f] ?? null;
  // Pré-filtre (normalizeObservation revérifie tout).
  if (!op.isFranceMetro(kept) || !op.detectChain(kept)) continue;
  locations.set(loc.id, kept);
}

/** clé d'agrégat → enseigne → relevés. */
const byKey = new Map();
/** code-barres → enseigne → prix normaux hors proximité (indice d'enseigne). */
const forIndex = new Map();
const stats = { rows: 0, kept: 0, byChain: {}, maxCreated: '' };
/** Lieux ayant fourni au moins un relevé RETENU (les « magasins » de l'instantané). */
const usedLocations = new Set();
for (const chain of op.OPEN_DATA_CHAINS) stats.byChain[chain] = { observations: 0, products: new Set() };

for await (const row of readJsonl(join(cacheDir, 'prices.jsonl.gz'))) {
  stats.rows++;
  if (typeof row.created === 'string' && row.created > stats.maxCreated) stats.maxCreated = row.created;
  const location = locations.get(row.location_id ?? row.location);
  if (!location) continue;
  // Objet construit champ par champ : le pseudonyme `owner` n'est jamais lu.
  const raw = {
    type: row.type,
    product_code: row.product_code,
    category_tag: row.category_tag,
    labels_tags: row.labels_tags,
    origins_tags: row.origins_tags,
    price: row.price,
    price_is_discounted: row.price_is_discounted,
    price_without_discount: row.price_without_discount,
    price_per: row.price_per,
    currency: row.currency,
    date: row.date,
    receipt_quantity: row.receipt_quantity,
    duplicate_of: row.duplicate_of,
    location,
  };
  const obs = op.normalizeObservation(raw, window);
  if (!obs) continue;
  stats.kept++;
  usedLocations.add(row.location_id ?? row.location);
  const chainStats = stats.byChain[obs.chain];
  chainStats.observations++;
  if (obs.pricePer === null) {
    chainStats.products.add(obs.key);
    if (!obs.proximity) {
      let chains = forIndex.get(obs.key);
      if (!chains) forIndex.set(obs.key, (chains = {}));
      (chains[obs.chain] ??= []).push(obs.regularEur);
    }
  }
  const key = op.aggregateKey(obs);
  if (!wantedKeys.has(key)) continue;
  let chains = byKey.get(key);
  if (!chains) byKey.set(key, (chains = new Map()));
  const list = chains.get(obs.chain);
  if (list) list.push(obs);
  else chains.set(obs.chain, [obs]);
}

// ─── Indice d'enseigne ───────────────────────────────────────────────────────

const medians = [];
for (const chains of forIndex.values()) {
  const row = {};
  for (const [chain, values] of Object.entries(chains)) row[chain] = op.median(values);
  medians.push(row);
}
const chainIndex = op.computeChainIndex(medians);

// ─── Agrégats du catalogue ───────────────────────────────────────────────────

const aggregates = {};
for (const key of [...wantedKeys].sort()) {
  const chains = byKey.get(key);
  if (!chains) continue;
  const perChain = {};
  for (const chain of op.OPEN_DATA_CHAINS) {
    const agg = op.aggregateObservations(chains.get(chain) ?? []);
    if (agg) perChain[chain] = agg;
  }
  aggregates[key] = perChain;
}

// ─── Fiches Open Food Facts ──────────────────────────────────────────────────

const offCache = readJsonIfExists(join(cacheDir, 'off-products.json'), { products: {} });

/** Texte nettoyé (espaces) ou undefined. */
function clean(text) {
  if (typeof text !== 'string') return undefined;
  const t = text.replace(/\s+/g, ' ').trim();
  return t || undefined;
}

function nonEmpty(list) {
  return list.length > 0 ? list : undefined;
}

/** Champs utiles d'une fiche OFF, déjà normalisés par core/openPrices. */
function offInfo(p) {
  const quantity = op.parseOffQuantity(p);
  const allergens = op.mapOffAllergens(Array.isArray(p.allergens_tags) ? p.allergens_tags : []);
  const traces = op.mapOffAllergens(Array.isArray(p.traces_tags) ? p.traces_tags : []);
  const grade = typeof p.nutriscore_grade === 'string' ? p.nutriscore_grade.trim().toLowerCase() : '';
  const modified = Number(p.last_modified_t);
  return {
    name: clean(p.product_name_fr) ?? clean(p.product_name),
    brands: clean(p.brands),
    quantity: clean(p.quantity),
    size: quantity?.size,
    unit: quantity?.unit,
    nutriScore: /^[a-e]$/.test(grade) ? grade.toUpperCase() : undefined,
    allergens: allergens.allergens,
    allergensUnknown: nonEmpty(allergens.unknown),
    traces: nonEmpty(traces.allergens),
    tracesUnknown: nonEmpty(traces.unknown),
    organic: (Array.isArray(p.labels_tags) ? p.labels_tags : []).some((t) => ORGANIC_LABELS.has(String(t).toLowerCase())) || undefined,
    lastModified: modified > 0 ? isoDay(new Date(modified * 1000)) : undefined,
  };
}

const offProducts = {};
for (const r of eanRefs) {
  const p = offCache.products?.[r.ean];
  if (p) offProducts[r.ean] = offInfo(p);
}

// ─── Écriture ────────────────────────────────────────────────────────────────

const byChainOut = {};
for (const chain of op.OPEN_DATA_CHAINS) {
  byChainOut[chain] = { observations: stats.byChain[chain].observations, products: stats.byChain[chain].products.size };
}
const snapshot = {
  schemaVersion: 1,
  snapshotAt,
  pricesFrom: window.from,
  pricesTo: window.to,
  source: {
    prices: op.OPEN_PRICES_DUMP_URLS.prices,
    locations: op.OPEN_PRICES_DUMP_URLS.locations,
    lastContributionAt: stats.maxCreated.slice(0, 10) || null,
    // Horodatage exact du relevé le plus récent de l'export : borne de l'instantané
    // (curseur initial de la collecte, purge des relevés déjà inclus).
    lastCreatedAt: stats.maxCreated || null,
  },
  // Nombre de magasins seulement (aucun identifiant de lieu ni de contributeur).
  stats: { observations: stats.kept, stores: usedLocations.size, byChain: byChainOut },
  chainIndex,
  offProducts,
  aggregates,
};
const json = `${stableStringify(snapshot, 2)}\n`;
if (/"owner"\s*:/.test(json)) throw new Error('Champ owner détecté dans l’instantané : écriture refusée.');
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, json);

// ─── Rapport de relecture ────────────────────────────────────────────────────

const ingredientsById = new Map(ingredients.map((i) => [i.id, i]));
const pct = (n, d) => (d > 0 ? `${Math.round((100 * n) / d)} %` : '—');
const out = [];
out.push(section('Instantané'));
out.push(`  ${relative(ROOT, outFile)} — ${(json.length / 1024).toFixed(0)} Ko`);
out.push(`  fenêtre ${window.from} → ${window.to} · ${stats.rows} relevés lus, ${stats.kept} retenus (FR métropole, 10 enseignes)`);
out.push(
  `  ${locationCount} lieux, ${locations.size} lieux candidats (FR métropole, 10 enseignes), ` +
    `${usedLocations.size} magasins avec relevés retenus · dernier relevé ${snapshot.source.lastCreatedAt}`,
);
out.push(`  sources : ${origin} — ${sources.length} ingrédients, ${eanRefs.length} codes-barres, ${wantedKeys.size} clés`);

out.push(section('Indice de prix (Leclerc = 1)'));
for (const chain of op.OPEN_DATA_CHAINS) {
  const ix = chainIndex[chain];
  const s = byChainOut[chain];
  out.push(
    `  ${chain.padEnd(12)} ${ix.value.toFixed(3)}  ${ix.basis.padEnd(8)} ${String(ix.commonProducts).padStart(5)} communs · ` +
      `${s.observations} relevés, ${s.products} codes-barres`,
  );
}

const noFiche = eanRefs.filter((r) => op.isValidGtin(r.ean) && !offProducts[r.ean]);
const invalid = eanRefs.filter((r) => !op.isValidGtin(r.ean));
const noPrice = eanRefs.filter((r) => op.isValidGtin(r.ean) && !aggregates[op.eanKey(r.ean)]);
const report = (title, lines) => {
  out.push(section(`${title} (${lines.length})`));
  if (lines.length === 0) out.push('  aucun');
  for (const l of lines) out.push(`  ${l}`);
};
report('Codes-barres invalides', invalid.map((r) => `${r.ean}  ${r.ingredientId} (${r.role})`));
report("Codes-barres sans fiche Open Food Facts (npm run data:fetch)", noFiche.map((r) => `${r.ean}  ${r.ingredientId} (${r.role})`));
report(
  'Codes-barres sans aucun relevé',
  noPrice.map((r) => `${r.ean}  ${r.ingredientId} (${r.role})`),
);
const looseNoPrice = [];
for (const s of sources) {
  if (!s.loose) continue;
  const keys = looseKeys(s.loose, op.categoryKey);
  if (!keys.some((k) => aggregates[k])) looseNoPrice.push(`${s.ingredientId}  ${keys.join(', ')}`);
}
report('Vrac sans aucun relevé', looseNoPrice);

const unknownAllergens = [];
const extraAllergens = [];
const noSize = [];
for (const s of sources) {
  const ing = ingredientsById.get(s.ingredientId);
  const refs = [s.national, s.bio, ...(s.mdd ?? [])].filter(Boolean);
  for (const ref of refs) {
    const info = offProducts[ref.ean];
    if (!info) continue;
    if (info.allergensUnknown) unknownAllergens.push(`${ref.ean}  ${s.ingredientId} : ${info.allergensUnknown.join(' | ')}`);
    const extra = info.allergens.filter((a) => !ing?.allergens.includes(a));
    if (extra.length > 0) extraAllergens.push(`${ref.ean}  ${s.ingredientId} : ${extra.join(', ')} (ajoutés au produit)`);
    if (info.size === undefined && ref.packSize === undefined) noSize.push(`${ref.ean}  ${s.ingredientId} : « ${info.quantity ?? ''} »`);
  }
  if (!ing) unknownAllergens.push(`(ingrédient inconnu : ${s.ingredientId})`);
}
report('Allergènes Open Food Facts non reconnus — à relire', unknownAllergens);
report("Allergènes Open Food Facts absents de l'ingrédient — à relire", extraAllergens);
report('Contenance illisible sans surcharge packSize', noSize);

const eanCovered = eanRefs.length - noPrice.length - invalid.length;
out.push(section('Couverture'));
out.push(`  codes-barres avec ≥ 1 relevé : ${eanCovered}/${eanRefs.length} (${pct(eanCovered, eanRefs.length)})`);
console.log(out.join('\n'));

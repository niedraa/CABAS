/**
 * Outils communs du pipeline de données ouvertes (scripts/open-data/).
 *
 * Node pur, sans dépendance : les fichiers .ts de src/ (qui n'importent que
 * des types) sont chargés par « type stripping » (Node ≥ 22.18).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULT_CACHE_DIR = join(ROOT, '.cache', 'open-data');
export const DEFAULT_SNAPSHOT_PATH = join(ROOT, 'src', 'data', 'openData', 'snapshot.json');

/** Chemin absolu (relatif au répertoire courant). */
export function absPath(p) {
  return isAbsolute(p) ? p : resolve(process.cwd(), p);
}

/** Charge un module TypeScript de src/ (imports de types uniquement). */
export async function importSrc(relativePath) {
  return import(pathToFileURL(join(ROOT, relativePath)).href);
}

/** Fonctions pures partagées avec l'app et les Edge Functions. */
export async function loadOpenPrices() {
  return importSrc('src/core/openPrices.ts');
}

/**
 * Sources produits : `src/data/productSources.ts`, ou un fichier JSON
 * (même format, tableau d'`IngredientSource`) passé par `--sources` pour
 * valider le pipeline sans toucher au catalogue.
 */
export async function loadSources(sourcesPath) {
  if (sourcesPath) {
    const file = absPath(sourcesPath);
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const list = Array.isArray(parsed) ? parsed : parsed.productSources;
    if (!Array.isArray(list)) throw new Error(`${file} : tableau d'IngredientSource attendu`);
    return { sources: list, origin: file };
  }
  const mod = await importSrc('src/data/productSources.ts');
  return { sources: mod.productSources, origin: 'src/data/productSources.ts' };
}

/** Références à code-barres d'une liste de sources : { ean, ingredientId, role }. */
export function sourceEanRefs(sources) {
  const refs = [];
  for (const s of sources) {
    if (s.national) refs.push({ ean: s.national.ean, ingredientId: s.ingredientId, role: 'national' });
    if (s.bio) refs.push({ ean: s.bio.ean, ingredientId: s.ingredientId, role: 'bio' });
    for (const m of s.mdd ?? []) refs.push({ ean: m.ean, ingredientId: s.ingredientId, role: `mdd ${(m.chains ?? []).join('+')}` });
  }
  return refs;
}

/** Clés d'agrégats vrac d'une source (`cat:<tag>:<KILOGRAM|UNIT>[:organic]`). */
export function looseKeys(loose, categoryKey) {
  if (!loose) return [];
  return (loose.categoryTags ?? []).map(
    (tag) => `${categoryKey(String(tag).trim().toLowerCase(), loose.pricePer)}${loose.organic ? ':organic' : ''}`,
  );
}

/** Jour UTC (YYYY-MM-DD). */
export function isoDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** Décale un jour ISO de `days` jours. */
export function addDays(day, days) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDay(d);
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * JSON déterministe : clés triées ; objets indentés jusqu'à `prettyDepth`,
 * compacts au-delà (une ligne par produit / par clé d'agrégat → diffs lisibles).
 */
export function stableStringify(value, prettyDepth = 2, depth = 0) {
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v, prettyDepth, depth + 1)).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort();
    if (keys.length === 0) return '{}';
    const entries = keys.map((k) => `${JSON.stringify(k)}:${depth < prettyDepth ? ' ' : ''}${stableStringify(value[k], prettyDepth, depth + 1)}`);
    if (depth >= prettyDepth) return `{${entries.join(',')}}`;
    const pad = '  '.repeat(depth + 1);
    return `{\n${entries.map((e) => pad + e).join(',\n')}\n${'  '.repeat(depth)}}`;
  }
  return JSON.stringify(value);
}

/**
 * Le `fetch` intégré de Node n'utilise HTTPS_PROXY qu'avec NODE_USE_ENV_PROXY=1
 * (Node ≥ 22.21) : derrière un proxy, on relance le script avec cette variable.
 * Renvoie `true` si le processus courant doit s'arrêter (relancé).
 */
export function reexecWithEnvProxy() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!proxy || process.env.NODE_USE_ENV_PROXY) return false;
  const res = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' },
  });
  process.exitCode = res.status ?? 1;
  return true;
}

/** Lit un JSON s'il existe. */
export function readJsonIfExists(file, fallback) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
}

/** Ligne de rapport alignée. */
export function section(title) {
  return `\n── ${title} ${'─'.repeat(Math.max(3, 72 - title.length))}`;
}

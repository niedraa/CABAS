#!/usr/bin/env node
/**
 * Copie la logique métier pure (`src/core/*.ts`) dans les Edge Functions Deno
 * (`supabase/functions/_shared/core/`).
 *
 * - Les tests (`__tests__`) ne sont pas copiés.
 * - Les imports relatifs sans extension (`./units`) sont réécrits avec `.ts`
 *   (Deno exige des spécificateurs complets).
 * - Chaque fichier reçoit un en-tête « GENERATED — do not edit ».
 * - Idempotent : un fichier identique n'est pas réécrit ; les fichiers qui
 *   n'existent plus dans `src/core` sont supprimés de la copie.
 *
 * Usage : `node scripts/sync-shared.mjs` (ou `npm run sync:shared`).
 *         `node scripts/sync-shared.mjs --check` : code de sortie 1 si la copie
 *         n'est pas à jour (utile en CI), sans rien écrire.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src', 'core');
const DEST = join(ROOT, 'supabase', 'functions', '_shared', 'core');
const CHECK_ONLY = process.argv.includes('--check');

const HEADER = [
  '// GENERATED — do not edit.',
  '// Copie générée de src/core par scripts/sync-shared.mjs (npm run sync:shared).',
  '// Toute modification doit être faite dans src/core puis resynchronisée.',
  '',
].join('\n');

/**
 * Ajoute `.ts` aux spécificateurs relatifs sans extension, dans les formes :
 * `import … from './x'`, `export … from './x'`, `import './x'`, `import('./x')`.
 */
export function rewriteImports(source) {
  const addExt = (spec) => (/\.[cm]?[jt]sx?$/.test(spec) ? spec : `${spec}.ts`);
  return source
    .replace(/(\bfrom\s*)(['"])(\.{1,2}\/[^'"]+)\2/g, (_m, pre, q, spec) => `${pre}${q}${addExt(spec)}${q}`)
    .replace(/(\bimport\s*)(['"])(\.{1,2}\/[^'"]+)\2/g, (_m, pre, q, spec) => `${pre}${q}${addExt(spec)}${q}`)
    .replace(/(\bimport\s*\(\s*)(['"])(\.{1,2}\/[^'"]+)\2/g, (_m, pre, q, spec) => `${pre}${q}${addExt(spec)}${q}`);
}

/** Liste récursive des fichiers .ts de src/core, hors __tests__ et *.test.ts. */
function listSources(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === '__mocks__') continue;
      out.push(...listSources(full));
    } else if (name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function listExisting(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listExisting(full));
    else out.push(full);
  }
  return out;
}

function main() {
  const sources = listSources(SRC);
  const expected = new Set();
  let written = 0;
  let unchanged = 0;
  let stale = 0;

  for (const file of sources) {
    const rel = relative(SRC, file);
    const target = join(DEST, rel);
    expected.add(target);
    const content = HEADER + rewriteImports(readFileSync(file, 'utf8'));
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    if (current === content) {
      unchanged++;
      continue;
    }
    stale++;
    if (!CHECK_ONLY) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
      written++;
    }
  }

  // Fichiers orphelins (supprimés de src/core).
  let removed = 0;
  for (const file of listExisting(DEST)) {
    if (expected.has(file)) continue;
    stale++;
    if (!CHECK_ONLY) {
      rmSync(file);
      removed++;
    }
  }

  if (CHECK_ONLY) {
    if (stale > 0) {
      console.error(`✗ supabase/functions/_shared/core n'est pas à jour (${stale} fichier(s)). Lance : npm run sync:shared`);
      process.exit(1);
    }
    console.log(`✓ supabase/functions/_shared/core à jour (${unchanged} fichiers).`);
    return;
  }
  console.log(`sync-shared : ${written} écrit(s), ${unchanged} inchangé(s), ${removed} supprimé(s) → ${relative(ROOT, DEST)}`);
}

// Exécuté directement (et non importé par un test).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

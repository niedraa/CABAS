#!/usr/bin/env node
/**
 * Génère le registre des médias embarqués à partir des fichiers :
 *  - assets/images/recipes/<recipeId>.jpg + assets/images/recipes/credits.json
 *    → src/theme/media/recipePhotos.generated.ts
 *  - assets/images/stores/<chain>.png → src/theme/media/storeLogos.generated.ts
 *
 * Usage : node scripts/build-media.mjs [--check]
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const recipesDir = join(ROOT, 'assets/images/recipes');
const storesDir = join(ROOT, 'assets/images/stores');
const outDir = join(ROOT, 'src/theme/media');

const credits = existsSync(join(recipesDir, 'credits.json')) ? JSON.parse(readFileSync(join(recipesDir, 'credits.json'), 'utf8')) : {};
const photos = readdirSync(recipesDir).filter((f) => f.endsWith('.jpg')).map((f) => f.replace(/\.jpg$/, '')).sort();
for (const id of photos) if (!credits[id]) throw new Error(`Crédit manquant pour la photo ${id}`);
const logos = existsSync(storesDir) ? readdirSync(storesDir).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, '')).sort() : [];

const recipeTs = `/** ⚠️ FICHIER GÉNÉRÉ (scripts/build-media.mjs) — photos de plats embarquées. */
export interface PhotoCredit {
  author: string;
  license: string;
  licenseUrl: string;
  source: string;
}

export const recipePhotos: Record<string, number> = {
${photos.map((id) => `  ${id}: require('../../../assets/images/recipes/${id}.jpg'),`).join('\n')}
};

export const recipePhotoCredits: Record<string, PhotoCredit> = {
${photos.map((id) => `  ${id}: ${JSON.stringify({ author: credits[id].author, license: credits[id].license, licenseUrl: credits[id].licenseUrl, source: credits[id].source })},`).join('\n')}
};
`;
const storeTs = `/** ⚠️ FICHIER GÉNÉRÉ (scripts/build-media.mjs) — logos des enseignes embarqués. */
export const storeLogos: Record<string, number> = {
${logos.map((id) => `  ${id}: require('../../../assets/images/stores/${id}.png'),`).join('\n')}
};
`;

const files = [
  [join(outDir, 'recipePhotos.generated.ts'), recipeTs],
  [join(outDir, 'storeLogos.generated.ts'), storeTs],
];
let stale = false;
for (const [path, content] of files) {
  const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (current === content) continue;
  stale = true;
  if (!CHECK) writeFileSync(path, content);
}
if (CHECK && stale) {
  console.error('Registre des médias obsolète : lance `node scripts/build-media.mjs`.');
  process.exit(1);
}
console.log(`build-media : ${photos.length} photos, ${logos.length} logos`);

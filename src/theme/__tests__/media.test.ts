import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { recipes } from '@/data';
import { recipePhotoCredits, recipePhotos, storeLogos } from '@/theme';
import { STORE_CHAINS } from '@/core';

describe('médias embarqués', () => {
  const recipeIds = new Set(recipes.map((r) => r.id));

  it('chaque photo illustre une recette existante et porte son crédit (licence libre)', () => {
    // Toutes les recettes ont leur photo.
    expect(recipes.filter((r) => !recipePhotos[r.id]).map((r) => r.id)).toEqual([]);
    for (const id of Object.keys(recipePhotos)) {
      expect(recipeIds.has(id)).toBe(true);
      const credit = recipePhotoCredits[id];
      expect(credit.author.trim().length).toBeGreaterThan(1);
      expect(credit.license).toMatch(/^(CC0|CC BY|Public domain)/);
      expect(credit.license).not.toMatch(/NC|ND/);
      expect(credit.source).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    }
  });

  it('les logos correspondent à des enseignes connues', () => {
    for (const chain of Object.keys(storeLogos)) expect(STORE_CHAINS).toContain(chain);
  });

  it('le registre généré est à jour (scripts/build-media.mjs --check)', () => {
    expect(() => execFileSync(process.execPath, [join(__dirname, '../../../scripts/build-media.mjs'), '--check'], { stdio: 'pipe' })).not.toThrow();
  });
});

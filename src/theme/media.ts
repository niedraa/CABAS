/**
 * Médias embarqués de la DA (hors-ligne) : photos des plats et logos des
 * enseignes. Les fichiers `*.generated.ts` sont produits par
 * `scripts/build-media.mjs` à partir de `assets/images/{recipes,stores}/`.
 *
 * Photos : Wikimedia Commons, licences libres (CC0, CC BY, CC BY-SA, domaine
 * public) — auteur et licence affichés dans l'app (fiche recette, crédits).
 */

import { recipePhotoCredits, recipePhotos, type PhotoCredit } from './media/recipePhotos.generated';
import { storeLogos } from './media/storeLogos.generated';

export type { PhotoCredit };
export { recipePhotoCredits, recipePhotos, storeLogos };

export function recipePhoto(recipeId: string | undefined): number | null {
  return recipeId ? (recipePhotos[recipeId] ?? null) : null;
}

export function recipePhotoCredit(recipeId: string | undefined): PhotoCredit | null {
  return recipeId ? (recipePhotoCredits[recipeId] ?? null) : null;
}

export function storeLogo(chain: string | undefined): number | null {
  return chain ? (storeLogos[chain.toLowerCase()] ?? null) : null;
}

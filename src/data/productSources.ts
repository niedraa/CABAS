/**
 * Produits RÉELS retenus pour chaque ingrédient achetable — source du catalogue.
 *
 * Choisis à la main (avec relecture) parmi les produits Open Food Facts vendus
 * en France et relevés dans Open Prices. Le pipeline d'import
 * (`scripts/open-data/`) récupère les fiches produit (nom, contenance,
 * Nutri-Score, allergènes) et les prix relevés ; le générateur
 * (`src/data/generator/run.mjs`) en tire `products.ts`, `prices.ts` et `meta.ts`.
 *
 * Règles :
 * - `ean` : code-barres réel (GTIN-13 ou GTIN-8, clé valide, jamais un code
 *   « poids variable » commençant par 2) ;
 * - au moins un de `national`, `mdd` ou `loose` par ingrédient achetable ;
 * - une MDD n'est vendue que dans ses `chains` (Mousquetaires : intermarche + netto) ;
 * - `packSize` / `packUnit` ne servent qu'à corriger une contenance Open Food
 *   Facts absente ou fausse, exprimée dans l'unité de base de l'ingrédient ;
 * - `loose` : vrac sans code-barres, prix Open Prices « par catégorie »
 *   (`KILOGRAM` pour un ingrédient en g, `UNIT` pour un ingrédient à la pièce).
 *
 * Données Open Food Facts / Open Prices : licence ODbL (voir DATA_LICENSE.md).
 * Ce fichier ne contient que des imports de types (chargeable par Node).
 */
import type { BaseUnit, StoreChain } from '../core/types';

export interface ProductRef {
  /** Code-barres réel du produit. */
  ean: string;
  /** Libellé court affiché (défaut : nom Open Food Facts nettoyé). */
  name?: string;
  /** Contenance corrigée, dans l'unité de base de l'ingrédient. */
  packSize?: number;
  packUnit?: BaseUnit;
}

export interface StoreBrandRef extends ProductRef {
  /** Enseignes qui vendent cette MDD. */
  chains: StoreChain[];
}

export interface LooseRef {
  /** Catégories Open Food Facts des relevés vrac (ex. `en:tomatoes`), par ordre de préférence. */
  categoryTags: string[];
  /** Relevés au kilo (ingrédient en g) ou à la pièce (ingrédient à la pièce). */
  pricePer: 'KILOGRAM' | 'UNIT';
  /** Libellé affiché (ex. « Tomates, en vrac »). */
  name: string;
  /** Ne retenir que les relevés bio. */
  organic?: boolean;
}

export interface IngredientSource {
  ingredientId: string;
  /** Marque nationale (vendue dans plusieurs enseignes). */
  national?: ProductRef;
  /** Variante bio (marque nationale ou bio générique). */
  bio?: ProductRef;
  /** Marques distributeur, une entrée par produit. */
  mdd?: StoreBrandRef[];
  /** Vrac (fruits, légumes) : prix par catégorie. */
  loose?: LooseRef;
  /** Remarque de relecture (choix, limites). */
  note?: string;
}

export const productSources: IngredientSource[] = [];

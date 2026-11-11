// GENERATED — do not edit.
// Copie générée de src/core par scripts/sync-shared.mjs (npm run sync:shared).
// Toute modification doit être faite dans src/core puis resynchronisée.
/**
 * Libellés français des référentiels du domaine (affichage UI, raisons,
 * messages d'erreur). Une seule source pour l'app et les Edge Functions.
 */
import type { Aisle, Allergen, Cuisine, Diet, Equipment, MealType, OrderChannel, Store, StoreChain } from './types.ts';

export const ALLERGEN_LABELS: Record<Allergen, string> = {
  gluten: 'Gluten',
  crustaces: 'Crustacés',
  oeufs: 'Œufs',
  poissons: 'Poissons',
  arachides: 'Arachides',
  soja: 'Soja',
  lait: 'Lait',
  fruits_a_coque: 'Fruits à coque',
  celeri: 'Céleri',
  moutarde: 'Moutarde',
  sesame: 'Sésame',
  sulfites: 'Sulfites',
  lupin: 'Lupin',
  mollusques: 'Mollusques',
};

export const DIET_LABELS: Record<Diet, string> = {
  vegetarien: 'Végétarien',
  vegan: 'Vegan',
  pescetarien: 'Pescétarien',
  halal: 'Halal',
  casher: 'Casher',
  sans_porc: 'Sans porc',
  sans_gluten: 'Sans gluten',
  sans_lactose: 'Sans lactose',
};

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  four: 'Four',
  plaques: 'Plaques de cuisson',
  micro_ondes: 'Micro-ondes',
  mixeur: 'Mixeur',
  robot: 'Robot cuiseur',
  cocotte_minute: 'Cocotte-minute',
  friteuse_air: 'Friteuse à air',
  barbecue: 'Barbecue',
};

export const AISLE_LABELS: Record<Aisle, string> = {
  fruits_legumes: 'Fruits & légumes',
  boulangerie: 'Boulangerie',
  boucherie: 'Boucherie',
  poissonnerie: 'Poissonnerie',
  cremerie: 'Crèmerie',
  epicerie_salee: 'Épicerie salée',
  condiments: 'Condiments & épices',
  epicerie_sucree: 'Épicerie sucrée',
  surgeles: 'Surgelés',
  boissons: 'Boissons',
  hygiene_maison: 'Hygiène & maison',
  autre: 'Autre',
};

export const CUISINE_LABELS: Record<Cuisine, string> = {
  francaise: 'Française',
  italienne: 'Italienne',
  mediterraneenne: 'Méditerranéenne',
  asiatique: 'Asiatique',
  orientale: 'Orientale',
  mexicaine: 'Mexicaine',
  indienne: 'Indienne',
  americaine: 'Américaine',
  monde: 'Du monde',
};

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  dejeuner: 'Midi',
  diner: 'Soir',
};

/** Nom officiel de chaque enseigne (titres, listes, ticket). */
export const STORE_CHAIN_LABELS: Record<StoreChain, string> = {
  leclerc: 'E.Leclerc',
  carrefour: 'Carrefour',
  auchan: 'Auchan',
  intermarche: 'Intermarché',
  superu: 'Super U',
  lidl: 'Lidl',
  aldi: 'Aldi',
  netto: 'Netto',
  monoprix: 'Monoprix',
  franprix: 'Franprix',
};

export type StoreChainGroupId = 'hyper' | 'discount' | 'proximite';

/** Familles d'enseignes (sélecteur de magasins, sources), dans l'ordre de `STORE_CHAINS`. */
export const STORE_CHAIN_GROUPS: readonly { id: StoreChainGroupId; label: string; chains: readonly StoreChain[] }[] = [
  { id: 'hyper', label: 'Hypers & supers', chains: ['leclerc', 'carrefour', 'auchan', 'intermarche', 'superu'] },
  { id: 'discount', label: 'Discount', chains: ['lidl', 'aldi', 'netto'] },
  { id: 'proximite', label: 'Proximité', chains: ['monoprix', 'franprix'] },
];

/**
 * Nom d'une enseigne — LE helper unique de l'app (et des Edge Functions).
 * - `full` (défaut) : nom officiel (« E.Leclerc », « Super U ») ;
 * - `short` : comme on le dit dans une phrase (« chez Leclerc »).
 * Enseigne inconnue (ancien cache, magasin saisi à la main) : son nom sans le
 * suffixe « Drive » ; aucun magasin : `fallback` (« l’enseigne »).
 */
export function storeDisplayName(
  store: Pick<Store, 'chain' | 'name'> | null | undefined,
  opts: { short?: boolean; fallback?: string } = {},
): string {
  if (!store) return opts.fallback ?? 'l’enseigne';
  const known = (STORE_CHAIN_LABELS as Record<string, string | undefined>)[store.chain];
  const base = (known ?? String(store.name ?? '').replace(/\s+drive$/i, '').trim()) || (opts.fallback ?? 'l’enseigne');
  return opts.short ? base.replace(/^E\.\s?/, '') : base;
}

/**
 * Service réellement rendu par un magasin pour le canal : « Drive »,
 * « Click & collect », « En magasin » (enseigne sans retrait en ligne :
 * Lidl, Aldi, Netto) ou « Livraison ».
 */
export function storeServiceLabel(store: Partial<Pick<Store, 'pickup'>> | null | undefined, channel: OrderChannel): string {
  if (channel === 'delivery') return 'Livraison';
  if (store?.pickup === 'click_collect') return 'Click & collect';
  if (store?.pickup === 'none') return 'En magasin';
  return 'Drive';
}

/** Courses en magasin (aucun retrait en ligne, pas de livraison) : ni « commande » ni « frais de retrait ». */
export function isInStoreOnly(store: Partial<Pick<Store, 'pickup'>> | null | undefined, channel: OrderChannel): boolean {
  return channel !== 'delivery' && store?.pickup === 'none';
}

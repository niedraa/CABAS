/**
 * Libellés français des référentiels du domaine (affichage UI, raisons,
 * messages d'erreur). Une seule source pour l'app et les Edge Functions.
 */
import type { Aisle, Allergen, Cuisine, Diet, Equipment, MealType, StoreChain } from './types';

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

export const STORE_CHAIN_LABELS: Record<StoreChain, string> = {
  leclerc: 'E.Leclerc',
  carrefour: 'Carrefour',
  auchan: 'Auchan',
  intermarche: 'Intermarché',
  lidl: 'Lidl',
  monoprix: 'Monoprix',
};

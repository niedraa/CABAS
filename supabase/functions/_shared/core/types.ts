// GENERATED — do not edit.
// Copie générée de src/core par scripts/sync-shared.mjs (npm run sync:shared).
// Toute modification doit être faite dans src/core puis resynchronisée.
/**
 * Modèle de domaine de Cabas.
 *
 * Ce fichier est PUR (aucun import React Native / Expo / Supabase) : il est
 * partagé tel quel avec les Edge Functions Deno (voir scripts/sync-shared.mjs).
 * Les montants sont TOUJOURS en centimes d'euro (entiers).
 * Les dates « jour » sont des chaînes ISO `YYYY-MM-DD` (heure locale).
 */

// ─── Référentiels ────────────────────────────────────────────────────────────

/** Les 14 allergènes majeurs réglementaires (règlement UE INCO 1169/2011). */
export const ALLERGENS = [
  'gluten',
  'crustaces',
  'oeufs',
  'poissons',
  'arachides',
  'soja',
  'lait',
  'fruits_a_coque',
  'celeri',
  'moutarde',
  'sesame',
  'sulfites',
  'lupin',
  'mollusques',
] as const;
export type Allergen = (typeof ALLERGENS)[number];

/** Régimes alimentaires gérés par le moteur de repas. */
export const DIETS = [
  'vegetarien',
  'vegan',
  'pescetarien',
  'halal',
  'casher',
  'sans_porc',
  'sans_gluten',
  'sans_lactose',
] as const;
export type Diet = (typeof DIETS)[number];

export const EQUIPMENT = [
  'four',
  'plaques',
  'micro_ondes',
  'mixeur',
  'robot',
  'cocotte_minute',
  'friteuse_air',
  'barbecue',
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

/** Rayons du magasin, dans l'ordre de parcours conseillé. */
export const AISLES = [
  'fruits_legumes',
  'boulangerie',
  'boucherie',
  'poissonnerie',
  'cremerie',
  'epicerie_salee',
  'condiments',
  'epicerie_sucree',
  'surgeles',
  'boissons',
  'hygiene_maison',
  'autre',
] as const;
export type Aisle = (typeof AISLES)[number];

export const CUISINES = [
  'francaise',
  'italienne',
  'mediterraneenne',
  'asiatique',
  'orientale',
  'mexicaine',
  'indienne',
  'americaine',
  'monde',
] as const;
export type Cuisine = (typeof CUISINES)[number];

/**
 * Unités de recette. Les unités « de masse/volume » sont convertibles entre
 * elles ; les unités « de cuisine » (cs, cc, pincee…) sont converties en g/ml
 * via la table de l'ingrédient ou des valeurs par défaut (voir core/units.ts).
 */
export const UNITS = [
  'g',
  'kg',
  'ml',
  'cl',
  'l',
  'piece',
  'cs', // cuillère à soupe
  'cc', // cuillère à café
  'pincee',
  'botte',
  'gousse',
  'tranche',
  'sachet',
  'boite',
] as const;
export type Unit = (typeof UNITS)[number];

/** Unités de base dans lesquelles toute quantité est normalisée. */
export type BaseUnit = 'g' | 'ml' | 'piece';

export type MealType = 'dejeuner' | 'diner';

/**
 * Enseignes couvertes (un « magasin » national par enseigne : `Store.id === chain`).
 * L'ordre est celui d'affichage par défaut (hypers, puis discount, puis proximité).
 */
export const STORE_CHAINS = [
  'leclerc',
  'carrefour',
  'auchan',
  'intermarche',
  'superu',
  'lidl',
  'aldi',
  'netto',
  'monoprix',
  'franprix',
] as const;
export type StoreChain = (typeof STORE_CHAINS)[number];

/** Mode de retrait proposé par l'enseigne (`none` : courses en magasin uniquement). */
export type PickupMode = 'drive' | 'click_collect' | 'none';

// ─── Profil ──────────────────────────────────────────────────────────────────

export interface Household {
  adults: number;
  /** Enfants de moins de 12 ans (comptent pour 0,6 portion). */
  children: number;
}

/** Créneaux de repas à planifier : jour de la semaine (0 = lundi) × type. */
export interface MealSlotPreference {
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  type: MealType;
}

export interface UserProfile {
  id: string;
  displayName: string;
  household: Household;
  diets: Diet[];
  allergens: Allergen[];
  /** Ingrédients exclus (ids d'ingrédients) — « je n'aime pas ». */
  dislikedIngredientIds: string[];
  favoriteCuisines: Cuisine[];
  /** Budget courses hebdomadaire, centimes. */
  weeklyBudgetCents: number;
  /** Temps max (prépa + cuisson) en semaine / week-end, minutes. */
  maxCookTimeWeekdayMin: number;
  maxCookTimeWeekendMin: number;
  equipment: Equipment[];
  /** Ids des magasins préférés (au moins 1). */
  preferredStoreIds: string[];
  /** Créneaux à planifier chaque semaine. */
  mealSlots: MealSlotPreference[];
  /** Consentement RGPD explicite pour les données de santé (allergies, régimes). */
  healthDataConsentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Catalogue ───────────────────────────────────────────────────────────────

export interface Ingredient {
  id: string;
  name: string;
  /** Pluriel affiché pour les quantités > 1 en pièces. */
  namePlural?: string;
  aisle: Aisle;
  allergens: Allergen[];
  /** Flags de régime (calculés à partir de l'origine de l'ingrédient). */
  isMeat: boolean;
  isPork: boolean;
  isFish: boolean;
  isSeafood: boolean;
  /** Produit d'origine animale (lait, œuf, miel, gélatine…) → exclu du régime vegan. */
  isAnimalProduct: boolean;
  /** Alcool (exclu des régimes halal). */
  isAlcohol?: boolean;
  /** Masse moyenne d'une pièce, en g (ex. oignon 110 g) — permet piece ↔ g. */
  gramsPerPiece?: number;
  /** Densité g/ml (défaut 1) — permet ml ↔ g. */
  density?: number;
  /** Unité de base dans laquelle la liste de courses l'exprime. */
  baseUnit: BaseUnit;
  /** Ingrédient de placard qu'on a souvent (sel, poivre, huile) : marqué « à vérifier ». */
  isPantryStaple?: boolean;
  /** Mois de saison (1-12), vide = toute l'année. */
  seasonMonths?: number[];
}

export interface RecipeIngredient {
  ingredientId: string;
  quantity: number;
  unit: Unit;
  optional?: boolean;
  /** Ex. « émincé », « en dés ». */
  note?: string;
}

export interface RecipeStep {
  text: string;
  /** Minuteur proposé pour l'étape, minutes. */
  timerMin?: number;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  /** Emoji « vignette » (les photos réelles viennent de Storage en prod). */
  emoji: string;
  /** Couleur de fond de la vignette (hex). */
  color: string;
  imageUrl?: string;
  cuisine: Cuisine;
  tags: string[];
  mealTypes: MealType[];
  /** Nombre de portions pour lesquelles les quantités sont écrites. */
  servings: number;
  prepTimeMin: number;
  cookTimeMin: number;
  difficulty: 1 | 2 | 3;
  equipment: Equipment[];
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  kcalPerServing?: number;
  /** 1 = économique, 3 = plus cher. */
  costLevel: 1 | 2 | 3;
}

/**
 * Une enseigne, vue comme un magasin « national » : ses prix sont la médiane
 * des relevés de tous ses magasins français (voir `CatalogMeta`).
 * Frais, minimums et services sont INDICATIFS (variables selon le magasin).
 */
export interface Store {
  id: string;
  chain: StoreChain;
  /** Nom affiché de l'enseigne (« E.Leclerc », « Super U »…). */
  name: string;
  /** Zone couverte par les prix (« France » pour un prix national d'enseigne). */
  city: string;
  /** Retrait : drive, click & collect, ou aucun (courses en magasin). */
  pickup: PickupMode;
  /** Frais de retrait (drive / click & collect), centimes ; 0 si gratuit ou sans objet. */
  driveFeeCents: number;
  /** Frais de livraison indicatifs, centimes ; `null` = pas de livraison. */
  deliveryFeeCents: number | null;
  /** Montant minimum de commande en ligne, centimes (0 = aucun). */
  minOrderCents: number;
  /**
   * Gabarit d'URL de recherche produit — `{query}` est remplacé. Sans `{query}`,
   * l'URL est ouverte telle quelle (enseigne sans recherche adressable).
   */
  searchUrlTemplate: string;
  /** URL d'accueil des courses en ligne de l'enseigne (ou du site). */
  driveUrl: string;
}

export interface Product {
  id: string;
  /**
   * Code-barres réel (GTIN-13 ou GTIN-8, clé vérifiée) du produit Open Food
   * Facts. Absent pour un produit vendu en vrac (voir `offCategoryTag`).
   */
  ean?: string;
  /**
   * Vrac sans code-barres : catégorie Open Food Facts des relevés Open Prices
   * « au kilo » ou « à la pièce » (ex. `en:tomatoes`).
   */
  offCategoryTag?: string;
  /**
   * Vrac : catégories Open Food Facts des relevés, par ordre de préférence
   * (la première = `offCategoryTag`) ; une enseigne est chiffrée par la
   * première catégorie qui y a des relevés.
   */
  offCategoryTags?: string[];
  /** Vrac : unité des relevés Open Prices (au kilo ou à la pièce), celle de la source. */
  offPricePer?: 'KILOGRAM' | 'UNIT';
  /** Vrac : facteur « prix relevé (au kilo / à la pièce) → prix du conditionnement ». */
  offPackFactor?: number;
  name: string;
  brand: string;
  /** Marque distributeur (MDD) — alternative « moins chère ». */
  isStoreBrand: boolean;
  /**
   * Enseignes qui vendent cette MDD (une MDD des Mousquetaires est vendue chez
   * Intermarché ET Netto sous le même code-barres). Vide / absent si marque nationale.
   */
  storeChains?: StoreChain[];
  ingredientId: string;
  /** Contenance du conditionnement, exprimée dans `packUnit`. */
  packSize: number;
  packUnit: BaseUnit;
  nutriScore?: 'A' | 'B' | 'C' | 'D' | 'E';
  /**
   * Allergènes du produit : ceux de l'ingrédient ∪ ceux déclarés par Open Food
   * Facts (principe de prudence : jamais moins que l'ingrédient).
   */
  allergens: Allergen[];
  /** Produit bio. */
  organic?: boolean;
}

/**
 * Provenance d'un prix :
 * - `open_prices` : médiane de relevés réels en magasin (Open Prices, ODbL) ;
 * - `estimate` : estimation calculée (aucun relevé pour ce produit dans cette
 *   enseigne) — TOUJOURS signalée comme telle à l'utilisateur ;
 * - `partner` / `collect` : flux futurs ; `demo` : ancien catalogue fictif (caches).
 */
export type PriceSource = 'open_prices' | 'partner' | 'collect' | 'estimate' | 'demo';

/** Méthode d'une estimation (voir `src/core/openPrices.ts`). */
export type EstimateMethod =
  /** Prix relevé ailleurs × indice de prix de l'enseigne. */
  | 'chain_index'
  /** Prix unitaire d'une MDD équivalente relevée ailleurs, ramené à l'enseigne. */
  | 'mdd_ratio'
  /** Médiane nationale de la catégorie (vrac) × indice de l'enseigne. */
  | 'category_median';

export interface Price {
  productId: string;
  storeId: string;
  priceCents: number;
  /** Prix promo en cours, s'il existe (jamais sur une estimation). */
  promoPriceCents?: number;
  promoLabel?: string;
  promoUntil?: string;
  /**
   * `open_prices` : date du relevé le plus récent pris en compte (ISO) ;
   * `estimate` : date de l'instantané qui a servi au calcul.
   */
  updatedAt: string;
  source: PriceSource;
  /** Nombre de relevés agrégés (médiane) — `open_prices` uniquement. */
  observationCount?: number;
  /** Date (YYYY-MM-DD) du plus ancien relevé pris en compte — `open_prices` uniquement. */
  observedFrom?: string;
  /** Méthode d'estimation — `estimate` uniquement. */
  estimateMethod?: EstimateMethod;
  /** Nombre de prix réels sur lesquels repose l'estimation — `estimate` uniquement. */
  estimateBasisCount?: number;
}

/** Indice de prix d'une enseigne (Leclerc = 1). */
export interface ChainPriceIndex {
  value: number;
  /** `measured` : calculé sur l'instantané ; `press` : comparatif public (faute de données). */
  basis: 'measured' | 'press';
  /** Produits communs ayant servi au calcul (`measured`). */
  commonProducts: number;
}

/** Description de l'instantané de données ouvertes d'où vient le catalogue. */
export interface CatalogMeta {
  /** Date de l'instantané (ISO). */
  snapshotAt: string;
  /** Fenêtre des relevés retenus (YYYY-MM-DD). */
  pricesFrom: string;
  pricesTo: string;
  /** Nombre de prix relevés / estimés dans le catalogue. */
  observedPrices: number;
  estimatedPrices: number;
  chainIndex: Record<StoreChain, ChainPriceIndex>;
  /** Couverture par enseigne (nombre de prix relevés / estimés). */
  coverage: Record<StoreChain, { observed: number; estimated: number }>;
  /** Sources et licences à créditer. */
  sources: { name: string; url: string; license: string }[];
  /**
   * Création (horodatage ISO complet) du relevé le plus récent de l'export
   * utilisé : borne EXACTE de l'instantané — curseur initial de la collecte
   * incrémentale (les relevés créés après n'y sont pas).
   */
  lastCreatedAt?: string;
}

// ─── Planning ────────────────────────────────────────────────────────────────

export interface PlannedMeal {
  id: string;
  /** Jour ISO `YYYY-MM-DD`. */
  date: string;
  type: MealType;
  recipeId: string;
  /** Portions à cuisiner (ajustées au foyer). */
  servings: number;
  /** Verrouillé : la régénération ne le remplace pas. */
  locked?: boolean;
  /** Raison courte de la suggestion (affichée « Pourquoi ce plat ? »). */
  reason?: string;
}

export interface MealPlan {
  id: string;
  /** Lundi de la semaine, ISO. */
  weekStart: string;
  meals: PlannedMeal[];
  generatedAt: string;
  /** 'ai' = LLM + validation serveur ; 'rules' = moteur déterministe local. */
  source: 'ai' | 'rules';
}

// ─── Liste de courses ────────────────────────────────────────────────────────

export interface PackagingSuggestion {
  /** Contenance d'un conditionnement réel, en unité de base. */
  packSize: number;
  packUnit: BaseUnit;
  /** Nombre de conditionnements à acheter. */
  packs: number;
}

export interface ShoppingListItem {
  id: string;
  /** Absent pour un article libre ajouté à la main (« sacs poubelle »). */
  ingredientId?: string;
  label: string;
  /** Quantité nécessaire, en unité de base. */
  quantity: number;
  unit: BaseUnit;
  aisle: Aisle;
  checked: boolean;
  source: 'plan' | 'manual';
  /** Recettes qui utilisent l'ingrédient. */
  recipeIds: string[];
  packaging?: PackagingSuggestion;
  /** Ingrédient de placard : probablement déjà à la maison. */
  pantryStaple?: boolean;
  note?: string;
}

export interface ShoppingList {
  id: string;
  mealPlanId: string | null;
  items: ShoppingListItem[];
  updatedAt: string;
}

// ─── Comparateur & panier ────────────────────────────────────────────────────

export interface StoreOffer {
  storeId: string;
  productId: string;
  /** Nombre de conditionnements à acheter pour couvrir le besoin. */
  packs: number;
  /** Prix unitaire effectif (promo incluse), centimes. */
  unitPriceCents: number;
  totalCents: number;
  /** Prix au kg / au litre / à la pièce, centimes. */
  pricePerBaseUnitCents: number;
  /** Unité de référence du prix au kilo : 'kg' | 'l' | 'piece'. */
  referenceUnit: 'kg' | 'l' | 'piece';
  isStoreBrand: boolean;
  isPromo: boolean;
  /*
   * Provenance du prix retenu (copiée de `Price` par core/priceComparison) —
   * champs de VUE, OPTIONNELS : absents des comparaisons calculées avant leur
   * ajout (caches persistés, ancien serveur). Ajout additif (données réelles).
   */
  /** `Price.source` : relevé (`open_prices`…), estimation (`estimate`) ou ancien `demo`. */
  priceSource?: PriceSource;
  /** `Price.updatedAt` : dernier relevé (`open_prices`) ou date de l'instantané (`estimate`). */
  priceUpdatedAt?: string;
  /** `Price.observationCount` : nombre de relevés agrégés. */
  observationCount?: number;
  /** `Price.estimateMethod` : méthode d'estimation. */
  estimateMethod?: EstimateMethod;
}

export interface ItemComparison {
  itemId: string;
  label: string;
  /** Meilleure offre par magasin (absente si introuvable). */
  offers: StoreOffer[];
  /** Offre la moins chère tous magasins confondus. */
  best?: StoreOffer;
  /** Alternative moins chère (MDD) si l'offre de référence est une marque nationale. */
  cheaperAlternative?: StoreOffer & { savingsCents: number };
}

export type BasketMode = 'cheapest' | 'single_store';

export interface BasketLine {
  itemId: string;
  label: string;
  productId: string;
  packs: number;
  totalCents: number;
  /**
   * Provenance du prix de la ligne (`StoreOffer.priceSource`) — champ de VUE
   * optionnel (ajout additif) : signale « prix estimé » au panier, à la
   * commande et dans le texte copié.
   */
  priceSource?: PriceSource;
}

export interface BasketStorePart {
  storeId: string;
  lines: BasketLine[];
  subtotalCents: number;
  feesCents: number;
  /**
   * Montant manquant pour atteindre le minimum de commande du magasin
   * (centimes, > 0) — seulement quand AUCUN panier ne le respecte : l'enseigne
   * peut alors refuser la commande, à signaler.
   */
  minOrderShortfallCents?: number;
}

/** Magasin écarté parce que sa part resterait sous son minimum de commande. */
export interface MinOrderSkip {
  storeId: string;
  minOrderCents: number;
  /** Articles que ce magasin vend mais qui restent introuvables dans le panier. */
  itemIds: string[];
}

export interface BasketPlan {
  mode: BasketMode;
  parts: BasketStorePart[];
  totalCents: number;
  /** Économie vs. le panier « un seul magasin » le plus cher. */
  savingsCents: number;
  /** Articles introuvables dans les magasins retenus. */
  missingItemIds: string[];
  /**
   * Magasins écartés à cause de leur minimum de commande alors qu'ils
   * vendaient des articles restés introuvables (absent si aucun).
   */
  minOrderSkipped?: MinOrderSkip[];
  computedAt: string;
}

// ─── Commande & abonnement ───────────────────────────────────────────────────

export type OrderChannel = 'drive' | 'delivery';

export interface OrderHandoff {
  id: string;
  storeId: string;
  channel: OrderChannel;
  /** URL ouverte pour finaliser la commande chez l'enseigne. */
  url: string;
  /** Lignes du panier pré-rempli, pour affichage / copie. */
  lines: BasketLine[];
  totalCents: number;
  createdAt: string;
  status: 'prepared' | 'opened' | 'confirmed';
}

export type Entitlement = 'free' | 'premium';

export interface SubscriptionState {
  entitlement: Entitlement;
  /** Période d'essai en cours. */
  isTrial: boolean;
  expiresAt: string | null;
  productId: string | null;
  willRenew: boolean;
}

/** Limites du plan gratuit (dossier projet §02 — modèle économique). */
export const FREE_TIER = {
  maxMealsPerWeek: 3,
  optimizedBasket: false,
  oneClickOrder: false,
  priceAlerts: false,
} as const;

export const PREMIUM_PRICING = {
  monthlyCents: 499,
  yearlyCents: 3999,
  trialDays: 7,
} as const;

// ─── Notifications ───────────────────────────────────────────────────────────

export interface NotificationPreferences {
  planningReminder: boolean;
  /** 0 = lundi … 6 = dimanche */
  planningReminderWeekday: number;
  planningReminderHour: number;
  orderReminder: boolean;
  priceDrops: boolean;
}

// ─── Placard (V2 — anti-gaspi) ───────────────────────────────────────────────

/** Un article présent à la maison (placard, frigo, congélateur). */
export interface PantryItem {
  id: string;
  /** Absent pour un article libre (« reste de riz »). */
  ingredientId?: string;
  label: string;
  /** Quantité disponible, en unité de base. */
  quantity: number;
  unit: BaseUnit;
  /** Horodatage ISO d'ajout. */
  addedAt: string;
  /** Date limite (jour ISO `YYYY-MM-DD` ou horodatage ISO). */
  expiresAt?: string;
}

// ─── Budget (V2 — suivi des dépenses) ────────────────────────────────────────

/** Une dépense de courses (commande passée via Cabas ou saisie à la main). */
export interface SpendingEntry {
  id: string;
  /** Jour ISO `YYYY-MM-DD`. */
  date: string;
  storeId: string;
  totalCents: number;
  /** Économie réalisée grâce au comparateur, centimes. */
  savingsCents: number;
  source: 'order' | 'manual';
  label?: string;
}

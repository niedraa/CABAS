/**
 * Générateur DÉTERMINISTE des produits et des prix de démonstration.
 *
 * Entrées : spécifications produits, ingrédients, magasins.
 * Sorties : `Product[]` et `Price[]` — écrits dans `products.ts` / `prices.ts`
 * par `run.mjs`, et recalculés par les tests pour vérifier qu'ils sont à jour.
 *
 * Modèle de prix :
 *   prix(produit national, magasin) = prix de référence × indice enseigne
 *                                     × (1 ± 6 % de bruit déterministe)
 *   prix(MDD, son enseigne)         = prix unitaire national dans ce magasin
 *                                     × ratio MDD (≈ 0,6–0,85) × contenance
 *                                     × (1 ± 3 %)
 * puis arrondi « psychologique » en …9 centimes au-delà de 1,50 €.
 * Environ 8 % des prix portent une promo (prix effectif à l'unité).
 *
 * Aucune dépendance (imports de types uniquement) : chargeable par Node.
 */
import type { Allergen, Ingredient, Price, Product, Store, StoreChain } from '../../core/types';
import type { ProductFamily, ProductSpec } from '../productSpecs';

// ─── Constantes du modèle ────────────────────────────────────────────────────

/** Date de relevé des prix de démo. */
export const DEMO_PRICES_UPDATED_AT = '2026-11-09T06:00:00.000Z';

/** Indice de prix moyen de chaque enseigne (Carrefour = référence). */
export const CHAIN_PRICE_INDEX: Record<StoreChain, number> = {
  leclerc: 0.95,
  lidl: 0.93,
  auchan: 0.98,
  carrefour: 1.0,
  intermarche: 1.01,
  monoprix: 1.12,
};

/** Amplitude du bruit déterministe par (produit, magasin). */
const NATIONAL_NOISE = 0.06;
const MDD_NOISE = 0.03;
/** Ratio MDD / national par défaut. */
const DEFAULT_MDD_RATIO = 0.74;
/** Part des prix en promotion. */
const PROMO_SHARE = 0.08;
/** Part des produits de marque nationale absents chez Lidl. */
const LIDL_MISSING_SHARE = 0.3;

/** Promotions possibles : libellé + coefficient sur le prix unitaire effectif. */
const PROMOS: { label: string; factor: number }[] = [
  { label: '-20 %', factor: 0.8 },
  { label: '-30 %', factor: 0.7 },
  { label: '2e à -50 %', factor: 0.75 },
  { label: '-25 % immédiat', factor: 0.75 },
  { label: '-40 %', factor: 0.6 },
];
const PROMO_END_DATES = ['2026-11-17', '2026-11-24', '2026-12-01', '2026-12-08'];

/** Nom de la marque distributeur, par famille de produit et par enseigne. */
const MDD_BRANDS: Record<ProductFamily, Partial<Record<StoreChain, string>>> = {
  primeur: { leclerc: 'Marque Repère', carrefour: 'Carrefour', auchan: 'Auchan', intermarche: 'Intermarché', lidl: 'Lidl' },
  boucherie: { leclerc: 'Marque Repère', carrefour: 'Carrefour', auchan: 'Auchan', intermarche: 'Jean Rozé', lidl: 'Lidl' },
  charcuterie: {
    leclerc: 'Marque Repère',
    carrefour: 'Carrefour',
    auchan: 'Auchan',
    intermarche: 'Monique Ranou',
    lidl: 'Lidl',
  },
  poisson: { leclerc: 'Marque Repère', carrefour: 'Carrefour', auchan: 'Auchan', intermarche: 'Capitaine Cook', lidl: 'Nixe' },
  cremerie: { leclerc: 'Marque Repère', carrefour: 'Carrefour', auchan: 'Auchan', intermarche: 'Pâturages', lidl: 'Milbona' },
  vegetal: { leclerc: 'Marque Repère', carrefour: 'Carrefour Veggie', auchan: 'Auchan', intermarche: 'Intermarché', lidl: 'Vemondo' },
  boulangerie: { leclerc: 'Marque Repère', carrefour: 'Carrefour', auchan: 'Auchan', intermarche: 'Chabrior', lidl: 'Lidl' },
  pates: { leclerc: 'Marque Repère', carrefour: "Carrefour Classic'", auchan: 'Auchan', intermarche: 'Top Budget', lidl: 'Combino' },
  italien: { leclerc: 'Marque Repère', carrefour: "Carrefour Classic'", auchan: 'Auchan', intermarche: 'Saint Eloi', lidl: 'Baresa' },
  conserve: { leclerc: 'Marque Repère', carrefour: "Carrefour Classic'", auchan: 'Auchan', intermarche: 'Saint Eloi', lidl: 'Freshona' },
  feculents: { leclerc: 'Marque Repère', carrefour: "Carrefour Classic'", auchan: 'Auchan', intermarche: 'Saint Eloi', lidl: 'Golden Sun' },
  asie: { leclerc: 'Marque Repère', carrefour: 'Carrefour', auchan: 'Auchan', intermarche: 'Saint Eloi', lidl: 'Vitasia' },
  epices: { leclerc: 'Marque Repère', carrefour: "Carrefour Classic'", auchan: 'Auchan', intermarche: 'Saint Eloi', lidl: 'Kania' },
  huile: { leclerc: 'Marque Repère', carrefour: "Carrefour Classic'", auchan: 'Auchan', intermarche: 'Saint Eloi', lidl: 'Primadonna' },
  condiment: { leclerc: 'Marque Repère', carrefour: "Carrefour Classic'", auchan: 'Auchan', intermarche: 'Saint Eloi', lidl: 'Kania' },
  patisserie: { leclerc: 'Marque Repère', carrefour: "Carrefour Classic'", auchan: 'Auchan', intermarche: 'Saint Eloi', lidl: 'Belbake' },
  fruits_secs: { leclerc: 'Marque Repère', carrefour: 'Carrefour', auchan: 'Auchan', intermarche: 'Saint Eloi', lidl: 'Alesto' },
  surgeles: { leclerc: 'Marque Repère', carrefour: 'Carrefour', auchan: 'Auchan', intermarche: 'Intermarché', lidl: 'Freshona' },
  vin: {},
};

// ─── Aléa déterministe ───────────────────────────────────────────────────────

/** Hachage FNV-1a 32 bits d'une chaîne. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let k = 0; k < input.length; k++) {
    h ^= input.charCodeAt(k);
    h = Math.imul(h, 0x01000193);
  }
  // Mélange final (avalanche) pour mieux répartir les bits faibles.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Nombre pseudo-aléatoire stable dans [0, 1) pour une clé donnée. */
export function rand01(key: string): number {
  return hashString(key) / 4294967296;
}

/** Bruit stable dans [-amplitude, +amplitude]. */
function noise(key: string, amplitude: number): number {
  return (rand01(key) * 2 - 1) * amplitude;
}

// ─── EAN-13 ──────────────────────────────────────────────────────────────────

/** Chiffre de contrôle EAN-13 des 12 premiers chiffres. */
export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let k = 0; k < 12; k++) {
    const digit = first12.charCodeAt(k) - 48;
    sum += k % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/** Vérifie un EAN-13 complet. */
export function isValidEan13(ean: string): boolean {
  if (!/^\d{13}$/.test(ean)) return false;
  return ean13CheckDigit(ean.slice(0, 12)) === ean.charCodeAt(12) - 48;
}

/**
 * EAN-13 déterministe avec un préfixe GS1 France (300-379). Le préfixe
 * entreprise dépend de la marque, le code article du produit.
 */
function makeEan(brand: string, productId: string, attempt: number): string {
  const company = String(hashString(`brand:${brand}`) % 1_000_000).padStart(6, '0');
  const country = String(300 + (hashString(`country:${brand}`) % 80)); // 300-379
  const item = String(hashString(`item:${productId}:${attempt}`) % 1000).padStart(3, '0');
  const first12 = `${country}${company}${item}`;
  return `${first12}${ean13CheckDigit(first12)}`;
}

// ─── Produits ────────────────────────────────────────────────────────────────

/** Chaînes pour lesquelles une MDD est générée (une par magasin de démo). */
function chainsOf(stores: readonly Store[]): StoreChain[] {
  return Array.from(new Set(stores.map((s) => s.chain)));
}

/** Identifiants produits (stables, lisibles). */
export function nationalProductId(ingredientId: string): string {
  return `prd_${ingredientId}`;
}
export function bioProductId(ingredientId: string): string {
  return `prd_${ingredientId}_bio`;
}
export function mddProductId(ingredientId: string, chain: StoreChain): string {
  return `prd_${ingredientId}_mdd_${chain}`;
}

/** Copie triée (ordre canonique des allergènes réglementaires). */
function sortedAllergens(allergens: readonly Allergen[], order: readonly Allergen[]): Allergen[] {
  return [...allergens].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** Construit la liste des produits à partir des spécifications. */
export function buildProducts(
  specs: readonly ProductSpec[],
  ingredients: readonly Ingredient[],
  stores: readonly Store[],
  allergenOrder: readonly Allergen[],
): Product[] {
  const byId = new Map(ingredients.map((ing) => [ing.id, ing]));
  const usedEans = new Set<string>();
  const products: Product[] = [];

  const uniqueEan = (brand: string, productId: string): string => {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const ean = makeEan(brand, productId, attempt);
      if (!usedEans.has(ean)) {
        usedEans.add(ean);
        return ean;
      }
    }
    throw new Error(`Impossible de générer un EAN unique pour ${productId}`);
  };

  for (const spec of specs) {
    const ingredient = byId.get(spec.ingredientId);
    if (!ingredient) throw new Error(`Spécification produit pour un ingrédient inconnu : ${spec.ingredientId}`);
    const allergens = sortedAllergens(ingredient.allergens, allergenOrder);

    /** Produit avec un ordre de clés stable et lisible dans le fichier généré. */
    const make = (fields: {
      id: string;
      name: string;
      brand: string;
      storeChain?: StoreChain;
      packSize: number;
      organic?: boolean;
    }): Product => ({
      id: fields.id,
      ean: uniqueEan(fields.brand, fields.id),
      name: fields.name,
      brand: fields.brand,
      isStoreBrand: fields.storeChain !== undefined,
      ...(fields.storeChain ? { storeChain: fields.storeChain } : {}),
      ingredientId: ingredient.id,
      packSize: fields.packSize,
      packUnit: ingredient.baseUnit,
      ...(spec.nutriScore ? { nutriScore: spec.nutriScore } : {}),
      allergens: [...allergens],
      ...(fields.organic ? { organic: true } : {}),
    });

    // 1. Marque nationale (toutes enseignes).
    const nationalId = nationalProductId(ingredient.id);
    products.push(make({ id: nationalId, name: spec.name, brand: spec.brand, packSize: spec.packSize }));

    // 2. Variante bio (marque nationale).
    if (spec.bio) {
      const bioId = bioProductId(ingredient.id);
      products.push(
        make({ id: bioId, name: spec.bio.name, brand: spec.bio.brand, packSize: spec.bio.packSize, organic: true }),
      );
    }

    // 3. Marques distributeur (une par enseigne).
    if (spec.mdd !== false) {
      const mdd = spec.mdd ?? {};
      for (const chain of chainsOf(stores)) {
        const brand = MDD_BRANDS[spec.family][chain];
        if (!brand) continue;
        const id = mddProductId(ingredient.id, chain);
        products.push(
          make({ id, name: mdd.name ?? spec.name, brand, storeChain: chain, packSize: mdd.packSize ?? spec.packSize }),
        );
      }
    }
  }
  return products;
}

// ─── Prix ────────────────────────────────────────────────────────────────────

/** Arrondi « prix de rayon » : …9 centimes au-delà de 1,50 €. */
function shelfRound(cents: number): number {
  const c = Math.max(1, Math.round(cents));
  if (c < 150) return c;
  return Math.max(9, Math.round(c / 10) * 10 - 1);
}

/** Promo éventuelle (≈ 8 % des prix), déterministe par (produit, magasin). */
function promoFor(productId: string, storeId: string, priceCents: number): Pick<Price, 'promoPriceCents' | 'promoLabel' | 'promoUntil'> {
  const key = `promo:${productId}:${storeId}`;
  if (rand01(key) >= PROMO_SHARE) return {};
  const promo = PROMOS[hashString(`${key}:kind`) % PROMOS.length];
  const until = PROMO_END_DATES[hashString(`${key}:until`) % PROMO_END_DATES.length];
  const promoPriceCents = Math.max(1, Math.round(priceCents * promo.factor));
  if (promoPriceCents >= priceCents) return {};
  return { promoPriceCents, promoLabel: promo.label, promoUntil: until };
}

/** Le produit national est-il référencé chez Lidl ? (≈ 70 % des cas, toujours pour le vrac). */
function nationalSoldAtLidl(spec: ProductSpec, productId: string): boolean {
  if (spec.brand.startsWith('Vrac')) return true;
  return rand01(`lidl:${productId}`) >= LIDL_MISSING_SHARE;
}

/** Prix national « théorique » d'un produit dans un magasin (avant arrondi). */
function nationalRawPrice(baseCents: number, productId: string, store: Store): number {
  const index = CHAIN_PRICE_INDEX[store.chain] ?? 1;
  return baseCents * index * (1 + noise(`price:${productId}:${store.id}`, NATIONAL_NOISE));
}

/** Construit les prix de tous les produits dans les magasins de démo. */
export function buildPrices(
  specs: readonly ProductSpec[],
  products: readonly Product[],
  stores: readonly Store[],
): Price[] {
  const specByIngredient = new Map(specs.map((s) => [s.ingredientId, s]));
  const prices: Price[] = [];

  const push = (productId: string, store: Store, rawCents: number) => {
    const priceCents = shelfRound(rawCents);
    prices.push({
      productId,
      storeId: store.id,
      priceCents,
      ...promoFor(productId, store.id, priceCents),
      updatedAt: DEMO_PRICES_UPDATED_AT,
      source: 'demo',
    });
  };

  for (const product of products) {
    const spec = specByIngredient.get(product.ingredientId);
    if (!spec) continue;

    if (!product.isStoreBrand) {
      const base = product.organic && spec.bio ? spec.bio.priceCents : spec.priceCents;
      for (const store of stores) {
        if (store.chain === 'lidl' && !nationalSoldAtLidl(spec, product.id)) continue;
        // Le bio est plus rare chez Lidl : présent un produit sur deux.
        if (store.chain === 'lidl' && product.organic && rand01(`lidl-bio:${product.id}`) < 0.5) continue;
        push(product.id, store, nationalRawPrice(base, product.id, store));
      }
      continue;
    }

    // MDD : uniquement dans son enseigne, dérivée du prix unitaire national
    // du même magasin (garantit une MDD moins chère au kilo / à l'unité).
    const ratio = spec.mdd ? (spec.mdd.ratio ?? DEFAULT_MDD_RATIO) : DEFAULT_MDD_RATIO;
    const nationalId = nationalProductId(product.ingredientId);
    for (const store of stores) {
      if (store.chain !== product.storeChain) continue;
      const nationalUnit = nationalRawPrice(spec.priceCents, nationalId, store) / spec.packSize;
      const raw = nationalUnit * ratio * product.packSize * (1 + noise(`mdd:${product.id}:${store.id}`, MDD_NOISE));
      push(product.id, store, raw);
    }
  }
  return prices;
}

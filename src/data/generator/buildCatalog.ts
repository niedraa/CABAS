/**
 * Générateur DÉTERMINISTE du catalogue réel (produits, prix, méta) à partir :
 *  - des produits choisis à la main (`productSources.ts`) ;
 *  - de l'instantané de données ouvertes (`openData/snapshot.json`, construit
 *    par `scripts/open-data/build-snapshot.mjs` : fiches Open Food Facts,
 *    prix nationaux Open Prices par enseigne, indice de prix des enseignes).
 *
 * Sorties écrites par `run.mjs` dans `products.ts`, `prices.ts`, `meta.ts`,
 * et recalculées par les tests pour vérifier qu'elles sont à jour.
 *
 * Règles (docs/OPEN_DATA.md) :
 *  - prix RELEVÉ (`open_prices`) : médiane nationale de l'enseigne ;
 *  - sinon ESTIMATION (`estimate`, toujours signalée, jamais de promo) :
 *    · marque nationale / bio absente d'une enseigne GÉNÉRALISTE mais relevée
 *      ailleurs : médiane des prix relevés ramenés à l'indice Leclerc
 *      × indice de l'enseigne (`chain_index`) — jamais chez Lidl, Aldi, Netto
 *      (on n'invente pas une disponibilité) ;
 *    · MDD vendue dans plusieurs enseignes (Intermarché / Netto), relevée dans
 *      l'une mais pas dans l'autre : SON prix relevé, ramené par indices
 *      (`chain_index`, même calcul que la marque nationale ; la disponibilité
 *      vient de `chains`, elle n'est pas inventée) ;
 *    · MDD sans aucun relevé dans ses enseignes : prix unitaire médian des
 *      MDD du même ingrédient relevées ailleurs, ramené par indices
 *      × contenance (`mdd_ratio`), à défaut prix unitaire de la marque
 *      nationale × 0,75 ;
 *    · vrac : médiane nationale de la catégorie ramenée par indices × indice
 *      de l'enseigne (`category_median`), dans toutes les enseignes ;
 *  - allergènes produit = ingrédient ∪ Open Food Facts (jamais moins).
 *
 * Aucune dépendance (imports de types uniquement) : chargeable par Node.
 */
import type { AggregatedPrice } from '../../core/openPrices';
import type {
  Allergen,
  BaseUnit,
  CatalogMeta,
  ChainPriceIndex,
  EstimateMethod,
  Ingredient,
  Price,
  Product,
  Store,
  StoreChain,
} from '../../core/types';
import type { IngredientSource, LooseRef, ProductRef, StoreBrandRef } from '../productSources';

// ─── Instantané ──────────────────────────────────────────────────────────────

/** Champs utiles d'une fiche Open Food Facts, normalisés par core/openPrices. */
export interface OffProductInfo {
  name?: string;
  /** Marques, texte brut (« Bio Village, Marque Repère »). */
  brands?: string;
  /** Contenance, texte brut. */
  quantity?: string;
  /** Contenance lue (`parseOffQuantity`). */
  size?: number;
  unit?: BaseUnit;
  nutriScore?: 'A' | 'B' | 'C' | 'D' | 'E';
  /** `allergens_tags` mappés vers les 14 allergènes réglementaires. */
  allergens: Allergen[];
  /** Tags d'allergènes non reconnus (à relire). */
  allergensUnknown?: string[];
  /** « Peut contenir » (`traces_tags`), pour information. */
  traces?: Allergen[];
  tracesUnknown?: string[];
  organic?: boolean;
  /** Dernière modification de la fiche (YYYY-MM-DD). */
  lastModified?: string;
}

export interface OpenDataSnapshot {
  schemaVersion: number;
  /** Date de l'instantané (YYYY-MM-DD). */
  snapshotAt: string;
  pricesFrom: string;
  pricesTo: string;
  source?: {
    prices: string;
    locations: string;
    lastContributionAt: string | null;
    /** `created` (ISO complet) du relevé le plus récent de l'export. */
    lastCreatedAt?: string | null;
  };
  stats?: {
    observations: number;
    /** Magasins (lieux) ayant fourni au moins un relevé retenu. */
    stores?: number;
    byChain: Partial<Record<StoreChain, { observations: number; products: number }>>;
  };
  chainIndex: Record<StoreChain, ChainPriceIndex>;
  offProducts: Record<string, OffProductInfo>;
  /** Clé (`ean:<gtin>`, `cat:<tag>:<KILOGRAM|UNIT>[:organic]`) → enseigne → prix national. */
  aggregates: Record<string, Partial<Record<StoreChain, AggregatedPrice>>>;
}

export interface BuiltCatalog {
  products: Product[];
  prices: Price[];
  meta: CatalogMeta;
  /** Points à relire (fiches manquantes, allergènes inconnus, produits sans prix…). */
  warnings: string[];
}

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Enseignes généralistes : une marque nationale relevée ailleurs y est vendue. */
export const GENERALIST_CHAINS: readonly StoreChain[] = [
  'leclerc',
  'carrefour',
  'auchan',
  'intermarche',
  'superu',
  'monoprix',
  'franprix',
];

/** Ratio MDD / marque nationale (prix unitaire) faute de MDD relevée. */
export const MDD_FALLBACK_RATIO = 0.75;

/** Sources et licences à créditer (meta.sources). */
export const DATA_SOURCES: CatalogMeta['sources'] = [
  { name: 'Open Food Facts', url: 'https://world.openfoodfacts.org', license: 'ODbL 1.0' },
  { name: 'Open Prices', url: 'https://prices.openfoodfacts.org', license: 'ODbL 1.0' },
  { name: 'OpenStreetMap', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0' },
];

// ─── Identifiants (stables : des données utilisateur y font référence) ───────

export function nationalProductId(ingredientId: string): string {
  return `prd_${ingredientId}`;
}
export function bioProductId(ingredientId: string): string {
  return `prd_${ingredientId}_bio`;
}
/** `chain` = PREMIÈRE enseigne de la liste `chains` de la MDD. */
export function mddProductId(ingredientId: string, chain: StoreChain): string {
  return `prd_${ingredientId}_mdd_${chain}`;
}
export function looseProductId(ingredientId: string): string {
  return `prd_${ingredientId}_vrac`;
}

// ─── Aides pures ─────────────────────────────────────────────────────────────

/** Clé GS1 (copie de core/openPrices.isValidGtin : ce fichier n'importe que des types). */
function isGtin(code: string): boolean {
  if (typeof code !== 'string' || !/^(?:\d{8}|\d{13})$/.test(code) || /^0+$/.test(code)) return false;
  if (code.length === 13 && code[0] === '2') return false;
  let sum = 0;
  for (let k = 0; k < code.length - 1; k++) {
    const digit = code.charCodeAt(code.length - 2 - k) - 48;
    sum += k % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10 === code.charCodeAt(code.length - 1) - 48;
}

/**
 * g ↔ ml (densité de l'ingrédient), pièce ↔ g (poids moyen). `null` si
 * impossible — en particulier g ↔ ml SANS densité : jamais « 1 ml = 1 g » par
 * défaut (un sac de moules « 2 l » pèse 1,4 kg, pas 2 kg).
 */
export function convertQuantity(q: number, from: BaseUnit, to: BaseUnit, ing: Ingredient): number | null {
  if (from === to) return q;
  const density = ing.density && ing.density > 0 ? ing.density : undefined;
  const gpp = ing.gramsPerPiece && ing.gramsPerPiece > 0 ? ing.gramsPerPiece : undefined;
  let grams: number;
  if (from === 'g') grams = q;
  else if (from === 'ml') {
    if (density === undefined) return null;
    grams = q * density;
  } else if (gpp !== undefined) grams = q * gpp;
  else return null;
  if (to === 'g') return grams;
  if (to === 'ml') return density !== undefined ? grams / density : null;
  return gpp !== undefined ? grams / gpp : null;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Médiane pondérée (poids entiers = nombre de relevés) : équivaut à la
 * médiane de tous les relevés quand chaque point est une médiane d'enseigne.
 */
export function weightedMedian(points: readonly { value: number; weight: number }[]): number {
  const sorted = points.filter((p) => p.weight > 0 && Number.isFinite(p.value)).sort((a, b) => a.value - b.value);
  if (sorted.length === 0) return Number.NaN;
  const total = sorted.reduce((s, p) => s + p.weight, 0);
  let acc = 0;
  for (let k = 0; k < sorted.length; k++) {
    acc += sorted[k].weight;
    if (acc * 2 > total) return sorted[k].value;
    if (acc * 2 === total) return (sorted[k].value + sorted[k + 1].value) / 2;
  }
  return sorted[sorted.length - 1].value;
}

/** Minuscules sans accents (comparaison de marques). */
function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Nom affiché : espaces normalisés, texte TOUT EN CAPITALES adouci, marque
 * répétée en tête retirée (« HERTA Lardons fumés » → « Lardons fumés »),
 * majuscule initiale.
 */
export function cleanProductName(name: string, brand?: string): string {
  let t = name.replace(/\s+/g, ' ').trim();
  if (t.length > 3 && t === t.toUpperCase() && t !== t.toLowerCase()) t = t.toLowerCase();
  if (brand && brand.trim()) {
    const b = fold(brand.trim());
    const rest = t.slice(b.length).replace(/^[\s\-–—:,]+/, '');
    if (fold(t).startsWith(b) && /^[\s\-–—:,]/.test(t.slice(b.length)) && rest.length >= 3) t = rest;
  }
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/** Première marque d'une liste Open Food Facts (« Bio Village, Marque Repère » → « Bio Village »). */
export function firstBrand(brands: string | undefined): string | undefined {
  const first = (brands ?? '').split(',')[0]?.replace(/\s+/g, ' ').trim();
  return first || undefined;
}

// ─── Construction ────────────────────────────────────────────────────────────

type Kind = 'national' | 'bio' | 'mdd' | 'vrac';

interface ObservedPrice {
  /** Prix du conditionnement, centimes entiers (affiché). */
  cents: number;
  /** Prix du conditionnement non arrondi (base des estimations). */
  exact: number;
  count: number;
  from: string;
  to: string;
}

interface Entry {
  kind: Kind;
  product: Product;
  /** Enseignes où le produit peut avoir un prix (MDD : les siennes). */
  chains: readonly StoreChain[];
  observed: Map<StoreChain, ObservedPrice>;
}

/** Construit le catalogue complet. Lève une erreur sur une source mal formée. */
export function buildCatalog(
  productSources: readonly IngredientSource[],
  snapshot: OpenDataSnapshot,
  ingredients: readonly Ingredient[],
  stores: readonly Store[],
  allergenOrder: readonly Allergen[],
): BuiltCatalog {
  const warnings: string[] = [];
  const ingredientsById = new Map(ingredients.map((i) => [i.id, i]));
  const allChains = stores.map((s) => s.chain);
  if (new Set(allChains).size !== allChains.length) throw new Error('Une enseigne apparaît deux fois dans stores');
  for (const chain of allChains) {
    const ix = snapshot.chainIndex[chain];
    if (!ix || !(ix.value > 0)) throw new Error(`Indice de prix manquant dans l'instantané : ${chain}`);
  }
  const indexOf = (chain: StoreChain) => snapshot.chainIndex[chain].value;
  const sortAllergens = (list: Iterable<Allergen>) =>
    [...new Set(list)].sort((a, b) => allergenOrder.indexOf(a) - allergenOrder.indexOf(b));

  const seenIngredients = new Set<string>();
  const seenProductIds = new Set<string>();
  const seenEans = new Map<string, string>();
  const entries: Entry[] = [];

  for (const source of productSources) {
    const ing = ingredientsById.get(source.ingredientId);
    if (!ing) throw new Error(`productSources : ingrédient inconnu « ${source.ingredientId} »`);
    if (seenIngredients.has(ing.id)) throw new Error(`productSources : ingrédient en double « ${ing.id} »`);
    seenIngredients.add(ing.id);
    if (!source.national && !source.bio && !(source.mdd && source.mdd.length > 0) && !source.loose) {
      throw new Error(`productSources : aucun produit pour « ${ing.id} »`);
    }

    const register = (entry: Entry | null) => {
      if (!entry) return;
      if (seenProductIds.has(entry.product.id)) {
        throw new Error(`Identifiant produit en double : ${entry.product.id} (deux MDD de même première enseigne ?)`);
      }
      seenProductIds.add(entry.product.id);
      entries.push(entry);
    };

    const eanEntry = (ref: ProductRef, kind: Exclude<Kind, 'vrac'>, id: string, storeChains?: StoreChain[]): Entry | null => {
      if (!isGtin(ref.ean)) throw new Error(`${id} : code-barres invalide « ${ref.ean} »`);
      const previous = seenEans.get(ref.ean);
      if (previous) throw new Error(`${id} : code-barres ${ref.ean} déjà utilisé par ${previous}`);
      seenEans.set(ref.ean, id);
      const off = snapshot.offProducts[ref.ean];
      if (!off) warnings.push(`${id} (${ref.ean}) : pas de fiche Open Food Facts — allergènes de l'ingrédient seulement`);

      const rawName = ref.name ?? off?.name;
      if (!rawName) {
        warnings.push(`${id} (${ref.ean}) : écarté, aucun nom (fiche absente et pas de « name »)`);
        return null;
      }
      let size: number | null = null;
      if (ref.packSize !== undefined) size = convertQuantity(ref.packSize, ref.packUnit ?? ing.baseUnit, ing.baseUnit, ing);
      else if (off?.size !== undefined && off.unit) size = convertQuantity(off.size, off.unit, ing.baseUnit, ing);
      if (size === null || !(size > 0)) {
        warnings.push(
          `${id} (${ref.ean}) : écarté, contenance inconnue ou non convertible en ${ing.baseUnit} (« ${off?.quantity ?? ''} »)`,
        );
        return null;
      }
      const brand =
        ref.brand ??
        firstBrand(off?.brands) ??
        (storeChains ? stores.find((s) => s.chain === storeChains[0])?.name : undefined);
      if (!brand) warnings.push(`${id} (${ref.ean}) : marque inconnue`);
      if (kind === 'mdd' && !ref.brand && (off?.brands ?? '').includes(',')) {
        warnings.push(`${id} (${ref.ean}) : marques OFF « ${off?.brands} », « ${brand} » retenue — préciser « brand » si besoin`);
      }
      for (const tag of off?.allergensUnknown ?? []) warnings.push(`${id} (${ref.ean}) : allergène OFF à relire « ${tag} »`);
      const extra = (off?.allergens ?? []).filter((a) => !ing.allergens.includes(a));
      if (extra.length > 0) warnings.push(`${id} (${ref.ean}) : allergènes OFF absents de l'ingrédient ajoutés : ${extra.join(', ')}`);

      const organic = kind === 'bio' || (ref.organic ?? off?.organic === true);
      const product: Product = {
        id,
        ean: ref.ean,
        name: ref.name ? cleanProductName(ref.name) : cleanProductName(rawName, brand),
        brand: brand ?? 'Sans marque',
        isStoreBrand: kind === 'mdd',
        ...(storeChains ? { storeChains } : {}),
        ingredientId: ing.id,
        packSize: round1(size),
        packUnit: ing.baseUnit,
        ...(off?.nutriScore ? { nutriScore: off.nutriScore } : {}),
        allergens: sortAllergens([...ing.allergens, ...(off?.allergens ?? [])]),
        ...(organic ? { organic: true } : {}),
      };
      const chains = storeChains ?? allChains;
      const observed = new Map<StoreChain, ObservedPrice>();
      const aggs = snapshot.aggregates[`ean:${ref.ean}`] ?? {};
      for (const chain of chains) {
        const agg = aggs[chain];
        if (agg) observed.set(chain, { cents: agg.medianCents, exact: agg.medianCents, count: agg.count, from: agg.from, to: agg.to });
      }
      return { kind, product, chains, observed };
    };

    const mddEntry = (mdd: StoreBrandRef): Entry | null => {
      const chains = [...new Set(mdd.chains ?? [])];
      if (chains.length === 0) throw new Error(`${ing.id} : MDD ${mdd.ean} sans enseigne`);
      for (const c of chains) if (!allChains.includes(c)) throw new Error(`${ing.id} : MDD ${mdd.ean}, enseigne inconnue « ${c} »`);
      return eanEntry(mdd, 'mdd', mddProductId(ing.id, chains[0]), chains);
    };

    const looseEntry = (loose: LooseRef): Entry | null => {
      const id = looseProductId(ing.id);
      const tags = loose.categoryTags.map((t) => t.trim().toLowerCase()).filter(Boolean);
      if (tags.length === 0) throw new Error(`${id} : aucune catégorie vrac`);
      const pack = loosePack(loose, ing);
      if (!pack) {
        warnings.push(`${id} : écarté, prix ${loose.pricePer} non convertible en ${ing.baseUnit} (poids moyen manquant)`);
        return null;
      }
      // Facteur arrondi au millionième : le même que celui stocké sur le produit (collecte).
      const packFactor = Math.round(pack.factor * 1e6) / 1e6;
      const product: Product = {
        id,
        offCategoryTag: tags[0],
        // Mêmes règles que l'instantané pour la collecte : catégories par ordre
        // de préférence, unité des relevés de la SOURCE, facteur de conditionnement.
        offCategoryTags: tags,
        offPricePer: loose.pricePer,
        offPackFactor: packFactor,
        name: cleanProductName(loose.name),
        brand: 'Vrac',
        isStoreBrand: false,
        ingredientId: ing.id,
        packSize: pack.size,
        packUnit: ing.baseUnit,
        allergens: sortAllergens(ing.allergens),
        ...(loose.organic ? { organic: true } : {}),
      };
      const observed = new Map<StoreChain, ObservedPrice>();
      for (const chain of allChains) {
        for (const tag of tags) {
          const agg = snapshot.aggregates[`cat:${tag}:${loose.pricePer}${loose.organic ? ':organic' : ''}`]?.[chain];
          if (!agg) continue;
          const exact = agg.medianCents * packFactor;
          observed.set(chain, { cents: Math.max(1, Math.round(exact)), exact, count: agg.count, from: agg.from, to: agg.to });
          break; // catégories par ordre de préférence
        }
      }
      return { kind: 'vrac', product, chains: allChains, observed };
    };

    if (source.national) register(eanEntry(source.national, 'national', nationalProductId(ing.id)));
    if (source.bio) register(eanEntry(source.bio, 'bio', bioProductId(ing.id)));
    for (const mdd of source.mdd ?? []) register(mddEntry(mdd));
    if (source.loose) register(looseEntry(source.loose));
  }

  // ── Bases d'estimation (prix ramenés à l'indice Leclerc) ──

  /** Prix du conditionnement « équivalent Leclerc » : médiane pondérée des relevés. */
  const leclercEquivalent = (entry: Entry): { value: number; basis: number } | null => {
    const points = [...entry.observed].map(([chain, o]) => ({ value: o.exact / indexOf(chain), weight: o.count }));
    if (points.length === 0) return null;
    return { value: weightedMedian(points), basis: points.reduce((s, p) => s + p.weight, 0) };
  };

  const byIngredient = new Map<string, Entry[]>();
  for (const e of entries) {
    const list = byIngredient.get(e.product.ingredientId);
    if (list) list.push(e);
    else byIngredient.set(e.product.ingredientId, [e]);
  }

  /** Prix unitaire (par unité de base) « équivalent Leclerc » des MDD du même ingrédient. */
  const mddUnitBase = (entry: Entry): { value: number; basis: number } | null => {
    const organic = entry.product.organic === true;
    const peers = (byIngredient.get(entry.product.ingredientId) ?? []).filter(
      (e) => e.kind === 'mdd' && (e.product.organic === true) === organic,
    );
    const points: { value: number; weight: number }[] = [];
    for (const peer of peers) {
      for (const [chain, o] of peer.observed) points.push({ value: o.exact / peer.product.packSize / indexOf(chain), weight: o.count });
    }
    if (points.length > 0) return { value: weightedMedian(points), basis: points.reduce((s, p) => s + p.weight, 0) };
    // Repli : marque nationale (ou bio pour une MDD bio) × 0,75.
    const siblings = byIngredient.get(entry.product.ingredientId) ?? [];
    const order: Kind[] = organic ? ['bio', 'national'] : ['national', 'bio'];
    for (const kind of order) {
      const ref = siblings.find((e) => e.kind === kind);
      const base = ref ? leclercEquivalent(ref) : null;
      if (ref && base) return { value: (base.value / ref.product.packSize) * MDD_FALLBACK_RATIO, basis: base.basis };
    }
    return null;
  };

  // ── Prix ──

  const prices: Price[] = [];
  const products: Product[] = [];
  const coverage = {} as Record<StoreChain, { observed: number; estimated: number }>;
  for (const chain of allChains) coverage[chain] = { observed: 0, estimated: 0 };

  for (const entry of entries) {
    const rows: Price[] = [];
    const nationalBase = entry.kind === 'national' || entry.kind === 'bio' || entry.kind === 'vrac' ? leclercEquivalent(entry) : null;
    const missing = entry.chains.some((c) => !entry.observed.has(c));
    // MDD relevée dans une de ses enseignes : son propre prix fait foi dans les autres.
    const mddOwnBase = entry.kind === 'mdd' && missing ? leclercEquivalent(entry) : null;
    const mddBase = entry.kind === 'mdd' && missing && !mddOwnBase ? mddUnitBase(entry) : null;
    for (const store of stores) {
      const chain = store.chain;
      if (!entry.chains.includes(chain)) continue;
      const seen = entry.observed.get(chain);
      if (seen) {
        rows.push({
          productId: entry.product.id,
          storeId: store.id,
          priceCents: seen.cents,
          updatedAt: seen.to,
          source: 'open_prices',
          observationCount: seen.count,
          observedFrom: seen.from,
        });
        coverage[chain].observed++;
        continue;
      }
      let estimate: { cents: number; method: EstimateMethod; basis: number } | null = null;
      if ((entry.kind === 'national' || entry.kind === 'bio') && GENERALIST_CHAINS.includes(chain) && nationalBase) {
        estimate = { cents: nationalBase.value * indexOf(chain), method: 'chain_index', basis: nationalBase.basis };
      } else if (entry.kind === 'mdd' && mddOwnBase) {
        estimate = { cents: mddOwnBase.value * indexOf(chain), method: 'chain_index', basis: mddOwnBase.basis };
      } else if (entry.kind === 'mdd' && mddBase) {
        estimate = { cents: mddBase.value * indexOf(chain) * entry.product.packSize, method: 'mdd_ratio', basis: mddBase.basis };
      } else if (entry.kind === 'vrac' && nationalBase) {
        estimate = { cents: nationalBase.value * indexOf(chain), method: 'category_median', basis: nationalBase.basis };
      }
      if (!estimate || !Number.isFinite(estimate.cents)) continue;
      rows.push({
        productId: entry.product.id,
        storeId: store.id,
        priceCents: Math.max(1, Math.round(estimate.cents)),
        updatedAt: snapshot.snapshotAt,
        source: 'estimate',
        estimateMethod: estimate.method,
        estimateBasisCount: estimate.basis,
      });
      coverage[chain].estimated++;
    }
    if (rows.length === 0) {
      warnings.push(`${entry.product.id} : écarté, aucun prix relevé ni estimable`);
      continue;
    }
    products.push(entry.product);
    prices.push(...rows);
  }

  const chainIndex = {} as Record<StoreChain, ChainPriceIndex>;
  for (const chain of allChains) {
    const ix = snapshot.chainIndex[chain];
    chainIndex[chain] = { value: ix.value, basis: ix.basis, commonProducts: ix.commonProducts };
  }
  const meta: CatalogMeta = {
    snapshotAt: snapshot.snapshotAt,
    pricesFrom: snapshot.pricesFrom,
    pricesTo: snapshot.pricesTo,
    observedPrices: prices.filter((p) => p.source === 'open_prices').length,
    estimatedPrices: prices.filter((p) => p.source === 'estimate').length,
    chainIndex,
    coverage,
    sources: DATA_SOURCES.map((s) => ({ ...s })),
  };
  if (snapshot.source?.lastCreatedAt) meta.lastCreatedAt = snapshot.source.lastCreatedAt;
  return { products, prices, meta, warnings };
}

/**
 * Conditionnement d'un produit vrac et facteur « prix relevé → prix du
 * conditionnement » (relevés au kilo ou à la pièce). `null` si l'unité du
 * relevé n'est pas convertible dans l'unité de base de l'ingrédient.
 */
export function loosePack(loose: LooseRef, ing: Ingredient): { size: number; factor: number } | null {
  const gpp = ing.gramsPerPiece && ing.gramsPerPiece > 0 ? ing.gramsPerPiece : undefined;
  const custom = loose.packSize !== undefined && loose.packSize > 0 ? loose.packSize : undefined;
  if (loose.pricePer === 'KILOGRAM') {
    if (ing.baseUnit === 'g') {
      const size = custom ?? Math.max(100, Math.round(gpp ?? 0));
      return { size, factor: size / 1000 };
    }
    if (ing.baseUnit === 'piece' && gpp) {
      const size = custom ?? 1;
      return { size, factor: (size * gpp) / 1000 };
    }
    return null;
  }
  if (ing.baseUnit === 'piece') {
    const size = custom ?? 1;
    return { size, factor: size };
  }
  if (ing.baseUnit === 'g' && gpp) {
    const size = custom ?? gpp;
    return { size, factor: size / gpp };
  }
  return null;
}

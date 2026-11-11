// GENERATED — do not edit.
// Copie générée de src/core par scripts/sync-shared.mjs (npm run sync:shared).
// Toute modification doit être faite dans src/core puis resynchronisée.
/**
 * Données ouvertes Open Prices / Open Food Facts : normalisation PURE des
 * relevés de prix, détection d'enseigne, agrégation et indice de prix.
 *
 * Partagé par :
 *  - le pipeline d'import (`scripts/open-data/`, Node — fichier chargé par
 *    « type stripping », d'où AUCUN import à l'exécution, types uniquement) ;
 *  - l'Edge Function `collect-prices` (Deno, copie `_shared/core`).
 *
 * Règles (voir docs/OPEN_DATA.md) :
 *  - un relevé n'est retenu que s'il vient d'un magasin de France
 *    MÉTROPOLITAINE (hors 97/98, hors stations-service) d'une des 10 enseignes,
 *    en EUR, non doublon, daté dans la fenêtre, avec `receipt_quantity` ≤ 1 et
 *    un GTIN valide (jamais un code « poids variable ») ;
 *  - seul le prix NORMAL compte (un relevé promo sans prix barré est écarté) ;
 *  - le prix d'une enseigne est la médiane de ses relevés, en préférant les
 *    formats hyper / super (les formats de proximité sont plus chers) ;
 *  - le champ `owner` (pseudonyme du contributeur) n'est JAMAIS lu ni conservé.
 *
 * Licence des données : ODbL (Open Food Facts, Open Prices, OpenStreetMap).
 */
import type { Allergen, BaseUnit, ChainPriceIndex, StoreChain } from './types.ts';

// ─── Sources ─────────────────────────────────────────────────────────────────

/** Exports quotidiens complets d'Open Prices (JSONL compressé, ODbL). */
export const OPEN_PRICES_DUMP_URLS = {
  prices: 'https://prices.openfoodfacts.org/data/prices.jsonl.gz',
  locations: 'https://prices.openfoodfacts.org/data/locations.jsonl.gz',
} as const;

/** User-Agent des appels automatisés (aucune information personnelle). */
export const OPEN_DATA_USER_AGENT = 'Cabas-dev/1.0 (open-data import)';

// ─── Texte ───────────────────────────────────────────────────────────────────

const ACCENTS: Record<string, string> = {
  à: 'a', á: 'a', â: 'a', ä: 'a', ã: 'a', å: 'a',
  ç: 'c',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ñ: 'n',
  ó: 'o', ò: 'o', ô: 'o', ö: 'o', õ: 'o',
  ú: 'u', ù: 'u', û: 'u', ü: 'u',
  ý: 'y', ÿ: 'y',
  œ: 'oe', æ: 'ae',
  '’': "'", '‘': "'", '`': "'",
};

/**
 * Texte « replié » : minuscules, sans accents, tirets / soulignés / espaces
 * multiples ramenés à une espace (« Intermarché  Super » → « intermarche super »).
 * Copie locale volontaire de `text.foldText` : ce fichier n'a aucun import
 * à l'exécution (chargé tel quel par Node).
 */
export function foldName(s: string | null | undefined): string {
  if (!s) return '';
  let out = '';
  for (const ch of s.toLowerCase()) out += ACCENTS[ch] ?? ch;
  return out.replace(/[-_/\s  ]+/g, ' ').trim();
}

// ─── Enseignes ───────────────────────────────────────────────────────────────

/**
 * Motifs de détection, dans l'ordre de `STORE_CHAINS`. Super U : on ne teste
 * JAMAIS « u » seul (trop de faux positifs), seulement les formats du groupe.
 */
const CHAIN_PATTERNS: readonly (readonly [StoreChain, RegExp])[] = [
  ['leclerc', /\bleclerc\b/],
  ['carrefour', /\bcarrefour\b/],
  ['auchan', /\bauchan\b/],
  ['intermarche', /\bintermarche\b/],
  ['superu', /^(?:super u|hyper u|u express|utile|systeme u|marche u)\b/],
  ['lidl', /\blidl\b/],
  ['aldi', /\baldi\b/],
  ['netto', /\bnetto\b/],
  ['monoprix', /\bmonoprix\b|\bmonop\b/],
  ['franprix', /\bfranprix\b/],
];

/** Les 10 enseignes, dans l'ordre d'affichage (identique à `STORE_CHAINS`). */
export const OPEN_DATA_CHAINS: readonly StoreChain[] = CHAIN_PATTERNS.map(([chain]) => chain);

/** Formats de proximité (City, Express, Contact, Utile, Daily, Proxi, Monop'). */
const PROXIMITY_PATTERN = /\b(?:city|express|contact|utile|daily|proxi)|\bmonop\b/;

export interface LocationLike {
  osm_brand?: string | null;
  osm_name?: string | null;
}

/**
 * Enseigne d'un point de vente OpenStreetMap : `osm_brand` d'abord ; `osm_name`
 * seulement si `osm_brand` est vide (une marque renseignée mais inconnue —
 * « Biocoop », « Mondial Relay » — ne retombe pas sur le nom).
 * `proximity` : format de proximité (nom ou marque contenant city, express…).
 */
export function detectChain(loc: LocationLike): { chain: StoreChain; proximity: boolean } | null {
  const brand = foldName(loc.osm_brand);
  const name = foldName(loc.osm_name);
  const text = brand || name;
  if (!text) return null;
  for (const [chain, pattern] of CHAIN_PATTERNS) {
    if (pattern.test(text)) {
      return { chain, proximity: PROXIMITY_PATTERN.test(`${brand} ${name}`) };
    }
  }
  return null;
}

/**
 * Magasin de France métropolitaine (Corse comprise) : code pays `FR` (ou, à
 * défaut de code, pays « France »), code postal hors 97 / 98 (outre-mer).
 * Un code pays renseigné autre que FR l'emporte sur le libellé « France ».
 */
export function isFranceMetro(loc: {
  osm_address_country_code?: string | null;
  osm_address_country?: string | null;
  osm_address_postcode?: string | null;
}): boolean {
  const code = (loc.osm_address_country_code ?? '').trim().toUpperCase();
  const country = (loc.osm_address_country ?? '').trim();
  if (code ? code !== 'FR' : country !== 'France') return false;
  const postcode = (loc.osm_address_postcode ?? '').trim();
  return !/^9[78]/.test(postcode);
}

// ─── GTIN ────────────────────────────────────────────────────────────────────

/** Clé de contrôle GS1 des chiffres qui la précèdent (GTIN-8 / 12 / 13 / 14). */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let k = 0; k < body.length; k++) {
    const digit = body.charCodeAt(body.length - 1 - k) - 48;
    sum += k % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Code-barres produit exploitable : GTIN-8 ou GTIN-13, clé valide, pas une
 * suite de zéros, et JAMAIS un code « poids variable » (13 chiffres
 * commençant par 2 : étiquette de pesée en magasin, propre à un magasin).
 */
export function isValidGtin(code: string): boolean {
  if (typeof code !== 'string' || !/^(?:\d{8}|\d{13})$/.test(code)) return false;
  if (/^0+$/.test(code)) return false;
  if (code.length === 13 && code[0] === '2') return false;
  return gtinCheckDigit(code.slice(0, -1)) === code.charCodeAt(code.length - 1) - 48;
}

/**
 * Forme canonique d'un code-barres : espaces retirés, UPC-A (12 chiffres) et
 * GTIN-14 à zéro initial ramenés à 13 chiffres. `null` si invalide.
 */
export function normalizeGtin(code: string | null | undefined): string | null {
  if (typeof code !== 'string') return null;
  let c = code.replace(/\s+/g, '');
  if (/^\d{12}$/.test(c)) c = `0${c}`;
  else if (/^0\d{13}$/.test(c)) c = c.slice(1);
  return isValidGtin(c) ? c : null;
}

// ─── Relevés ─────────────────────────────────────────────────────────────────

/** Relevé Open Prices brut (API `/api/v1/prices` ou export JSONL joint aux lieux). */
export interface RawPriceItem {
  type?: 'PRODUCT' | 'CATEGORY' | null;
  product_code?: string | null;
  category_tag?: string | null;
  labels_tags?: string[] | null;
  origins_tags?: string[] | null;
  price?: number | string | null;
  price_is_discounted?: boolean | null;
  price_without_discount?: number | string | null;
  price_per?: string | null;
  currency?: string | null;
  date?: string | null;
  /** Nombre (API) ou chaîne « 1.000 » (export JSONL). */
  receipt_quantity?: number | string | null;
  duplicate_of?: number | null;
  location?: {
    osm_brand?: string | null;
    osm_name?: string | null;
    osm_address_country_code?: string | null;
    osm_address_country?: string | null;
    osm_address_postcode?: string | null;
    osm_tag_value?: string | null;
  } | null;
}

/** Relevé normalisé (prix en euros, comme la source). */
export interface PriceObservation {
  /** `ean:<gtin>` ou `cat:<category_tag>:<KILOGRAM|UNIT>`. */
  key: string;
  chain: StoreChain;
  proximity: boolean;
  /** Prix normal (hors promo), €. */
  regularEur: number;
  /** Prix payé en promo, € (relevé promo avec prix barré connu). */
  promoEur?: number;
  /** `null` : prix du conditionnement (code-barres) ; sinon prix au kilo / à la pièce (vrac). */
  pricePer: 'KILOGRAM' | 'UNIT' | null;
  /** Jour du relevé (YYYY-MM-DD). */
  date: string;
  /** Relevé vrac étiqueté bio. */
  organic: boolean;
}

/** Prix maximal plausible d'un relevé (payé ou barré), €. */
export const MAX_PRICE_EUR = 10_000;

/** Étiquettes « bio » d'un relevé vrac. */
const ORGANIC_LABELS = new Set(['en:organic', 'en:eu-organic', 'fr:ab-agriculture-biologique']);

/** Nombre décimal (« 1.250 », « 1,25 », 1.25) ; `NaN` si illisible. */
function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || !value.trim()) return Number.NaN;
  return Number(value.trim().replace(',', '.'));
}

/** Clé d'un relevé par code-barres. */
export function eanKey(gtin: string): string {
  return `ean:${gtin}`;
}

/** Clé d'un relevé vrac (catégorie Open Food Facts + unité de prix). */
export function categoryKey(categoryTag: string, pricePer: 'KILOGRAM' | 'UNIT'): string {
  return `cat:${categoryTag}:${pricePer}`;
}

/**
 * Clé d'agrégat de l'instantané : celle du relevé, suffixée `:organic` pour les
 * relevés vrac bio (le vrac conventionnel et le bio sont agrégés séparément).
 */
export function aggregateKey(obs: Pick<PriceObservation, 'key' | 'pricePer' | 'organic'>): string {
  return obs.pricePer !== null && obs.organic ? `${obs.key}:organic` : obs.key;
}

/**
 * Applique TOUS les filtres obligatoires à un relevé et le normalise ;
 * `null` si le relevé doit être écarté. `window` : bornes incluses (YYYY-MM-DD).
 */
export function normalizeObservation(
  raw: RawPriceItem,
  window: { from: string; to: string },
): PriceObservation | null {
  const loc = raw.location;
  if (!loc || typeof loc !== 'object') return null;
  if (!isFranceMetro(loc)) return null;
  if ((loc.osm_tag_value ?? '').trim().toLowerCase() === 'fuel') return null;
  const detected = detectChain(loc);
  if (!detected) return null;

  if ((raw.currency ?? '').trim().toUpperCase() !== 'EUR') return null;
  if (raw.duplicate_of !== null && raw.duplicate_of !== undefined) return null;

  const date = typeof raw.date === 'string' ? raw.date.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < window.from || date > window.to) return null;

  if (raw.receipt_quantity !== null && raw.receipt_quantity !== undefined) {
    const qty = toNumber(raw.receipt_quantity);
    if (!(qty > 0 && qty <= 1)) return null;
  }

  const price = toNumber(raw.price);
  if (!Number.isFinite(price) || price < 0.01 || price > MAX_PRICE_EUR) return null;
  let regularEur = price;
  let promoEur: number | undefined;
  if (raw.price_is_discounted) {
    // Promo : seul le prix barré dit le prix normal ; sans lui, relevé écarté.
    // Même plafond que le prix payé : un prix barré saisi « 9999999 » est écarté.
    const before = toNumber(raw.price_without_discount);
    if (!(Number.isFinite(before) && before > price && before <= MAX_PRICE_EUR)) return null;
    regularEur = before;
    promoEur = price;
  }

  const type = raw.type ?? (raw.product_code ? 'PRODUCT' : raw.category_tag ? 'CATEGORY' : null);
  let key: string;
  let pricePer: PriceObservation['pricePer'] = null;
  if (type === 'PRODUCT') {
    const gtin = normalizeGtin(raw.product_code);
    if (!gtin) return null;
    // Un code-barres se relève au conditionnement ; « au kilo » serait ambigu.
    if (raw.price_per && raw.price_per !== 'UNIT') return null;
    key = eanKey(gtin);
  } else if (type === 'CATEGORY') {
    const tag = (raw.category_tag ?? '').trim().toLowerCase();
    if (!/^[a-z]{2}:\S+$/.test(tag)) return null;
    if (raw.price_per !== 'KILOGRAM' && raw.price_per !== 'UNIT') return null;
    pricePer = raw.price_per;
    key = categoryKey(tag, pricePer);
  } else {
    return null;
  }

  const organic = (raw.labels_tags ?? []).some((t) => ORGANIC_LABELS.has(String(t).toLowerCase()));
  const obs: PriceObservation = {
    key,
    chain: detected.chain,
    proximity: detected.proximity,
    regularEur,
    pricePer,
    date,
    organic,
  };
  if (promoEur !== undefined) obs.promoEur = promoEur;
  return obs;
}

// ─── Agrégation ──────────────────────────────────────────────────────────────

export interface AggregatedPrice {
  /** Médiane du prix normal, centimes entiers. */
  medianCents: number;
  /** Nombre de relevés agrégés. */
  count: number;
  /** Plus ancien / plus récent relevé pris en compte (YYYY-MM-DD). */
  from: string;
  to: string;
  /**
   * Présent (vrai) si la médiane ne repose QUE sur des formats de proximité
   * (aucun relevé hyper / super) : un relevé hyper / super la remplacera.
   */
  proximityOnly?: true;
}

/** Médiane d'une liste de nombres (moyenne des deux valeurs centrales si paire). */
export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Prix d'une enseigne pour UNE clé : médiane du prix normal des relevés, en
 * ne gardant que les relevés hors proximité s'il y en a. Calcul en
 * millièmes d'euro entiers (précision de la source) pour un arrondi stable.
 */
export function aggregateObservations(obs: readonly PriceObservation[]): AggregatedPrice | null {
  if (obs.length === 0) return null;
  const regular = obs.filter((o) => !o.proximity);
  const used = regular.length > 0 ? regular : obs;
  const milli = used.map((o) => Math.round(o.regularEur * 1000));
  const medianCents = Math.max(1, Math.round(median(milli) / 10));
  let from = used[0].date;
  let to = used[0].date;
  for (const o of used) {
    if (o.date < from) from = o.date;
    if (o.date > to) to = o.date;
  }
  const agg: AggregatedPrice = { medianCents, count: used.length, from, to };
  if (regular.length === 0) agg.proximityOnly = true;
  return agg;
}

// ─── Indice de prix des enseignes ────────────────────────────────────────────

/**
 * Indices « presse » (Leclerc = 1), utilisés seulement quand l'instantané ne
 * permet pas de mesurer une enseigne (moins de `minCommon` produits communs) :
 * comparatifs publics de paniers 2025-2026.
 */
export const PRESS_CHAIN_INDEX: Readonly<Record<StoreChain, number>> = {
  leclerc: 1,
  carrefour: 1.07,
  auchan: 1.12,
  intermarche: 1.04,
  superu: 1.04,
  lidl: 0.98,
  aldi: 1.02,
  netto: 1.0,
  monoprix: 1.22,
  franprix: 1.28,
};

export interface ChainIndexOptions {
  /** Produits communs minimum pour une mesure (défaut 200). */
  minCommon?: number;
  /** Bornes de l'indice mesuré (défaut [0,85 ; 1,6]). */
  bounds?: readonly [number, number];
  /** Valeurs de repli (défaut `PRESS_CHAIN_INDEX`). */
  press?: Readonly<Record<StoreChain, number>>;
}

/**
 * Indice de prix de chaque enseigne vs Leclerc : moyenne géométrique des
 * ratios `prix enseigne / prix Leclerc` sur les MÊMES codes-barres.
 * Entrée : pour chaque code-barres, la médiane (hors proximité, prix normal)
 * de chaque enseigne qui l'a relevé. Valeur arrondie au millième.
 */
export function computeChainIndex(
  medians: Iterable<Partial<Record<StoreChain, number>>>,
  options: ChainIndexOptions = {},
): Record<StoreChain, ChainPriceIndex> {
  const minCommon = options.minCommon ?? 200;
  const [lo, hi] = options.bounds ?? [0.85, 1.6];
  const press = options.press ?? PRESS_CHAIN_INDEX;
  const logSums = new Map<StoreChain, number>();
  const counts = new Map<StoreChain, number>();
  let leclercProducts = 0;
  for (const byChain of medians) {
    const ref = byChain.leclerc;
    if (!(typeof ref === 'number' && ref > 0)) continue;
    leclercProducts++;
    for (const chain of OPEN_DATA_CHAINS) {
      if (chain === 'leclerc') continue;
      const v = byChain[chain];
      if (!(typeof v === 'number' && v > 0)) continue;
      logSums.set(chain, (logSums.get(chain) ?? 0) + Math.log(v / ref));
      counts.set(chain, (counts.get(chain) ?? 0) + 1);
    }
  }
  const out = {} as Record<StoreChain, ChainPriceIndex>;
  for (const chain of OPEN_DATA_CHAINS) {
    if (chain === 'leclerc') {
      out[chain] = { value: 1, basis: 'measured', commonProducts: leclercProducts };
      continue;
    }
    const n = counts.get(chain) ?? 0;
    if (n >= minCommon) {
      const raw = Math.exp((logSums.get(chain) ?? 0) / n);
      const value = Math.round(Math.min(hi, Math.max(lo, raw)) * 1000) / 1000;
      out[chain] = { value, basis: 'measured', commonProducts: n };
    } else {
      out[chain] = { value: press[chain], basis: 'press', commonProducts: n };
    }
  }
  return out;
}

// ─── Open Food Facts : allergènes ────────────────────────────────────────────

/** Tags Open Food Facts (sans préfixe de langue, repliés) → allergène réglementaire. */
const OFF_ALLERGEN_TAGS: Readonly<Record<string, Allergen>> = {
  gluten: 'gluten',
  'cereals-containing-gluten': 'gluten',
  'cereales-contenant-du-gluten': 'gluten',
  wheat: 'gluten',
  ble: 'gluten',
  oats: 'gluten',
  avoine: 'gluten',
  barley: 'gluten',
  orge: 'gluten',
  rye: 'gluten',
  seigle: 'gluten',
  spelt: 'gluten',
  epeautre: 'gluten',
  kamut: 'gluten',
  crustaceans: 'crustaces',
  crustaces: 'crustaces',
  eggs: 'oeufs',
  egg: 'oeufs',
  oeufs: 'oeufs',
  oeuf: 'oeufs',
  fish: 'poissons',
  poisson: 'poissons',
  poissons: 'poissons',
  peanuts: 'arachides',
  peanut: 'arachides',
  arachides: 'arachides',
  arachide: 'arachides',
  soybeans: 'soja',
  soy: 'soja',
  soja: 'soja',
  milk: 'lait',
  lait: 'lait',
  lactose: 'lait',
  nuts: 'fruits_a_coque',
  'fruits-a-coque': 'fruits_a_coque',
  'tree-nuts': 'fruits_a_coque',
  almonds: 'fruits_a_coque',
  amandes: 'fruits_a_coque',
  hazelnuts: 'fruits_a_coque',
  noisettes: 'fruits_a_coque',
  walnuts: 'fruits_a_coque',
  'cashew-nuts': 'fruits_a_coque',
  'pecan-nuts': 'fruits_a_coque',
  'pistachio-nuts': 'fruits_a_coque',
  'macadamia-nuts': 'fruits_a_coque',
  'brazil-nuts': 'fruits_a_coque',
  celery: 'celeri',
  celeri: 'celeri',
  mustard: 'moutarde',
  moutarde: 'moutarde',
  'sesame-seeds': 'sesame',
  sesame: 'sesame',
  'graines-de-sesame': 'sesame',
  'sulphur-dioxide-and-sulphites': 'sulfites',
  'anhydride-sulfureux-et-sulfites': 'sulfites',
  sulphites: 'sulfites',
  sulfites: 'sulfites',
  lupin: 'lupin',
  molluscs: 'mollusques',
  mollusques: 'mollusques',
};

/** Tags qui signifient « aucun allergène » (ni allergène, ni inconnu). */
const OFF_NO_ALLERGEN_TAGS = new Set(['none', 'aucun']);

/**
 * Repérage PRUDENT des tags en texte libre (« fr:Avoine ou hybrides… »,
 * « en:Metabisulphite ») : l'allergène est ajouté ET le tag reste signalé
 * comme inconnu, pour relecture. Mieux vaut un allergène de trop.
 */
const OFF_ALLERGEN_KEYWORDS: readonly (readonly [RegExp, Allergen])[] = [
  [/gluten|\bble\b|froment|wheat|avoine|\boats?\b|orge|barley|seigle|\brye\b|epeautre|spelt|kamut|trigo|weizen|hafer|avena/, 'gluten'],
  [/crustac|crevette|shrimp|prawn|crabe|crab|homard|lobster|langoust/, 'crustaces'],
  [/oeuf|\beggs?\b|\bei\b/, 'oeufs'],
  [/poisson|\bfish\b|fisch|anchois|thon|saumon|cabillaud/, 'poissons'],
  [/arachide|cacahuete|peanut|erdnuss/, 'arachides'],
  [/soja|\bsoy|sojabohn/, 'soja'],
  [/\blait|milk|lact|\bmilch|fromage|cheese|\bcreme\b|\bbeurre\b|butter/, 'lait'],
  [/fruits? a coque|\bnoix\b|noisette|amande|cajou|pistache|pecan|macadamia|\bnuts?\b|walnuss|haselnuss|mandel|paranuss/, 'fruits_a_coque'],
  [/celeri|celery|sellerie/, 'celeri'],
  [/moutarde|mustard|senf/, 'moutarde'],
  [/sesame|sesam/, 'sesame'],
  [/sulfit|sulphit|sulfureux|sulphur|bisulfit|bisulphit|\bso2\b/, 'sulfites'],
  [/lupin/, 'lupin'],
  [/mollus|moule|huitre|calamar|seiche|poulpe|mussel|oyster|squid/, 'mollusques'],
];

/** Ordre réglementaire (identique à `ALLERGENS` de types.ts). */
const ALLERGEN_ORDER: readonly Allergen[] = [
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
];

/**
 * Tags `allergens_tags` (ou `traces_tags`) d'Open Food Facts → allergènes
 * réglementaires. `unknown` : tags non reconnus tels quels (texte libre,
 * autre langue…) — à RELIRE, jamais ignorés ; un mot-clé reconnu dans un tag
 * inconnu ajoute quand même l'allergène (principe de prudence).
 */
export function mapOffAllergens(tags: readonly string[]): { allergens: Allergen[]; unknown: string[] } {
  const found = new Set<Allergen>();
  const unknown = new Set<string>();
  for (const rawTag of tags) {
    if (typeof rawTag !== 'string' || !rawTag.trim()) continue;
    const tag = rawTag.trim();
    const bare = foldName(tag.replace(/^[a-z]{2,3}:/i, ''));
    const slug = bare.replace(/[\s']+/g, '-');
    if (OFF_NO_ALLERGEN_TAGS.has(slug)) continue;
    const exact = OFF_ALLERGEN_TAGS[slug];
    if (exact) {
      found.add(exact);
      continue;
    }
    unknown.add(tag);
    const words = bare.replace(/-/g, ' ');
    for (const [pattern, allergen] of OFF_ALLERGEN_KEYWORDS) if (pattern.test(words)) found.add(allergen);
  }
  return {
    allergens: ALLERGEN_ORDER.filter((a) => found.has(a)),
    unknown: [...unknown].sort(),
  };
}

// ─── Open Food Facts : contenance ────────────────────────────────────────────

/** Facteur vers l'unité de base, par unité écrite. */
const MASS_VOLUME_UNITS: Readonly<Record<string, { factor: number; unit: BaseUnit }>> = {
  kg: { factor: 1000, unit: 'g' },
  kilo: { factor: 1000, unit: 'g' },
  kilos: { factor: 1000, unit: 'g' },
  kilogramme: { factor: 1000, unit: 'g' },
  kilogrammes: { factor: 1000, unit: 'g' },
  g: { factor: 1, unit: 'g' },
  gr: { factor: 1, unit: 'g' },
  grs: { factor: 1, unit: 'g' },
  gram: { factor: 1, unit: 'g' },
  grams: { factor: 1, unit: 'g' },
  gramme: { factor: 1, unit: 'g' },
  grammes: { factor: 1, unit: 'g' },
  mg: { factor: 0.001, unit: 'g' },
  oz: { factor: 28.3495, unit: 'g' },
  lb: { factor: 453.592, unit: 'g' },
  lbs: { factor: 453.592, unit: 'g' },
  l: { factor: 1000, unit: 'ml' },
  litre: { factor: 1000, unit: 'ml' },
  litres: { factor: 1000, unit: 'ml' },
  liter: { factor: 1000, unit: 'ml' },
  liters: { factor: 1000, unit: 'ml' },
  dl: { factor: 100, unit: 'ml' },
  cl: { factor: 10, unit: 'ml' },
  ml: { factor: 1, unit: 'ml' },
};

const UNIT_ALTERNATION = Object.keys(MASS_VOLUME_UNITS)
  .sort((a, b) => b.length - a.length)
  .join('|');
const NUM = '(\\d+(?:[.,]\\d+)?)';
/**
 * « 500 g », « 2 x 75 g », « 3 sachets de 70 g », « 1,5 l ». Le 1er motif du
 * texte gagne (lot écrit après : voir `TRAILING_COUNT_RE`).
 */
const MASS_VOLUME_RE = new RegExp(
  `(?:(\\d+)\\s*(?:x|×|\\*|[a-z]+\\s+(?:de|d')\\s*)\\s*)?${NUM}\\s*(${UNIT_ALTERNATION})(?![a-z])`,
);
/** Lot écrit APRÈS la contenance : « 125 g x 4 », « 125g x4 », « 1 l x 6 ». */
const TRAILING_COUNT_RE = new RegExp(`${NUM}\\s*(${UNIT_ALTERNATION})\\s*(?:x|×|\\*)\\s*(\\d+)(?![\\d.,])`);
/** Masse composée « 1 kg 500 » (= 1,5 kg), sans unité après le second nombre. */
const COMPOUND_KG_RE = /(\d+)\s*kg\s*(\d{1,3})(?![\d.,])(?!\s*(?:x|×|\*|[a-z]))/;
const PIECES_RE =
  /(\d+)\s*(?:pieces?|pcs?|unites?|oeufs?|tranches?|portions?|sachets?|galettes?|tortillas?|wraps?|pains?|feuilles?|cubes?|tablettes?|capsules?|dosettes?|steaks?|filets?|briques?|pots?|bouteilles?|boites?|canettes?|citrons?|avocats?)\b|(?:^|\s)(?:x|×)\s*(\d+)\b|^(\d+)\s*(?:x|×)$/;

/** Bornes de plausibilité d'une contenance (au-delà : donnée fausse, « 250 kg » pour 250 g). */
const MAX_SIZE: Readonly<Record<BaseUnit, number>> = { g: 30_000, ml: 30_000, piece: 500 };

function plausible(size: number, unit: BaseUnit): { size: number; unit: BaseUnit } | null {
  if (!Number.isFinite(size) || size <= 0 || size > MAX_SIZE[unit]) return null;
  return { size: Math.round(size * 1000) / 1000, unit };
}

/**
 * Contenance d'un produit Open Food Facts dans une unité de base : d'abord
 * `product_quantity` + `product_quantity_unit` (calculés par OFF), sinon le
 * texte libre `quantity` (« 2 x 75 g », « 0,5 kg », « 75 cl », « 6 œufs »).
 * `null` si illisible ou invraisemblable.
 */
export function parseOffQuantity(input: {
  quantity?: string | null;
  product_quantity?: number | string | null;
  product_quantity_unit?: string | null;
}): { size: number; unit: BaseUnit } | null {
  const pq = toNumber(input.product_quantity);
  const pqUnit = MASS_VOLUME_UNITS[foldName(input.product_quantity_unit)];
  if (Number.isFinite(pq) && pq > 0 && pqUnit) {
    const fromField = plausible(pq * pqUnit.factor, pqUnit.unit);
    if (fromField) return fromField;
  }
  const text = foldName(input.quantity).replace(/℮/g, ' ');
  if (!text) return null;
  const m = MASS_VOLUME_RE.exec(text);
  if (m) {
    // Même position que le 1er motif (sans lot devant) : « 125 g x 4 » = 500 g, « 1 kg 500 » = 1 500 g.
    if (!m[1]) {
      const trailing = TRAILING_COUNT_RE.exec(text);
      if (trailing && trailing.index === m.index) {
        const tu = MASS_VOLUME_UNITS[trailing[2]];
        return plausible(Number(trailing[3]) * toNumber(trailing[1]) * tu.factor, tu.unit);
      }
      const compound = COMPOUND_KG_RE.exec(text);
      if (compound && compound.index === m.index) {
        return plausible(Number(compound[1]) * 1000 + Number(compound[2]), 'g');
      }
    }
    const unit = MASS_VOLUME_UNITS[m[3]];
    const count = m[1] ? Number(m[1]) : 1;
    const amount = toNumber(m[2]);
    return plausible(count * amount * unit.factor, unit.unit);
  }
  const p = PIECES_RE.exec(text);
  if (p) return plausible(Number(p[1] ?? p[2] ?? p[3]), 'piece');
  return null;
}

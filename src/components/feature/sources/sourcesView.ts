/**
 * Logique de présentation PURE de l'écran « Sources et licences » et des
 * mentions de provenance des prix : d'où viennent produits, prix et enseignes
 * (Open Food Facts, Open Prices, OpenStreetMap — licence ODbL), instantané et
 * fenêtre des relevés, couverture et indice de prix par enseigne, méthode des
 * estimations. Lit `CatalogMeta` (base distante, sinon catalogue embarqué).
 * Aucun import React.
 */
import type { CatalogMeta, ChainPriceIndex, EstimateMethod, Store, StoreChain } from '@/core';
import { MONTH_NAMES, MONTH_SHORT, STORE_CHAINS, storeDisplayName } from '@/core';

import { ESTIMATE_METHOD_COPY } from '../basket/provenanceView';

const NNBSP = ' ';

/** Licence des trois bases ouvertes. */
export const ODBL = { name: 'ODbL 1.0', url: 'https://opendatacommons.org/licenses/odbl/1-0/' } as const;

export interface DataSource {
  id: 'off' | 'open_prices' | 'osm';
  name: string;
  /** Ce que Cabas en tire. */
  what: string;
  url: string;
  license: string;
}

/** Les sources, dans l'ordre produits → prix → enseignes ; URL / licence de `meta.sources` si connues. */
export function dataSources(meta: Pick<CatalogMeta, 'sources'> | null | undefined): DataSource[] {
  const base: DataSource[] = [
    {
      id: 'off',
      name: 'Open Food Facts',
      what: 'Les produits : noms, marques, contenances, Nutri-Score et allergènes déclarés.',
      url: 'https://world.openfoodfacts.org',
      license: ODBL.name,
    },
    {
      id: 'open_prices',
      name: 'Open Prices',
      what: 'Les prix, relevés en magasin par la communauté (tickets et étiquettes).',
      url: 'https://prices.openfoodfacts.org',
      license: ODBL.name,
    },
    {
      id: 'osm',
      name: 'OpenStreetMap',
      what: 'Les enseignes des magasins où les prix ont été relevés. © contributeurs OpenStreetMap.',
      url: 'https://www.openstreetmap.org/copyright',
      license: ODBL.name,
    },
  ];
  const known = meta?.sources ?? [];
  return base.map((s) => {
    const m = known.find((k) => k.name.toLowerCase() === s.name.toLowerCase());
    return m ? { ...s, url: m.url || s.url, license: m.license || s.license } : s;
  });
}

// ─── Nombres et dates ────────────────────────────────────────────────────────

/** « 12 345 » (espace fine insécable). */
export function formatCount(n: number): string {
  const v = Math.max(0, Math.round(Number.isFinite(n) ? n : 0));
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** « 11 novembre 2026 » (`short` : « 11 nov. 2026 »). */
export function formatSnapshotDate(iso: string, short = false): string {
  const m = ISO_DAY.exec(iso ?? '');
  if (!m) return iso;
  const d = Number(m[3]);
  const month = (short ? MONTH_SHORT : MONTH_NAMES)[Number(m[2]) - 1] ?? '';
  return `${d === 1 ? '1er' : d} ${month} ${m[1]}`;
}

/** « novembre 2026 ». */
function monthYear(iso: string): string {
  const m = ISO_DAY.exec(iso ?? '');
  if (!m) return iso;
  return `${MONTH_NAMES[Number(m[2]) - 1] ?? ''} ${m[1]}`.trim();
}

// ─── Mentions ────────────────────────────────────────────────────────────────

/**
 * Attribution des données ouvertes (licence ODbL), OBLIGATOIRE là où les prix
 * sont présentés (DATA_LICENSE.md) : onglet Prix, détail d'un article, ticket
 * de commande. Même texte que `DATA_ATTRIBUTION` de `src/data` (vérifié par les tests).
 */
export const DATA_ATTRIBUTION_LINE =
  'Produits : Open Food Facts · Prix : Open Prices · Enseignes : © contributeurs OpenStreetMap · Licence ODbL';

/**
 * Mention sur l'origine des prix (pied de l'onglet Prix). Même texte que
 * `PRICE_DATA_NOTICE` de `src/data` pour l'instantané embarqué (vérifié par
 * les tests), mais calculé sur l'instantané COURANT (base distante comprise).
 */
export function priceDataNotice(meta: CatalogMeta | null | undefined): string {
  if (!meta) return 'Prix relevés en magasin par la communauté Open Prices. Ils sont indicatifs et peuvent varier selon ton magasin.';
  const parts = [
    `Prix relevés en magasin par la communauté Open Prices entre ${monthYear(meta.pricesFrom)} et ${monthYear(meta.pricesTo)}.`,
  ];
  const total = meta.observedPrices + meta.estimatedPrices;
  if (meta.estimatedPrices > 0 && total > 0) {
    const share = Math.round((100 * meta.estimatedPrices) / total);
    const label = share < 1 ? `Moins de 1${NNBSP}%` : `${share}${NNBSP}%`;
    parts.push(`${label} d’entre eux, faute de relevé, sont estimés et signalés « Estimé ».`);
  }
  parts.push('Ils sont indicatifs et peuvent varier selon ton magasin.');
  return parts.join(' ');
}

export interface SnapshotSummary {
  /** « Instantané du 11 novembre 2026 ». */
  title: string;
  /** « Relevés du 11 nov. 2025 au 11 nov. 2026 ». */
  window: string;
  /** « 12 345 prix relevés · 2 345 estimés (16 %) ». */
  counts: string;
}

export function snapshotSummary(meta: CatalogMeta | null | undefined): SnapshotSummary | null {
  if (!meta) return null;
  const total = meta.observedPrices + meta.estimatedPrices;
  const share = total > 0 ? Math.round((100 * meta.estimatedPrices) / total) : 0;
  const estimated =
    meta.estimatedPrices > 0
      ? ` · ${formatCount(meta.estimatedPrices)} estimé${meta.estimatedPrices > 1 ? 's' : ''} (${share < 1 ? '< 1' : share}${NNBSP}%)`
      : '';
  return {
    title: `Instantané du ${formatSnapshotDate(meta.snapshotAt)}`,
    window: `Relevés du ${formatSnapshotDate(meta.pricesFrom, true)} au ${formatSnapshotDate(meta.pricesTo, true)}`,
    counts:
      meta.observedPrices + meta.estimatedPrices === 0
        ? 'Aucun prix dans cet instantané pour l’instant'
        : `${formatCount(meta.observedPrices)} prix relevé${meta.observedPrices > 1 ? 's' : ''}${estimated}`,
  };
}

// ─── Par enseigne ────────────────────────────────────────────────────────────

/** Indice base 100 (Leclerc = 100) : « 108 ». */
export function indexBase100(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 1) * 100);
}

/** « Mesuré sur 3 233 produits communs » / « D’après les comparatifs de la presse ». */
export function indexBasisLabel(index: ChainPriceIndex, chain: StoreChain): string {
  if (chain === 'leclerc') return 'Référence des indices';
  if (index.basis === 'press') return 'D’après les comparatifs de la presse (pas assez de relevés communs)';
  const many = index.commonProducts > 1;
  return `Mesuré sur ${formatCount(index.commonProducts)} produit${many ? 's' : ''} commun${many ? 's' : ''} avec Leclerc`;
}

/** « Référence », « ≈ 8 % plus cher », « ≈ 2 % moins cher », « Comme Leclerc ». */
export function indexComparison(index: number, chain: StoreChain): string {
  if (chain === 'leclerc') return 'Référence';
  const diff = index - 100;
  if (diff === 0) return 'Comme Leclerc';
  return `≈${NNBSP}${Math.abs(diff)}${NNBSP}% ${diff > 0 ? 'plus cher' : 'moins cher'}`;
}

export interface ChainRow {
  chain: StoreChain;
  name: string;
  observed: number;
  estimated: number;
  /** « 1 234 relevés · 56 estimés » (« Aucun prix pour l’instant »). */
  coverage: string;
  /** Indice base 100 (Leclerc = 100). */
  index: number;
  basis: ChainPriceIndex['basis'];
  basisLabel: string;
  /** « ≈ 8 % plus cher » que Leclerc (« Référence » pour Leclerc). */
  comparison: string;
  /** Phrase lue par les lecteurs d'écran. */
  a11y: string;
}

/** Couverture et indice de chaque enseigne, dans l'ordre d'affichage (`STORE_CHAINS`). */
export function chainRows(meta: CatalogMeta | null | undefined, stores: readonly Pick<Store, 'chain' | 'name'>[] = []): ChainRow[] {
  if (!meta) return [];
  return STORE_CHAINS.map((chain) => {
    const cov = meta.coverage?.[chain] ?? { observed: 0, estimated: 0 };
    const idx = meta.chainIndex?.[chain] ?? { value: 1, basis: 'press' as const, commonProducts: 0 };
    const store = stores.find((s) => s.chain === chain) ?? { chain, name: chain };
    const name = storeDisplayName(store);
    const parts = [
      cov.observed > 0 ? `${formatCount(cov.observed)} relevé${cov.observed > 1 ? 's' : ''}` : null,
      cov.estimated > 0 ? `${formatCount(cov.estimated)} estimé${cov.estimated > 1 ? 's' : ''}` : null,
    ].filter(Boolean);
    const coverage = parts.length > 0 ? parts.join(' · ') : 'Aucun prix pour l’instant';
    const index = indexBase100(idx.value);
    const basisLabel = indexBasisLabel(idx, chain);
    const comparison = indexComparison(index, chain);
    return {
      chain,
      name,
      observed: cov.observed,
      estimated: cov.estimated,
      coverage,
      index,
      basis: idx.basis,
      basisLabel,
      comparison,
      a11y: `${name} : ${coverage.replace(/ · /g, ', ')}. Indice de prix ${index}, ${
        chain === 'leclerc' ? 'référence' : `${comparison.replace('≈', 'environ').replace(/\u202F/g, ' ')} que Leclerc`
      }. ${basisLabel}.`,
    };
  });
}

// ─── Méthode des estimations ─────────────────────────────────────────────────

/**
 * Les trois méthodes, expliquées simplement (ordre : même produit, MDD, vrac).
 * `chain_index` couvre les marques nationales et bio, et les MDD vendues dans
 * plusieurs enseignes (Intermarché / Netto) relevées dans l'une d'elles.
 */
export const ESTIMATE_METHODS: readonly { method: EstimateMethod; title: string; body: string }[] = [
  { method: 'chain_index', title: 'Même produit, relevé ailleurs', body: ESTIMATE_METHOD_COPY.chain_index.long },
  { method: 'mdd_ratio', title: 'Marque distributeur sans relevé', body: ESTIMATE_METHOD_COPY.mdd_ratio.long },
  { method: 'category_median', title: 'Fruits et légumes en vrac', body: ESTIMATE_METHOD_COPY.category_median.long },
];

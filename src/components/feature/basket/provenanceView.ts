/**
 * Provenance d'un prix, présentée à l'utilisateur (logique PURE, sans React) :
 * - relevé Open Prices : « Relevé le 5 nov. · 3 relevés » ;
 * - estimation : badge « Estimé » + explication de la méthode ;
 * - ancien catalogue fictif / provenance inconnue (caches) : rien.
 * Les champs viennent de `StoreOffer` (copiés de `Price` par core).
 */
import type { EstimateMethod, Product, StoreOffer } from '@/core';
import { daysBetween, MONTH_NAMES, MONTH_SHORT } from '@/core';

export type ProvenanceKind = 'observed' | 'estimate' | 'none';

export interface PriceProvenance {
  kind: ProvenanceKind;
  /** Ligne affichée sous le produit (« Relevé le 5 nov. · 3 relevés »), sinon null. */
  text: string | null;
  /** Phrase lue par les lecteurs d'écran, sinon null. */
  a11y: string | null;
}

/** Explication courte de chaque méthode d'estimation. */
export const ESTIMATE_METHOD_COPY: Record<EstimateMethod, { short: string; long: string }> = {
  chain_index: {
    short: 'D’après les prix relevés ailleurs',
    long: 'Pas encore de relevé dans cette enseigne : on part des prix relevés ailleurs, ajustés au niveau de prix de l’enseigne.',
  },
  mdd_ratio: {
    short: 'D’après une marque distributeur équivalente',
    long: 'Pas encore de relevé pour cette marque distributeur : on part du prix au kilo de marques distributeur équivalentes relevées ailleurs.',
  },
  category_median: {
    short: 'D’après le prix médian du vrac',
    long: 'Pas encore de relevé dans cette enseigne : on part du prix médian du vrac en France, ajusté au niveau de prix de l’enseigne.',
  },
};

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Date relative courte d'un relevé : « aujourd’hui », « hier », « le 5 nov. »,
 * « le 5 nov. 2025 » (autre année). `long` : mois en toutes lettres (lecteurs d'écran).
 */
export function observedDayLabel(iso: string, todayIso: string, long = false): string | null {
  const m = ISO_DAY.exec(iso ?? '');
  const today = ISO_DAY.exec(todayIso ?? '');
  if (!m) return null;
  const [, y, mo, d] = m;
  if (today) {
    const diff = daysBetween(todayIso.slice(0, 10), iso.slice(0, 10));
    if (diff === 0) return 'aujourd’hui';
    if (diff === -1) return 'hier';
  }
  const day = Number(d) === 1 ? '1er' : String(Number(d));
  const month = (long ? MONTH_NAMES : MONTH_SHORT)[Number(mo) - 1];
  if (!month) return null;
  const year = today && today[1] !== y ? ` ${y}` : '';
  return `le ${day} ${month}${year}`;
}

/** « 1 relevé », « 3 relevés ». */
export function observationsLabel(n: number): string {
  return `${n} relevé${n > 1 ? 's' : ''}`;
}

/** Provenance affichable d'une offre (ou d'une ligne qui en porte les champs). */
export function priceProvenance(
  offer: Pick<StoreOffer, 'priceSource' | 'priceUpdatedAt' | 'observationCount' | 'estimateMethod'>,
  todayIso: string,
): PriceProvenance {
  if (offer.priceSource === 'estimate') {
    const method = offer.estimateMethod ? ESTIMATE_METHOD_COPY[offer.estimateMethod] : null;
    return {
      kind: 'estimate',
      text: method?.short ?? null,
      a11y: `prix estimé, faute de relevé dans cette enseigne${method ? `, ${lowerFirst(method.short)}` : ''}`,
    };
  }
  if (offer.priceSource === 'open_prices' || offer.priceSource === 'partner' || offer.priceSource === 'collect') {
    const day = offer.priceUpdatedAt ? observedDayLabel(offer.priceUpdatedAt, todayIso) : null;
    const dayLong = offer.priceUpdatedAt ? observedDayLabel(offer.priceUpdatedAt, todayIso, true) : null;
    const n = offer.observationCount;
    const count = typeof n === 'number' && n > 0 ? observationsLabel(n) : null;
    const text = [day ? `Relevé ${day}` : 'Prix relevé', count].filter(Boolean).join(' · ');
    const a11y = [`prix relevé en magasin${dayLong ? ` ${dayLong}` : ''}`, count].filter(Boolean).join(', ');
    return { kind: 'observed', text, a11y };
  }
  return { kind: 'none', text: null, a11y: null };
}

function lowerFirst(s: string): string {
  return s.length ? s[0].toLowerCase() + s.slice(1) : s;
}

/** Fiche Open Food Facts d'un produit (null pour le vrac, sans code-barres). */
export function offProductUrl(product: Pick<Product, 'ean'> | null | undefined): string | null {
  const ean = product?.ean?.trim();
  return ean && /^\d{8,14}$/.test(ean) ? `https://world.openfoodfacts.org/product/${ean}` : null;
}

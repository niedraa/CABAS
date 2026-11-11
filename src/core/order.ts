/**
 * Transmission de commande (V1) : panier pré-rempli puis redirection vers le
 * drive / la livraison de l'enseigne, et version texte de la commande
 * (copier / partager).
 */
import type { BasketStorePart, OrderChannel, OrderHandoff, Product, Store } from './types';
import { createId } from './ids';
import { formatPrice } from './money';
import { isInStoreOnly, storeServiceLabel } from './labels';

type ProductLookup = Record<string, Product> | Map<string, Product>;

function getProduct(products: ProductLookup, id: string): Product | undefined {
  return products instanceof Map ? products.get(id) : products[id];
}

/**
 * URL de recherche drive pour un produit (« {query} » remplacé, encodé).
 * Gabarit sans `{query}` (enseigne sans recherche adressable : Netto,
 * Franprix) : l'URL est ouverte telle quelle.
 */
export function buildProductSearchUrl(store: Store, product: Product): string {
  const template = store.searchUrlTemplate ?? '';
  if (!template.includes('{query}')) return template;
  const query = `${product.name} ${product.brand ?? ''}`.replace(/\s+/g, ' ').trim();
  return template.split('{query}').join(encodeURIComponent(query));
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Ajoute (ou remplace) des paramètres de requête, en préservant l'ancre (#…). */
export function appendQueryParams(url: string, params: Record<string, string>): string {
  const hashIndex = url.indexOf('#');
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
  const base = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const qIndex = base.indexOf('?');
  const path = qIndex >= 0 ? base.slice(0, qIndex) : base;
  const existing = qIndex >= 0 ? base.slice(qIndex + 1).split('&').filter(Boolean) : [];
  const keys = new Set(Object.keys(params));
  const kept = existing.filter((pair) => !keys.has(safeDecode(pair.split('=')[0])));
  const added = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  const all = [...kept, ...added];
  return `${path}${all.length ? `?${all.join('&')}` : ''}${hash}`;
}

export const UTM_PARAMS = { utm_source: 'cabas', utm_medium: 'app' } as const;

/**
 * Prépare la transmission d'une partie du panier (un magasin). L'URL ouvre
 * le drive de l'enseigne (ou, à défaut, la recherche du premier produit),
 * avec les paramètres UTM de Cabas.
 */
export function buildOrderHandoff(
  part: BasketStorePart,
  store: Store,
  productsById: ProductLookup,
  channel: OrderChannel,
  opts: { id?: string; now?: string } = {},
): OrderHandoff {
  let target = store.driveUrl;
  if (!target) {
    const first = part.lines.map((l) => getProduct(productsById, l.productId)).find((p): p is Product => !!p);
    target = first ? buildProductSearchUrl(store, first) : '';
  }
  return {
    id: opts.id ?? createId('order'),
    storeId: store.id,
    channel,
    url: target ? appendQueryParams(target, UTM_PARAMS) : '',
    lines: part.lines.map((l) => ({ ...l })),
    totalCents: part.subtotalCents + part.feesCents,
    createdAt: opts.now ?? new Date().toISOString(),
    status: 'prepared',
  };
}

/**
 * Version texte de la commande, prête à copier / partager. En-tête selon le
 * service réel : « Ma commande Cabas — Monoprix (Click & collect) », « Ma liste
 * Cabas — Lidl (En magasin) » pour une enseigne sans retrait en ligne.
 */
export function formatOrderAsText(handoff: OrderHandoff, store: Store, productsById: ProductLookup): string {
  const lines: string[] = [];
  const kind = isInStoreOnly(store, handoff.channel) ? 'Ma liste' : 'Ma commande';
  lines.push(`${kind} Cabas — ${store.name} (${storeServiceLabel(store, handoff.channel)})`);
  lines.push('');
  let linesTotal = 0;
  for (const l of handoff.lines) {
    const p = getProduct(productsById, l.productId);
    const name = p ? `${p.name}${p.brand ? ` (${p.brand})` : ''}` : l.label;
    // Prix sans relevé dans l'enseigne : toujours signalé.
    const estimated = l.priceSource === 'estimate' ? ' (prix estimé)' : '';
    lines.push(`• ${l.packs} × ${name} — ${formatPrice(l.totalCents)}${estimated}`);
    linesTotal += l.totalCents;
  }
  const fees = handoff.totalCents - linesTotal;
  lines.push('');
  if (fees > 0) lines.push(`Frais ${handoff.channel === 'delivery' ? 'de livraison' : 'de retrait'} : ${formatPrice(fees)}`);
  lines.push(`Total : ${formatPrice(handoff.totalCents)}`);
  return lines.join('\n');
}

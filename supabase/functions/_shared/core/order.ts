// GENERATED — do not edit.
// Copie générée de src/core par scripts/sync-shared.mjs (npm run sync:shared).
// Toute modification doit être faite dans src/core puis resynchronisée.
/**
 * Transmission de commande (V1) : panier pré-rempli puis redirection vers le
 * drive / la livraison de l'enseigne, et version texte de la commande
 * (copier / partager).
 */
import type { BasketStorePart, OrderChannel, OrderHandoff, Product, Store } from './types.ts';
import { createId } from './ids.ts';
import { formatPrice } from './money.ts';

type ProductLookup = Record<string, Product> | Map<string, Product>;

function getProduct(products: ProductLookup, id: string): Product | undefined {
  return products instanceof Map ? products.get(id) : products[id];
}

/**
 * URL de recherche drive pour un produit (« {query} » remplacé, encodé).
 * `query` : texte de recherche imposé (ex. nom espagnol pour une enseigne
 * espagnole) ; par défaut, nom du produit + marque.
 */
export function buildProductSearchUrl(store: Store, product: Product, query?: string): string {
  const q = (query ?? `${product.name} ${product.brand ?? ''}`).replace(/\s+/g, ' ').trim();
  return store.searchUrlTemplate.split('{query}').join(encodeURIComponent(q));
}

/**
 * Texte de recherche d'un produit sur le site d'une enseigne : le nom
 * générique de l'ingrédient dans la langue du pays (« leche semidesnatada »
 * chez Mercadona), suivi de la marque distributeur s'il s'agit d'une MDD
 * (« Hacendado »). Les marques nationales fictives du catalogue de démo ne
 * sont pas ajoutées : elles fausseraient la recherche.
 */
export function productSearchQuery(
  store: Pick<Store, 'country'>,
  product: Pick<Product, 'name' | 'brand' | 'isStoreBrand' | 'ingredientId'>,
  ingredientName: string | undefined,
  localizedNames: Readonly<Record<string, string>> = {},
): string {
  const base = (store.country === 'ES' ? localizedNames[product.ingredientId] : ingredientName) ?? ingredientName ?? product.name;
  return product.isStoreBrand && product.brand ? `${base} ${product.brand}` : base;
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

const CHANNEL_LABELS: Record<OrderChannel, string> = { drive: 'Drive', delivery: 'Livraison' };

/** Version texte de la commande, prête à copier / partager. */
export function formatOrderAsText(handoff: OrderHandoff, store: Store, productsById: ProductLookup): string {
  const lines: string[] = [];
  lines.push(`Ma commande Cabas — ${store.name} (${CHANNEL_LABELS[handoff.channel]})`);
  lines.push('');
  let linesTotal = 0;
  for (const l of handoff.lines) {
    const p = getProduct(productsById, l.productId);
    const name = p ? `${p.name}${p.brand ? ` (${p.brand})` : ''}` : l.label;
    lines.push(`• ${l.packs} × ${name} — ${formatPrice(l.totalCents)}`);
    linesTotal += l.totalCents;
  }
  const fees = handoff.totalCents - linesTotal;
  lines.push('');
  if (fees > 0) lines.push(`Frais ${handoff.channel === 'delivery' ? 'de livraison' : 'de retrait'} : ${formatPrice(fees)}`);
  lines.push(`Total : ${formatPrice(handoff.totalCents)}`);
  return lines.join('\n');
}

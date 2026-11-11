/// <reference types="jest" />
/**
 * Données réelles (Open Prices / Open Food Facts) : 10 enseignes, provenance
 * des prix (relevé > estimation > démo), MDD vendues dans PLUSIEURS enseignes,
 * produits allergènes jamais proposés, estimations signalées jusqu'à la
 * commande et ignorées par les alertes prix, gabarit de recherche sans {query}.
 */
import { optimizeBasket } from '../basketOptimizer';
import { STORE_CHAIN_GROUPS, STORE_CHAIN_LABELS, storeDisplayName } from '../labels';
import { buildOrderHandoff, buildProductSearchUrl, formatOrderAsText } from '../order';
import { detectPriceDrops, watchesFromHandoffs } from '../priceAlerts';
import {
  allOffersForItem,
  buildCatalogIndex,
  compareItem,
  compareList,
  hasEstimatedPrice,
  isEstimatedPrice,
  isPreferredPrice,
  isSoldByChain,
  offerProvenance,
  PRICE_SOURCE_RANK,
  productContainsAllergen,
  storeBrandChains,
} from '../priceComparison';
import type { OrderHandoff, Price, PriceSource, Product, ShoppingListItem, Store, StoreChain } from '../types';
import { STORE_CHAINS } from '../types';

const NOW = '2026-11-10T10:00:00.000Z';

function store(chain: StoreChain, o: Partial<Store> = {}): Store {
  return {
    id: chain,
    chain,
    name: STORE_CHAIN_LABELS[chain],
    city: 'France',
    pickup: 'drive',
    driveFeeCents: 0,
    deliveryFeeCents: 690,
    minOrderCents: 0,
    searchUrlTemplate: `https://${chain}.example/recherche?q={query}`,
    driveUrl: `https://${chain}.example/`,
    ...o,
  };
}

function prod(id: string, o: Partial<Product> = {}): Product {
  return { id, name: id, brand: 'Marque', isStoreBrand: false, ingredientId: 'riz', packSize: 1000, packUnit: 'g', allergens: [], ...o };
}

function price(productId: string, storeId: string, priceCents: number, o: Partial<Price> = {}): Price {
  return { productId, storeId, priceCents, updatedAt: '2026-11-01', source: 'open_prices', observationCount: 3, observedFrom: '2026-02-01', ...o };
}

function item(o: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return { id: 'i_riz', ingredientId: 'riz', label: 'Riz', quantity: 500, unit: 'g', aisle: 'epicerie_salee', checked: false, source: 'plan', recipeIds: [], ...o };
}

// ─── Enseignes ───────────────────────────────────────────────────────────────

describe('10 enseignes : libellés, familles, nom affiché', () => {
  it('un libellé par enseigne, et des familles qui partitionnent STORE_CHAINS dans l’ordre', () => {
    expect(Object.keys(STORE_CHAIN_LABELS).sort()).toEqual([...STORE_CHAINS].sort());
    expect(STORE_CHAIN_GROUPS.flatMap((g) => g.chains)).toEqual([...STORE_CHAINS]);
    expect(STORE_CHAIN_GROUPS.map((g) => g.label)).toEqual(['Hypers & supers', 'Discount', 'Proximité']);
  });

  it('nomme une enseigne : officiel, comme on le dit, inconnue, absente', () => {
    expect(storeDisplayName(store('leclerc'))).toBe('E.Leclerc');
    expect(storeDisplayName(store('leclerc'), { short: true })).toBe('Leclerc');
    expect(storeDisplayName(store('superu'), { short: true })).toBe('Super U');
    expect(storeDisplayName(store('intermarche'))).toBe('Intermarché');
    // Ancien cache (« Leclerc Drive ») ou enseigne hors référentiel : le nom, sans « Drive ».
    expect(storeDisplayName({ chain: 'biocoop' as StoreChain, name: 'Biocoop Drive' })).toBe('Biocoop');
    expect(storeDisplayName({ chain: 'x' as StoreChain, name: 'E.Truc' }, { short: true })).toBe('Truc');
    expect(storeDisplayName(null)).toBe('l’enseigne');
    expect(storeDisplayName(undefined, { fallback: 'Marché' })).toBe('Marché');
    expect(storeDisplayName({ chain: 'x' as StoreChain, name: '' }, { fallback: 'Autre' })).toBe('Autre');
  });
});

// ─── Provenance : fiabilité avant fraîcheur ──────────────────────────────────

describe('isPreferredPrice : relevé > estimation > démo, puis le plus récent', () => {
  const base = price('p', 'leclerc', 300);

  it('un relevé, même plus ancien, bat une estimation ; une estimation bat la démo', () => {
    const observedOld = { ...base, updatedAt: '2026-01-01' };
    const estimateNew = { ...base, priceCents: 250, updatedAt: '2026-11-11', source: 'estimate' as const, estimateMethod: 'chain_index' as const };
    const demoNewer = { ...base, priceCents: 200, updatedAt: '2026-12-01', source: 'demo' as const };
    expect(isPreferredPrice(observedOld, estimateNew)).toBe(true);
    expect(isPreferredPrice(estimateNew, observedOld)).toBe(false);
    expect(isPreferredPrice(estimateNew, demoNewer)).toBe(true);
    expect(isPreferredPrice(demoNewer, estimateNew)).toBe(false);
  });

  it('à fiabilité égale (relevé, partenaire, collecte), le plus récent gagne', () => {
    const older = { ...base, updatedAt: '2026-10-01' };
    const collect = { ...base, updatedAt: '2026-11-05', source: 'collect' as const };
    const partner = { ...base, updatedAt: '2026-11-06', source: 'partner' as const };
    expect(PRICE_SOURCE_RANK.open_prices).toBe(PRICE_SOURCE_RANK.collect);
    expect(isPreferredPrice(collect, older)).toBe(true);
    expect(isPreferredPrice(partner, collect)).toBe(true);
  });

  it('source inconnue : au plus bas ; ordre total et antisymétrique', () => {
    const unknown = { ...base, source: 'mystere' as unknown as PriceSource, updatedAt: '2030-01-01' };
    const demo = { ...base, source: 'demo' as const };
    expect(isPreferredPrice(demo, unknown)).toBe(true);
    const all: Price[] = (['open_prices', 'estimate', 'demo', 'collect'] as const).flatMap((source) =>
      ['2026-10-01', '2026-11-01'].map((updatedAt) => ({ ...base, source, updatedAt })),
    );
    for (const a of all) for (const b of all) if (a !== b) expect(isPreferredPrice(a, b) && isPreferredPrice(b, a)).toBe(false);
  });

  it('l’index garde le relevé, quel que soit l’ordre des entrées', () => {
    const prices = [price('p', 'leclerc', 300, { updatedAt: '2026-03-01' }), price('p', 'leclerc', 260, { source: 'estimate', updatedAt: '2026-11-11' })];
    for (const list of [prices, [...prices].reverse()]) {
      const idx = buildCatalogIndex([prod('p')], list, [store('leclerc')]);
      expect(idx.pricesByProduct.get('p')?.get('leclerc')?.source).toBe('open_prices');
    }
  });

  it('isEstimatedPrice / hasEstimatedPrice', () => {
    expect(isEstimatedPrice({ source: 'estimate' })).toBe(true);
    expect(isEstimatedPrice({ source: 'open_prices' })).toBe(false);
    expect(isEstimatedPrice(null)).toBe(false);
    expect(hasEstimatedPrice({ priceSource: 'estimate' })).toBe(true);
    expect(hasEstimatedPrice({})).toBe(false);
  });
});

// ─── Offres : provenance, MDD multi-enseignes, allergènes ────────────────────

describe('offres : provenance copiée du prix', () => {
  const stores = [store('leclerc'), store('superu')];
  const products = [prod('p_nat')];
  const prices = [
    price('p_nat', 'leclerc', 199, { updatedAt: '2026-11-05', observationCount: 7 }),
    // Une estimation ne porte JAMAIS de promo (garde-fou si la donnée en contenait une).
    price('p_nat', 'superu', 228, { source: 'estimate', updatedAt: '2026-11-11', observationCount: undefined, estimateMethod: 'chain_index', promoPriceCents: 100 }),
  ];
  const idx = buildCatalogIndex(products, prices, stores);

  it('relevé : source, date et nombre de relevés ; estimation : méthode, prix plein', () => {
    const offers = allOffersForItem(item(), idx, NOW);
    const lec = offers.find((o) => o.storeId === 'leclerc');
    const u = offers.find((o) => o.storeId === 'superu');
    expect(lec).toMatchObject({ priceSource: 'open_prices', priceUpdatedAt: '2026-11-05', observationCount: 7, isPromo: false });
    expect(lec?.estimateMethod).toBeUndefined();
    expect(u).toMatchObject({ priceSource: 'estimate', estimateMethod: 'chain_index', unitPriceCents: 228, isPromo: false });
    expect(u?.observationCount).toBeUndefined();
    expect(offerProvenance(prices[0])).toEqual({ priceSource: 'open_prices', priceUpdatedAt: '2026-11-05', observationCount: 7 });
  });

  it('les lignes du panier gardent la provenance (prix estimé signalé)', () => {
    const cmp = compareList([item()], idx, NOW);
    const plan = optimizeBasket(cmp, stores, 'single_store', { allowedStoreIds: ['superu'], now: NOW });
    expect(plan.parts[0].lines[0].priceSource).toBe('estimate');
    const lec = optimizeBasket(cmp, stores, 'single_store', { allowedStoreIds: ['leclerc'], now: NOW });
    expect(lec.parts[0].lines[0].priceSource).toBe('open_prices');
  });
});

describe('MDD : vendue dans SES enseignes (storeChains)', () => {
  const stores = [store('leclerc'), store('intermarche'), store('netto', { pickup: 'none', deliveryFeeCents: null })];

  it('une MDD des Mousquetaires est proposée chez Intermarché ET Netto, jamais ailleurs', () => {
    const mdd = prod('p_mdd_inter', { isStoreBrand: true, storeChains: ['intermarche', 'netto'] });
    const prices = [price('p_mdd_inter', 'intermarche', 120), price('p_mdd_inter', 'netto', 115), price('p_mdd_inter', 'leclerc', 1)];
    const offers = allOffersForItem(item(), buildCatalogIndex([mdd], prices, stores), NOW);
    expect(offers.map((o) => o.storeId).sort()).toEqual(['intermarche', 'netto']);
    expect(storeBrandChains(mdd)).toEqual(['intermarche', 'netto']);
    expect(isSoldByChain(mdd, 'netto')).toBe(true);
    expect(isSoldByChain(mdd, 'leclerc')).toBe(false);
  });

  it('ancien cache (`storeChain`) toujours filtré ; MDD sans enseigne connue et marque nationale : partout', () => {
    const legacy = { ...prod('p_old', { isStoreBrand: true }), storeChain: 'leclerc' } as Product;
    expect(storeBrandChains(legacy)).toEqual(['leclerc']);
    expect(isSoldByChain(legacy, 'netto')).toBe(false);
    expect(storeBrandChains(prod('p_mdd', { isStoreBrand: true }))).toBeNull();
    expect(isSoldByChain(prod('p_nat'), 'netto')).toBe(true);
  });
});

describe('allergènes déclarés : jamais proposés', () => {
  const stores = [store('leclerc')];
  // Même ingrédient (sûr) ; la marque déclare du lait selon Open Food Facts.
  const products = [
    prod('p_lait', { allergens: ['lait'] }),
    prod('p_sur'),
    prod('p_mdd_lait', { isStoreBrand: true, storeChains: ['leclerc'], allergens: ['lait'] }),
  ];
  const prices = [price('p_lait', 'leclerc', 150), price('p_sur', 'leclerc', 300), price('p_mdd_lait', 'leclerc', 90)];
  const idx = buildCatalogIndex(products, prices, stores);

  it('ni offre, ni meilleur prix, ni alternative MDD, ni choix', () => {
    expect(productContainsAllergen(products[0], ['lait'])).toBe(true);
    expect(productContainsAllergen(products[1], ['lait'])).toBe(false);
    expect(productContainsAllergen(products[0], [])).toBe(false);
    const all = allOffersForItem(item(), idx, NOW);
    expect(all.map((o) => o.productId)).toContain('p_lait');
    const safe = allOffersForItem(item(), idx, NOW, { excludeAllergens: ['lait'] });
    expect(safe.map((o) => o.productId)).toEqual(['p_sur']);
    const c = compareItem(item(), idx, NOW, { excludeAllergens: ['lait', 'gluten'] });
    expect(c.best?.productId).toBe('p_sur');
    expect(c.cheaperAlternative).toBeUndefined();
    const [listed] = compareList([item()], idx, NOW, { excludeAllergens: ['lait'] });
    expect(listed.offers.every((o) => o.productId === 'p_sur')).toBe(true);
    // Sans allergie : la MDD au lait reste l'alternative la moins chère.
    expect(compareItem(item(), idx, NOW).cheaperAlternative?.productId).toBe('p_mdd_lait');
  });
});

// ─── Commande ────────────────────────────────────────────────────────────────

describe('commande : gabarit sans {query}, prix estimé signalé', () => {
  const p = prod('p_riz', { name: 'Riz basmati', brand: 'Taureau Ailé' });

  it('un gabarit sans {query} est ouvert tel quel (Netto, Franprix)', () => {
    const netto = store('netto', { searchUrlTemplate: 'https://www.netto.fr/', driveUrl: '' });
    expect(buildProductSearchUrl(netto, p)).toBe('https://www.netto.fr/');
    expect(buildProductSearchUrl(store('leclerc'), p)).toBe('https://leclerc.example/recherche?q=Riz%20basmati%20Ta' + 'ureau%20Ail%C3%A9');
    const part = { storeId: 'netto', lines: [{ itemId: 'i', label: 'Riz', productId: 'p_riz', packs: 1, totalCents: 199 }], subtotalCents: 199, feesCents: 0 };
    const h = buildOrderHandoff(part, netto, { p_riz: p }, 'drive', { id: 'o', now: NOW });
    expect(h.url).toBe('https://www.netto.fr/?utm_source=cabas&utm_medium=app');
    // Gabarit vide et pas de drive : pas d'URL plutôt qu'une URL cassée.
    const none = buildOrderHandoff(part, store('aldi', { searchUrlTemplate: '', driveUrl: '' }), { p_riz: p }, 'drive', { id: 'o2', now: NOW });
    expect(none.url).toBe('');
  });

  it('le texte copié signale « (prix estimé) »', () => {
    const handoff: OrderHandoff = {
      id: 'o',
      storeId: 'superu',
      channel: 'drive',
      url: '',
      lines: [
        { itemId: 'a', label: 'Riz', productId: 'p_riz', packs: 1, totalCents: 228, priceSource: 'estimate' },
        { itemId: 'b', label: 'Riz', productId: 'p_riz', packs: 2, totalCents: 398, priceSource: 'open_prices' },
      ],
      totalCents: 626,
      createdAt: NOW,
      status: 'prepared',
    };
    const text = formatOrderAsText(handoff, store('superu'), { p_riz: p });
    const [first, second] = text.split('\n').filter((l) => l.startsWith('•'));
    expect(first).toMatch(/\(prix estimé\)$/);
    expect(second).not.toMatch(/estimé/);
  });
});

// ─── Alertes prix ────────────────────────────────────────────────────────────

describe('alertes prix : jamais sur une estimation', () => {
  it('ignore les prix estimés, même plus bas', () => {
    const watch = [{ productId: 'p', storeId: 'superu', referenceCents: 300 }];
    expect(detectPriceDrops(watch, [price('p', 'superu', 200, { source: 'estimate' })], { now: NOW })).toEqual([]);
    expect(detectPriceDrops(watch, [price('p', 'superu', 200)], { now: NOW })).toHaveLength(1);
    // Un relevé plus ancien et une estimation plus basse : seule la mesure compte.
    const drops = detectPriceDrops(
      watch,
      [price('p', 'superu', 290, { updatedAt: '2026-01-01' }), price('p', 'superu', 150, { source: 'estimate', updatedAt: '2026-11-11' })],
      { now: NOW },
    );
    expect(drops).toEqual([]);
  });

  it('une ligne payée au prix estimé n’est pas une référence', () => {
    const order = (id: string, createdAt: string, totalCents: number, priceSource?: 'estimate' | 'open_prices'): OrderHandoff => ({
      id,
      storeId: 'superu',
      channel: 'drive',
      url: '',
      lines: [{ itemId: 'i', label: 'Riz', productId: 'p', packs: 1, totalCents, ...(priceSource ? { priceSource } : {}) }],
      totalCents,
      createdAt,
      status: 'confirmed',
    });
    // Dernière commande au prix estimé : la référence reste le dernier prix RELEVÉ payé.
    const watches = watchesFromHandoffs([order('a', '2026-10-01', 300, 'open_prices'), order('b', '2026-11-01', 250, 'estimate')]);
    expect(watches).toEqual([{ productId: 'p', storeId: 'superu', referenceCents: 300 }]);
    expect(watchesFromHandoffs([order('a', '2026-10-01', 300, 'estimate'), order('b', '2026-11-01', 250, 'estimate')])).toEqual([]);
  });
});

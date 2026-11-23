/**
 * France / Espagne : périmètre de comparaison, minimum de commande en ligne,
 * noms d'enseigne, saisie décimale à la française.
 */
import {
  comparableStoreIds,
  parseDecimalFr,
  restrictComparisons,
  storeDisplayName,
  storeMinOrder,
  type ItemComparison,
  type Store,
} from '../index';

function st(id: string, chain: Store['chain'], country: Store['country'], o: Partial<Store> = {}): Store {
  return {
    id,
    chain,
    country,
    name: id,
    city: country === 'ES' ? 'Barcelone' : 'Lyon',
    hasDrive: true,
    driveFeeCents: 0,
    deliveryFeeCents: 500,
    minOrderCents: 3000,
    searchUrlTemplate: 'https://x/?q={query}',
    driveUrl: 'https://x',
    ...o,
  };
}

const STORES = [st('leclerc', 'leclerc', 'FR'), st('lidl', 'lidl', 'FR'), st('mercadona', 'mercadona', 'ES'), st('lidl_es', 'lidl', 'ES')];

describe('comparableStoreIds', () => {
  it('ne compare que les magasins du pays de l’utilisateur', () => {
    expect(comparableStoreIds(STORES, ['leclerc'])).toEqual(['leclerc', 'lidl']);
    expect(comparableStoreIds(STORES, ['mercadona'])).toEqual(['mercadona', 'lidl_es']);
  });
  it('compare les deux pays pour un frontalier', () => {
    expect(comparableStoreIds(STORES, ['lidl', 'mercadona'])).toHaveLength(4);
  });
  it('sans magasin connu : tous les magasins', () => {
    expect(comparableStoreIds(STORES, [])).toHaveLength(4);
    expect(comparableStoreIds(STORES, ['inconnu'])).toHaveLength(4);
  });
});

describe('restrictComparisons', () => {
  const offer = (storeId: string, totalCents: number) => ({
    storeId,
    productId: `p_${storeId}`,
    packs: 1,
    unitPriceCents: totalCents,
    totalCents,
    pricePerBaseUnitCents: totalCents,
    referenceUnit: 'kg' as const,
    isStoreBrand: false,
    isPromo: false,
  });
  const cmp: ItemComparison = {
    itemId: 'i',
    label: 'Riz',
    offers: [offer('mercadona', 100), offer('leclerc', 150), offer('lidl', 160)],
    best: offer('mercadona', 100),
    cheaperAlternative: { ...offer('mercadona', 80), isStoreBrand: true, savingsCents: 20 },
  };
  it('retire les offres hors périmètre et recalcule la meilleure', () => {
    const [r] = restrictComparisons([cmp], ['leclerc', 'lidl']);
    expect(r.offers.map((o) => o.storeId)).toEqual(['leclerc', 'lidl']);
    expect(r.best?.storeId).toBe('leclerc');
    expect(r.cheaperAlternative).toBeUndefined();
  });
  it('un périmètre vide ne restreint rien', () => {
    expect(restrictComparisons([cmp], [])[0]).toEqual(cmp);
  });
  it('article introuvable : pas de meilleure offre', () => {
    expect(restrictComparisons([cmp], ['consum'])[0].best).toBeUndefined();
  });
});

describe('storeMinOrder', () => {
  it('ne s’applique pas aux courses en magasin (sans drive)', () => {
    const m = st('mercadona', 'mercadona', 'ES', { hasDrive: false, minOrderCents: 6000 });
    expect(storeMinOrder(m, 'drive')).toBe(0);
    expect(storeMinOrder(m, 'delivery')).toBe(6000);
  });
  it('s’applique au drive quand il existe', () => {
    expect(storeMinOrder(st('carrefour_es', 'carrefour', 'ES'), 'drive')).toBe(3000);
  });
});

describe('storeDisplayName', () => {
  it('précise le pays pour les enseignes présentes des deux côtés', () => {
    expect(storeDisplayName(st('carrefour_es', 'carrefour', 'ES'))).toBe('Carrefour Espagne');
    expect(storeDisplayName(st('lidl', 'lidl', 'FR'))).toBe('Lidl');
    expect(storeDisplayName(st('mercadona', 'mercadona', 'ES'))).toBe('Mercadona');
    expect(storeDisplayName(st('superu', 'superu', 'FR'))).toBe('Super U');
  });
});

describe('parseDecimalFr', () => {
  it.each([
    ['1,5', 1.5],
    ['2', 2],
    [' 0.75 ', 0.75],
    ['1 000', 1000],
  ])('« %s » → %d', (input, expected) => {
    expect(parseDecimalFr(input)).toBe(expected);
  });
  it.each(['', 'abc', '1,2,3', '-2', '1e3'])('« %s » → null', (input) => {
    expect(parseDecimalFr(input)).toBeNull();
  });
});

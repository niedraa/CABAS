/// <reference types="jest" />
import {
  aggregateKey,
  aggregateObservations,
  categoryKey,
  computeChainIndex,
  detectChain,
  eanKey,
  foldName,
  gtinCheckDigit,
  isFranceMetro,
  isValidGtin,
  mapOffAllergens,
  median,
  normalizeGtin,
  normalizeObservation,
  OPEN_DATA_CHAINS,
  OPEN_PRICES_DUMP_URLS,
  parseOffQuantity,
  PRESS_CHAIN_INDEX,
  type PriceObservation,
  type RawPriceItem,
} from '../openPrices';
import { ALLERGENS, STORE_CHAINS, type StoreChain } from '../types';

const WINDOW = { from: '2025-11-11', to: '2026-11-11' };

/** Relevé valide de référence (copie d'une ligne réelle, lieu joint). */
function raw(overrides: Partial<RawPriceItem> = {}, location: Partial<NonNullable<RawPriceItem['location']>> = {}): RawPriceItem {
  return {
    type: 'PRODUCT',
    product_code: '3017620422003',
    category_tag: null,
    labels_tags: null,
    origins_tags: null,
    price: '3.990',
    price_is_discounted: false,
    price_without_discount: null,
    price_per: null,
    currency: 'EUR',
    date: '2026-10-28',
    receipt_quantity: '1.000',
    duplicate_of: null,
    ...overrides,
    location: {
      osm_brand: 'E.Leclerc',
      osm_name: 'E.Leclerc',
      osm_address_country_code: 'FR',
      osm_address_country: 'France',
      osm_address_postcode: '35000',
      osm_tag_value: 'supermarket',
      ...location,
    },
  };
}

function obs(overrides: Partial<PriceObservation> = {}): PriceObservation {
  return {
    key: 'ean:3017620422003',
    chain: 'leclerc',
    proximity: false,
    regularEur: 2,
    pricePer: null,
    date: '2026-10-01',
    organic: false,
    ...overrides,
  };
}

// ─── Constantes ──────────────────────────────────────────────────────────────

describe('constantes', () => {
  it('couvre les 10 enseignes dans l’ordre de STORE_CHAINS', () => {
    expect(OPEN_DATA_CHAINS).toEqual([...STORE_CHAINS]);
    expect(Object.keys(PRESS_CHAIN_INDEX).sort()).toEqual([...STORE_CHAINS].sort());
    expect(PRESS_CHAIN_INDEX).toMatchObject({ leclerc: 1, lidl: 0.98, aldi: 1.02, netto: 1 });
  });

  it('pointe vers les exports officiels d’Open Prices', () => {
    expect(OPEN_PRICES_DUMP_URLS).toEqual({
      prices: 'https://prices.openfoodfacts.org/data/prices.jsonl.gz',
      locations: 'https://prices.openfoodfacts.org/data/locations.jsonl.gz',
    });
  });
});

// ─── Texte ───────────────────────────────────────────────────────────────────

describe('foldName', () => {
  it('replie casse, accents, apostrophes typographiques et séparateurs', () => {
    expect(foldName('Intermarché  Super')).toBe('intermarche super');
    expect(foldName('Monop’')).toBe("monop'");
    expect(foldName(' Système-U ')).toBe('systeme u');
    expect(foldName(null)).toBe('');
    expect(foldName('Œufs')).toBe('oeufs');
  });
});

// ─── Enseignes ───────────────────────────────────────────────────────────────

describe('detectChain', () => {
  const cases: [string | null, string | null, StoreChain | null, boolean][] = [
    // [osm_brand, osm_name, enseigne, proximité] — valeurs réelles d'Open Prices
    ['Centre Commercial E.Leclerc', 'E.Leclerc', 'leclerc', false],
    ['E. Leclerc', null, 'leclerc', false],
    ['E.Leclerc Drive', 'E.Leclerc Drive', 'leclerc', false],
    ['E.Leclerc Express', null, 'leclerc', true],
    ['Carrefour Market', 'Carrefour Market', 'carrefour', false],
    ['Carrefour City', 'Carrefour City', 'carrefour', true],
    ['Carrefour Express', null, 'carrefour', true],
    ['Carrefour Contact', null, 'carrefour', true],
    ['Carrefour', 'Carrefour City Bastille', 'carrefour', true],
    ['Auchan Supermarché', null, 'auchan', false],
    ['Intermarché Hyper', null, 'intermarche', false],
    ['Intermarché Express', 'Intermarché Express', 'intermarche', true],
    ['Intermarché Contact', null, 'intermarche', true],
    ['Super U', 'Super U', 'superu', false],
    ['Hyper U', null, 'superu', false],
    ['U Express', 'U Express', 'superu', true],
    ['Utile', 'Utile', 'superu', true],
    ['Système U', null, 'superu', false],
    ['Lidl', 'Lidl', 'lidl', false],
    ['ALDI', 'ALDI', 'aldi', false],
    ['Netto', null, 'netto', false],
    ['Monoprix', 'Monoprix', 'monoprix', false],
    ["Monop'", "Monop'", 'monoprix', true],
    ['Monop’', null, 'monoprix', true],
    ['Franprix', 'Franprix', 'franprix', false],
    // Enseigne absente de osm_brand : le nom prend le relais.
    [null, 'Lidl', 'lidl', false],
    ['  ', 'Carrefour City', 'carrefour', true],
    // Hors enseignes couvertes.
    ['Mondial Relay', 'Mondial Relay', null, false],
    ['La Poste', null, null, false],
    ['Biocoop', 'Biocoop Carrefour de l’Europe', null, false],
    ['Casino', null, null, false],
    [null, 'Station U', null, false],
    [null, 'Boulangerie du U', null, false],
    [null, null, null, false],
  ];

  it.each(cases)('%s / %s → %s', (brand, name, chain, proximity) => {
    const result = detectChain({ osm_brand: brand, osm_name: name });
    if (chain === null) expect(result).toBeNull();
    else expect(result).toEqual({ chain, proximity });
  });

  it('ne confond pas « Monoprix » avec le format de proximité « Monop’ »', () => {
    expect(detectChain({ osm_brand: 'Monoprix' })?.proximity).toBe(false);
    expect(detectChain({ osm_brand: 'Daily Monop’' })).toEqual({ chain: 'monoprix', proximity: true });
  });
});

describe('isFranceMetro', () => {
  it('accepte la métropole et la Corse', () => {
    expect(isFranceMetro({ osm_address_country_code: 'FR', osm_address_postcode: '75011' })).toBe(true);
    expect(isFranceMetro({ osm_address_country_code: 'fr', osm_address_postcode: '20000' })).toBe(true);
    expect(isFranceMetro({ osm_address_country: 'France', osm_address_postcode: '69001' })).toBe(true);
    expect(isFranceMetro({ osm_address_country_code: null, osm_address_country: 'France', osm_address_postcode: null })).toBe(true);
  });

  it('refuse l’outre-mer (97, 98) et l’étranger', () => {
    expect(isFranceMetro({ osm_address_country_code: 'FR', osm_address_postcode: '97400' })).toBe(false);
    expect(isFranceMetro({ osm_address_country: 'France', osm_address_postcode: '97200' })).toBe(false);
    expect(isFranceMetro({ osm_address_country_code: 'FR', osm_address_postcode: '98000' })).toBe(false);
    expect(isFranceMetro({ osm_address_country_code: 'DE', osm_address_country: 'Deutschland', osm_address_postcode: '10115' })).toBe(false);
    expect(isFranceMetro({ osm_address_country_code: 'BE', osm_address_country: 'France' })).toBe(false);
    expect(isFranceMetro({})).toBe(false);
    expect(isFranceMetro({ osm_address_country: 'france' })).toBe(false);
  });
});

// ─── GTIN ────────────────────────────────────────────────────────────────────

describe('GTIN', () => {
  it('calcule la clé GS1', () => {
    expect(gtinCheckDigit('301762042200')).toBe(3);
    expect(gtinCheckDigit('400638133393')).toBe(1);
    expect(gtinCheckDigit('9638507')).toBe(4); // GTIN-8 96385074
  });

  it('accepte les GTIN-13 et GTIN-8 valides', () => {
    expect(isValidGtin('3017620422003')).toBe(true);
    expect(isValidGtin('3560070829651')).toBe(true);
    expect(isValidGtin('96385074')).toBe(true);
    expect(isValidGtin('40052755')).toBe(true);
  });

  it('refuse clé fausse, longueurs exotiques, zéros et poids variable', () => {
    expect(isValidGtin('3017620422004')).toBe(false);
    expect(isValidGtin('96385075')).toBe(false);
    expect(isValidGtin('301762042200')).toBe(false); // 12 chiffres (non normalisé)
    expect(isValidGtin('03017620422003')).toBe(false); // 14 chiffres
    expect(isValidGtin('0000000000000')).toBe(false);
    expect(isValidGtin('00000000')).toBe(false);
    expect(isValidGtin('X000ABC123')).toBe(false);
    expect(isValidGtin('')).toBe(false);
    // Étiquette de pesée magasin (préfixe 2) : clé valide mais code local.
    const body = '212345012345';
    expect(isValidGtin(`${body}${gtinCheckDigit(body)}`)).toBe(false);
  });

  it('normalise UPC-A et GTIN-14 en 13 chiffres', () => {
    expect(normalizeGtin(' 3017620422003 ')).toBe('3017620422003');
    expect(normalizeGtin('036000291452')).toBe('0036000291452');
    expect(normalizeGtin('03017620422003')).toBe('3017620422003');
    expect(normalizeGtin('3017620422004')).toBeNull();
    expect(normalizeGtin(null)).toBeNull();
    expect(normalizeGtin(undefined)).toBeNull();
  });
});

// ─── Normalisation des relevés ───────────────────────────────────────────────

describe('normalizeObservation', () => {
  it('normalise un relevé produit valide', () => {
    expect(normalizeObservation(raw(), WINDOW)).toEqual({
      key: 'ean:3017620422003',
      chain: 'leclerc',
      proximity: false,
      regularEur: 3.99,
      pricePer: null,
      date: '2026-10-28',
      organic: false,
    });
  });

  it('accepte un prix numérique, une quantité numérique ou absente', () => {
    expect(normalizeObservation(raw({ price: 3.99, receipt_quantity: 1 }), WINDOW)?.regularEur).toBe(3.99);
    expect(normalizeObservation(raw({ receipt_quantity: null }), WINDOW)).not.toBeNull();
    expect(normalizeObservation(raw({ receipt_quantity: undefined }), WINDOW)).not.toBeNull();
  });

  it('écarte les magasins hors France métropolitaine', () => {
    expect(normalizeObservation(raw({}, { osm_address_postcode: '97490' }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({}, { osm_address_postcode: '98800' }), WINDOW)).toBeNull();
    expect(
      normalizeObservation(raw({}, { osm_brand: 'Lidl', osm_address_country_code: 'DE', osm_address_country: 'Deutschland' }), WINDOW),
    ).toBeNull();
    expect(normalizeObservation({ ...raw(), location: null }, WINDOW)).toBeNull();
  });

  it('écarte les stations-service et les lieux hors enseignes', () => {
    expect(normalizeObservation(raw({}, { osm_brand: 'Super U', osm_name: 'Station U', osm_tag_value: 'fuel' }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({}, { osm_brand: null, osm_name: 'Station U', osm_tag_value: 'fuel' }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({}, { osm_brand: 'Mondial Relay', osm_name: 'Mondial Relay' }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({}, { osm_brand: 'La Poste', osm_name: 'La Poste' }), WINDOW)).toBeNull();
    // La même enseigne en magasin est bien retenue.
    expect(normalizeObservation(raw({}, { osm_brand: 'Super U', osm_name: 'Super U' }), WINDOW)?.chain).toBe('superu');
  });

  it('écarte les autres devises, les doublons et les dates hors fenêtre', () => {
    expect(normalizeObservation(raw({ currency: 'CHF' }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({ currency: null }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({ duplicate_of: 42 }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({ date: null }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({ date: '2025-11-10' }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({ date: '2026-11-12' }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({ date: 'hier' }), WINDOW)).toBeNull();
    // Bornes incluses.
    expect(normalizeObservation(raw({ date: '2025-11-11' }), WINDOW)?.date).toBe('2025-11-11');
    expect(normalizeObservation(raw({ date: '2026-11-11' }), WINDOW)?.date).toBe('2026-11-11');
  });

  it('écarte les quantités de ticket supérieures à 1 (prix unitaire ou total ambigu)', () => {
    expect(normalizeObservation(raw({ receipt_quantity: '2.000' }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({ receipt_quantity: 3 }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({ receipt_quantity: '0' }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({ receipt_quantity: 'abc' }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({ receipt_quantity: '0.500' }), WINDOW)).not.toBeNull();
  });

  it('écarte les codes invalides et les codes poids variable', () => {
    expect(normalizeObservation(raw({ product_code: '3017620422004' }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({ product_code: '2123450123457' }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({ product_code: '2000000001234' }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({ product_code: '12345' }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({ product_code: null }), WINDOW)).toBeNull();
    // Un UPC-A à 12 chiffres est ramené à 13.
    expect(normalizeObservation(raw({ product_code: '036000291452' }), WINDOW)?.key).toBe('ean:0036000291452');
  });

  it('écarte les prix nuls, illisibles ou aberrants', () => {
    expect(normalizeObservation(raw({ price: '0' }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({ price: '0.004' }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({ price: null }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({ price: 'NaN' }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({ price: '-1' }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({ price: 25_000 }), WINDOW)).toBeNull();
  });

  it('garde le prix normal d’un relevé promo, et écarte une promo sans prix barré', () => {
    const promo = normalizeObservation(raw({ price: '2.500', price_is_discounted: true, price_without_discount: '3.490' }), WINDOW);
    expect(promo).toMatchObject({ regularEur: 3.49, promoEur: 2.5 });
    expect(normalizeObservation(raw({ price_is_discounted: true, price_without_discount: null }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({ price: '3', price_is_discounted: true, price_without_discount: '2.5' }), WINDOW)).toBeNull();
    // Prix barré renseigné sans drapeau promo : ignoré.
    expect(normalizeObservation(raw({ price_without_discount: '9.99' }), WINDOW)?.regularEur).toBe(3.99);
  });

  it('marque les formats de proximité', () => {
    const city = normalizeObservation(raw({}, { osm_brand: 'Carrefour City', osm_name: 'Carrefour City' }), WINDOW);
    expect(city).toMatchObject({ chain: 'carrefour', proximity: true });
  });

  it('refuse un code-barres relevé « au kilo »', () => {
    expect(normalizeObservation(raw({ price_per: 'KILOGRAM' }), WINDOW)).toBeNull();
    expect(normalizeObservation(raw({ price_per: 'UNIT' }), WINDOW)?.pricePer).toBeNull();
  });

  it('normalise le vrac au kilo et à la pièce, bio compris', () => {
    const kg = normalizeObservation(
      raw({ type: 'CATEGORY', product_code: null, category_tag: 'en:Tomatoes', price: '3.490', price_per: 'KILOGRAM' }),
      WINDOW,
    );
    expect(kg).toMatchObject({ key: 'cat:en:tomatoes:KILOGRAM', pricePer: 'KILOGRAM', organic: false, regularEur: 3.49 });
    const unit = normalizeObservation(
      raw({ type: 'CATEGORY', product_code: null, category_tag: 'en:cucumbers', price: '0.89', price_per: 'UNIT', labels_tags: ['en:organic'] }),
      WINDOW,
    );
    expect(unit).toMatchObject({ key: 'cat:en:cucumbers:UNIT', pricePer: 'UNIT', organic: true });
    expect(
      normalizeObservation(raw({ type: 'CATEGORY', product_code: null, category_tag: 'en:milk', price_per: 'LITER' }), WINDOW),
    ).toBeNull();
    expect(normalizeObservation(raw({ type: 'CATEGORY', product_code: null, category_tag: '', price_per: 'KILOGRAM' }), WINDOW)).toBeNull();
    expect(
      normalizeObservation(raw({ type: 'CATEGORY', product_code: null, category_tag: 'en:apples', price_per: null }), WINDOW),
    ).toBeNull();
  });

  it('déduit le type quand il manque', () => {
    expect(normalizeObservation(raw({ type: null }), WINDOW)?.key).toBe('ean:3017620422003');
    expect(
      normalizeObservation(raw({ type: null, product_code: null, category_tag: 'en:garlic', price_per: 'KILOGRAM' }), WINDOW)?.key,
    ).toBe('cat:en:garlic:KILOGRAM');
    expect(normalizeObservation(raw({ type: null, product_code: null }), WINDOW)).toBeNull();
  });

  it('ne recopie jamais de champ hors contrat (owner, lieu…)', () => {
    const withOwner = { ...raw(), owner: 'pseudo', location_osm_id: 1 } as RawPriceItem;
    const result = normalizeObservation(withOwner, WINDOW)!;
    expect(Object.keys(result).sort()).toEqual(['chain', 'date', 'key', 'organic', 'pricePer', 'proximity', 'regularEur']);
    expect(JSON.stringify(result)).not.toContain('pseudo');
  });
});

describe('clés', () => {
  it('construit les clés de relevés et d’agrégats', () => {
    expect(eanKey('3017620422003')).toBe('ean:3017620422003');
    expect(categoryKey('en:tomatoes', 'KILOGRAM')).toBe('cat:en:tomatoes:KILOGRAM');
    expect(aggregateKey(obs())).toBe('ean:3017620422003');
    expect(aggregateKey(obs({ organic: true }))).toBe('ean:3017620422003');
    expect(aggregateKey(obs({ key: 'cat:en:tomatoes:KILOGRAM', pricePer: 'KILOGRAM', organic: true }))).toBe(
      'cat:en:tomatoes:KILOGRAM:organic',
    );
    expect(aggregateKey(obs({ key: 'cat:en:tomatoes:KILOGRAM', pricePer: 'KILOGRAM' }))).toBe('cat:en:tomatoes:KILOGRAM');
  });
});

// ─── Agrégation ──────────────────────────────────────────────────────────────

describe('median', () => {
  it('gère les tailles paires, impaires et vides', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([7])).toBe(7);
    expect(Number.isNaN(median([]))).toBe(true);
  });
});

describe('aggregateObservations', () => {
  it('renvoie null sans relevé', () => {
    expect(aggregateObservations([])).toBeNull();
  });

  it('prend la médiane du prix normal, en centimes entiers, avec les dates extrêmes', () => {
    const result = aggregateObservations([
      obs({ regularEur: 2.19, date: '2026-03-01' }),
      obs({ regularEur: 1.99, date: '2026-10-15', promoEur: 1.5 }),
      obs({ regularEur: 2.49, date: '2025-12-24' }),
    ]);
    expect(result).toEqual({ medianCents: 219, count: 3, from: '2025-12-24', to: '2026-10-15' });
  });

  it('arrondit la médiane paire au centime', () => {
    expect(aggregateObservations([obs({ regularEur: 1.25 }), obs({ regularEur: 1.26 })])?.medianCents).toBe(126);
    expect(aggregateObservations([obs({ regularEur: 1.2 }), obs({ regularEur: 1.25 })])?.medianCents).toBe(123);
    expect(aggregateObservations([obs({ regularEur: 0.01 })])?.medianCents).toBe(1);
  });

  it('préfère les relevés hors proximité quand il y en a', () => {
    const mixed = aggregateObservations([
      obs({ regularEur: 2, date: '2026-01-01' }),
      obs({ regularEur: 3, proximity: true, date: '2026-09-01' }),
      obs({ regularEur: 3.2, proximity: true, date: '2026-09-02' }),
    ]);
    expect(mixed).toEqual({ medianCents: 200, count: 1, from: '2026-01-01', to: '2026-01-01' });
    const proximityOnly = aggregateObservations([obs({ regularEur: 3, proximity: true }), obs({ regularEur: 3.2, proximity: true })]);
    expect(proximityOnly).toMatchObject({ medianCents: 310, count: 2 });
  });

  it('est indépendante de l’ordre des relevés', () => {
    const list = [1.1, 2.3, 0.99, 5.5, 2.31].map((regularEur, k) => obs({ regularEur, date: `2026-0${k + 1}-10` }));
    expect(aggregateObservations([...list].reverse())).toEqual(aggregateObservations(list));
  });
});

// ─── Indice d'enseigne ───────────────────────────────────────────────────────

describe('computeChainIndex', () => {
  /** `n` produits où l'enseigne coûte `ratio` × Leclerc. */
  function basket(n: number, ratios: Partial<Record<StoreChain, number>>): Partial<Record<StoreChain, number>>[] {
    return Array.from({ length: n }, (_, k) => {
      const ref = 1 + (k % 7) * 0.5;
      const row: Partial<Record<StoreChain, number>> = { leclerc: ref };
      for (const [chain, r] of Object.entries(ratios)) row[chain as StoreChain] = ref * (r as number);
      return row;
    });
  }

  it('mesure la moyenne géométrique des ratios sur les produits communs', () => {
    const index = computeChainIndex(basket(250, { carrefour: 1.1, monoprix: 1.27 }));
    expect(index.leclerc).toEqual({ value: 1, basis: 'measured', commonProducts: 250 });
    expect(index.carrefour).toEqual({ value: 1.1, basis: 'measured', commonProducts: 250 });
    expect(index.monoprix).toEqual({ value: 1.27, basis: 'measured', commonProducts: 250 });
  });

  it('retombe sur l’a priori presse sous 200 produits communs', () => {
    const rows = [...basket(250, { carrefour: 1.1 }), ...basket(30, { lidl: 0.9 })];
    const index = computeChainIndex(rows);
    expect(index.lidl).toEqual({ value: 0.98, basis: 'press', commonProducts: 30 });
    expect(index.aldi).toEqual({ value: 1.02, basis: 'press', commonProducts: 0 });
    expect(index.netto).toEqual({ value: 1, basis: 'press', commonProducts: 0 });
    for (const chain of STORE_CHAINS) expect(index[chain]).toBeDefined();
  });

  it('borne l’indice mesuré à [0,85 ; 1,6] et ignore les produits sans Leclerc', () => {
    const rows = [...basket(200, { franprix: 2.5, aldi: 0.5 }), { carrefour: 9 }, { leclerc: 0, carrefour: 1 }];
    const index = computeChainIndex(rows);
    expect(index.franprix.value).toBe(1.6);
    expect(index.aldi.value).toBe(0.85);
    expect(index.leclerc.commonProducts).toBe(200);
    expect(index.carrefour.basis).toBe('press');
  });

  it('accepte un seuil et des valeurs de repli personnalisés', () => {
    const index = computeChainIndex(basket(5, { auchan: 1.2 }), { minCommon: 5 });
    expect(index.auchan).toEqual({ value: 1.2, basis: 'measured', commonProducts: 5 });
  });
});

// ─── Allergènes Open Food Facts ──────────────────────────────────────────────

describe('mapOffAllergens', () => {
  it('reconnaît les 14 tags canoniques d’Open Food Facts', () => {
    const tags = [
      'en:gluten',
      'en:crustaceans',
      'en:eggs',
      'en:fish',
      'en:peanuts',
      'en:soybeans',
      'en:milk',
      'en:nuts',
      'en:celery',
      'en:mustard',
      'en:sesame-seeds',
      'en:sulphur-dioxide-and-sulphites',
      'en:lupin',
      'en:molluscs',
    ];
    expect(mapOffAllergens(tags)).toEqual({ allergens: [...ALLERGENS], unknown: [] });
  });

  it('dédoublonne, trie dans l’ordre réglementaire et accepte les tags français', () => {
    expect(mapOffAllergens(['en:milk', 'fr:lait', 'en:gluten', 'fr:Moutarde', 'en:milk'])).toEqual({
      allergens: ['gluten', 'lait', 'moutarde'],
      unknown: [],
    });
    expect(mapOffAllergens(['en:none'])).toEqual({ allergens: [], unknown: [] });
    expect(mapOffAllergens([])).toEqual({ allergens: [], unknown: [] });
  });

  it('signale les tags inconnus sans jamais les ignorer, et ajoute l’allergène reconnu par prudence', () => {
    const result = mapOffAllergens([
      'en:gluten',
      'fr:Avoine ou hybrides et produits à base de ces céréales',
      'en:Metabisulphite',
      'fr:Disulfite de potassium',
      'en:Sojabohnen',
      'en:pork',
    ]);
    expect(result.allergens).toEqual(['gluten', 'soja', 'sulfites']);
    expect(result.unknown).toEqual([
      'en:Metabisulphite',
      'en:Sojabohnen',
      'en:pork',
      'fr:Avoine ou hybrides et produits à base de ces céréales',
      'fr:Disulfite de potassium',
    ]);
  });

  it('reconnaît les tags en texte libre bruités (œufs, lait, fruits à coque)', () => {
    expect(mapOffAllergens(['en:Oeufs frais', 'fr:Lait1', 'fr:Noix de cajou et produits']).allergens).toEqual([
      'oeufs',
      'lait',
      'fruits_a_coque',
    ]);
  });
});

// ─── Contenance Open Food Facts ──────────────────────────────────────────────

describe('parseOffQuantity', () => {
  it('privilégie la quantité calculée par Open Food Facts', () => {
    expect(parseOffQuantity({ quantity: '3 sachets de70 g', product_quantity: 210, product_quantity_unit: 'g' })).toEqual({
      size: 210,
      unit: 'g',
    });
    expect(parseOffQuantity({ product_quantity: '1000', product_quantity_unit: 'ml' })).toEqual({ size: 1000, unit: 'ml' });
    expect(parseOffQuantity({ product_quantity: 0.5, product_quantity_unit: 'kg' })).toEqual({ size: 500, unit: 'g' });
  });

  it('lit le texte libre (masses, volumes, lots)', () => {
    const cases: [string, number, string][] = [
      ['500 g', 500, 'g'],
      ['500g', 500, 'g'],
      ['0.5 kg', 500, 'g'],
      ['0,825 kg', 825, 'g'],
      ['1 kg', 1000, 'g'],
      ['200 gram', 200, 'g'],
      ['200 g ℮', 200, 'g'],
      ['100 g e', 100, 'g'],
      ['1,5 L', 1500, 'ml'],
      ['75 cl', 750, 'ml'],
      ['25cl', 250, 'ml'],
      ['1 litre', 1000, 'ml'],
      ['3 x 70 g', 210, 'g'],
      ['4x50g', 200, 'g'],
      ['2×110g', 220, 'g'],
      ['3 sachets de70 g', 210, 'g'],
      ['6 x 1 L', 6000, 'ml'],
      ['210 g (3 x 70 g)', 210, 'g'],
      ['650g (14slices)', 650, 'g'],
      ['18 Slices, 800g', 800, 'g'],
      ['4 tranches (130 g)', 130, 'g'],
      ['200 g (6 à 10 tranches)', 200, 'g'],
    ];
    for (const [quantity, size, unit] of cases) expect(parseOffQuantity({ quantity })).toEqual({ size, unit });
    expect(parseOffQuantity({ quantity: '20.5 oz' })?.size).toBeCloseTo(581.165, 2);
  });

  it('lit les quantités à la pièce', () => {
    expect(parseOffQuantity({ quantity: '6 œufs' })).toEqual({ size: 6, unit: 'piece' });
    expect(parseOffQuantity({ quantity: '12 oeufs frais' })).toEqual({ size: 12, unit: 'piece' });
    expect(parseOffQuantity({ quantity: 'x6' })).toEqual({ size: 6, unit: 'piece' });
    expect(parseOffQuantity({ quantity: '8 tranches' })).toEqual({ size: 8, unit: 'piece' });
    expect(parseOffQuantity({ quantity: '4 pièces' })).toEqual({ size: 4, unit: 'piece' });
  });

  it('renvoie null pour une contenance absente, illisible ou invraisemblable', () => {
    expect(parseOffQuantity({})).toBeNull();
    expect(parseOffQuantity({ quantity: '' })).toBeNull();
    expect(parseOffQuantity({ quantity: '200' })).toBeNull();
    expect(parseOffQuantity({ quantity: 'format familial' })).toBeNull();
    expect(parseOffQuantity({ quantity: '250 kg' })).toBeNull();
    expect(parseOffQuantity({ product_quantity: 250000, product_quantity_unit: 'g', quantity: '250 kg' })).toBeNull();
    expect(parseOffQuantity({ product_quantity: 120, product_quantity_unit: null, quantity: '120' })).toBeNull();
    // Champ calculé invraisemblable, texte correct : le texte l'emporte.
    expect(parseOffQuantity({ product_quantity: 250000, product_quantity_unit: 'g', quantity: '250 g' })).toEqual({
      size: 250,
      unit: 'g',
    });
  });
});

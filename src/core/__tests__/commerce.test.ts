/// <reference types="jest" />
import { PRODUCTS, STORES } from './fixtures';
import { appendQueryParams, buildOrderHandoff, buildProductSearchUrl, formatOrderAsText } from '../order';
import { FEATURE_COPY, PREMIUM_FEATURES, canUse, maxMealsPerWeek, pricingLabels, yearlySavingsPercent, type Feature } from '../entitlements';
import { budgetStatus, createManualSpending, spendingByMonth, spendingByWeek, spendingFromHandoff, totalSavings } from '../budget';
import { detectPriceDrops, habitualProducts, watchesFromHandoffs } from '../priceAlerts';
import { NNBSP } from '../money';
import * as core from '../index';
import type { BasketStorePart, OrderHandoff, Price, SpendingEntry } from '../types';

const NOW = '2026-09-14T10:00:00.000Z';
const productsById = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
const [LECLERC, CARREFOUR, LIDL] = STORES;

const PART: BasketStorePart = {
  storeId: 's_leclerc',
  lines: [
    { itemId: 'item_pates', label: 'Pâtes', productId: 'p_pates_barilla', packs: 2, totalCents: 258 },
    { itemId: 'item_x', label: 'Article retiré du catalogue', productId: 'p_inconnu', packs: 1, totalCents: 100 },
  ],
  subtotalCents: 358,
  feesCents: 199,
};

describe('order', () => {
  it('buildProductSearchUrl encode nom + marque', () => {
    expect(buildProductSearchUrl(LECLERC, productsById.p_pates_barilla)).toBe(
      'https://leclerc.example/recherche?q=Spaghetti%20n%C2%B05%20Barilla',
    );
    expect(buildProductSearchUrl(LECLERC, productsById.p_tomate_vrac)).toBe('https://leclerc.example/recherche?q=Tomates%20rondes');
    expect(buildProductSearchUrl({ ...LECLERC, searchUrlTemplate: 'https://x/{query}/{query}' }, productsById.p_huile)).toBe(
      'https://x/Huile%20d%E2%80%99olive%20vierge%20extra%20Puget/Huile%20d%E2%80%99olive%20vierge%20extra%20Puget',
    );
  });

  it('appendQueryParams : avec / sans query string, ancre, remplacement', () => {
    expect(appendQueryParams('https://a.example/drive', { utm_source: 'cabas' })).toBe('https://a.example/drive?utm_source=cabas');
    expect(appendQueryParams('https://a.example/drive?ref=1', { utm_source: 'cabas' })).toBe('https://a.example/drive?ref=1&utm_source=cabas');
    expect(appendQueryParams('https://a.example/d?utm_source=old&x=2#panier', { utm_source: 'cabas' })).toBe(
      'https://a.example/d?x=2&utm_source=cabas#panier',
    );
    expect(appendQueryParams('https://a.example/d?', { a: 'b c' })).toBe('https://a.example/d?a=b%20c');
    expect(appendQueryParams('https://a.example/d?%E0%A4%A=1', { a: '1' })).toBe('https://a.example/d?%E0%A4%A=1&a=1');
    expect(appendQueryParams('https://a.example/d', {})).toBe('https://a.example/d');
  });

  it('buildOrderHandoff : URL drive + UTM, total frais inclus', () => {
    const h = buildOrderHandoff(PART, LECLERC, productsById, 'drive', { id: 'order_1', now: NOW });
    expect(h).toEqual({
      id: 'order_1',
      storeId: 's_leclerc',
      channel: 'drive',
      url: 'https://leclerc.example/drive?utm_source=cabas&utm_medium=app',
      lines: PART.lines,
      totalCents: 557,
      createdAt: NOW,
      status: 'prepared',
    });
    expect(h.lines).not.toBe(PART.lines);
    expect(buildOrderHandoff(PART, LIDL, productsById, 'delivery').url).toBe(
      'https://lidl.example/drive?ref=1&utm_source=cabas&utm_medium=app',
    );
    const generated = buildOrderHandoff(PART, CARREFOUR, new Map(PRODUCTS.map((p) => [p.id, p])), 'drive');
    expect(generated.id).toMatch(/^order_/);
    expect(Number.isNaN(Date.parse(generated.createdAt))).toBe(false);
  });

  it('sans URL drive : recherche du premier produit, ou URL vide', () => {
    const noDrive = { ...LECLERC, driveUrl: '' };
    expect(buildOrderHandoff(PART, noDrive, productsById, 'drive').url).toBe(
      'https://leclerc.example/recherche?q=Spaghetti%20n%C2%B05%20Barilla&utm_source=cabas&utm_medium=app',
    );
    expect(buildOrderHandoff({ ...PART, lines: [] }, noDrive, productsById, 'drive').url).toBe('');
  });

  it('formatOrderAsText', () => {
    const h = buildOrderHandoff(PART, LECLERC, productsById, 'drive', { id: 'o', now: NOW });
    expect(formatOrderAsText(h, LECLERC, productsById)).toBe(
      [
        'Ma commande Cabas — Leclerc Test (Drive)',
        '',
        `• 2 × Spaghetti n°5 (Barilla) — 2,58${NNBSP}€`,
        `• 1 × Article retiré du catalogue — 1,00${NNBSP}€`,
        '',
        `Frais de retrait : 1,99${NNBSP}€`,
        `Total : 5,57${NNBSP}€`,
      ].join('\n'),
    );
    const delivery = buildOrderHandoff({ ...PART, feesCents: 599 }, LECLERC, productsById, 'delivery');
    expect(formatOrderAsText(delivery, LECLERC, productsById)).toContain(`Frais de livraison : 5,99${NNBSP}€`);
    const noFees = buildOrderHandoff({ ...PART, feesCents: 0, lines: [{ ...PART.lines[0], productId: 'p_tomate_vrac' }], subtotalCents: 258 }, LECLERC, productsById, 'drive');
    const text = formatOrderAsText(noFees, LECLERC, productsById);
    expect(text).not.toContain('Frais');
    expect(text).toContain('• 2 × Tomates rondes — ');
  });
});

describe('entitlements', () => {
  const all: Feature[] = ['unlimited_planning', 'advanced_personalization', 'optimized_basket', 'one_click_order', 'price_alerts', 'budget_tracking', 'pantry'];
  it('gratuit : seulement le placard ; premium : tout', () => {
    for (const f of all) {
      expect(canUse(f, 'premium')).toBe(true);
      expect(canUse(f, 'free')).toBe(f === 'pantry');
    }
  });
  it('limites de repas', () => {
    expect(maxMealsPerWeek('free')).toBe(3);
    expect(maxMealsPerWeek('premium')).toBe(14);
  });
  it('textes du paywall en français', () => {
    for (const f of all) {
      expect(FEATURE_COPY[f].title.length).toBeGreaterThan(3);
      expect(FEATURE_COPY[f].description.length).toBeGreaterThan(20);
    }
    expect(PREMIUM_FEATURES).not.toContain('pantry');
    expect(yearlySavingsPercent()).toBe(33);
    expect(pricingLabels()).toEqual({
      monthly: `4,99${NNBSP}€/mois`,
      yearly: `39,99${NNBSP}€/an`,
      yearlyPerMonth: `soit 3,33${NNBSP}€/mois`,
      trial: '7 jours d’essai gratuit',
    });
  });
});

describe('budget', () => {
  const entries: SpendingEntry[] = [
    { id: 'a', date: '2026-09-29', storeId: 's', totalCents: 4000, savingsCents: 300, source: 'order' },
    { id: 'b', date: '2026-09-14', storeId: 's', totalCents: 5000, savingsCents: 500, source: 'order' },
    { id: 'c', date: '2026-09-20', storeId: 's', totalCents: 2500, savingsCents: 0, source: 'manual', label: 'Marché' },
    { id: 'd', date: '2026-10-02', storeId: 's', totalCents: 1000, savingsCents: 100, source: 'order' },
  ];

  it('spendingByWeek / spendingByMonth triés avec libellés FR', () => {
    expect(spendingByWeek(entries)).toEqual([
      { key: '2026-09-14', label: '14 – 20 sept.', totalCents: 7500, savingsCents: 500, count: 2 },
      { key: '2026-09-28', label: '28 sept. – 4 oct.', totalCents: 5000, savingsCents: 400, count: 2 },
    ]);
    expect(spendingByMonth(entries)).toEqual([
      { key: '2026-09', label: 'septembre 2026', totalCents: 11500, savingsCents: 800, count: 3 },
      { key: '2026-10', label: 'octobre 2026', totalCents: 1000, savingsCents: 100, count: 1 },
    ]);
    expect(spendingByWeek([])).toEqual([]);
  });

  it('budgetStatus', () => {
    expect(budgetStatus(entries, 8000, '2026-09-14')).toEqual({ spentCents: 7500, remainingCents: 500, ratio: 0.9375, over: false });
    expect(budgetStatus(entries, 7000, '2026-09-14')).toEqual({ spentCents: 7500, remainingCents: 0, ratio: 7500 / 7000, over: true });
    expect(budgetStatus(entries, 0, '2026-09-21')).toEqual({ spentCents: 0, remainingCents: 0, ratio: 0, over: false });
  });

  it('totalSavings et création d’entrées', () => {
    expect(totalSavings(entries)).toBe(900);
    // Horodatage construit en heure locale : le jour attendu ne dépend pas du fuseau de la machine.
    const createdAt = new Date(2026, 8, 14, 12, 0).toISOString();
    const h: OrderHandoff = { id: 'o1', storeId: 's_leclerc', channel: 'drive', url: '', lines: [], totalCents: 4200, createdAt, status: 'confirmed' };
    expect(spendingFromHandoff(h, 350, 'Courses')).toEqual({
      id: 'spend_o1',
      date: '2026-09-14',
      storeId: 's_leclerc',
      totalCents: 4200,
      savingsCents: 350,
      source: 'order',
      label: 'Courses',
    });
    expect(spendingFromHandoff(h, -5).savingsCents).toBe(0);
    expect(spendingFromHandoff(h).label).toBeUndefined();
    // Jour LOCAL de l'horodatage (0 h 30 le 15, encore le 14 en UTC à Paris), date jour telle quelle.
    expect(spendingFromHandoff({ ...h, createdAt: new Date(2026, 8, 15, 0, 30).toISOString() }).date).toBe('2026-09-15');
    expect(spendingFromHandoff({ ...h, createdAt: '2026-09-16' }).date).toBe('2026-09-16');
    const m = createManualSpending('2026-09-15T12:00:00Z', 's_lidl', 1234.6, { label: 'Marché' });
    expect(m).toMatchObject({ date: '2026-09-15', totalCents: 1235, source: 'manual', label: 'Marché', savingsCents: 0 });
    expect(m.id).toMatch(/^spend_/);
    expect(createManualSpending('2026-09-15', 's', -10, { id: 'x' })).toMatchObject({ id: 'x', totalCents: 0 });
  });
});

describe('alertes prix', () => {
  const prices: Price[] = [
    { productId: 'p1', storeId: 's1', priceCents: 200, updatedAt: '2026-09-01', source: 'demo' },
    { productId: 'p1', storeId: 's1', priceCents: 180, updatedAt: '2026-09-10', source: 'demo' }, // plus récent
    { productId: 'p2', storeId: 's1', priceCents: 300, promoPriceCents: 210, promoUntil: '2026-09-20', updatedAt: '2026-09-10', source: 'demo' },
    { productId: 'p3', storeId: 's1', priceCents: 98, updatedAt: '2026-09-10', source: 'demo' },
    { productId: 'p4', storeId: 's1', priceCents: 500, updatedAt: '2026-09-10', source: 'demo' },
  ];

  it('detectPriceDrops : seuil, promo, tri', () => {
    const watch = [
      { productId: 'p1', storeId: 's1', referenceCents: 200 }, // −10 %
      { productId: 'p1', storeId: 's1', referenceCents: 200 }, // doublon
      { productId: 'p2', storeId: 's1', referenceCents: 300 }, // promo −30 %
      { productId: 'p3', storeId: 's1', referenceCents: 100 }, // −2 % < seuil
      { productId: 'p4', storeId: 's1', referenceCents: 400 }, // hausse
      { productId: 'p5', storeId: 's1', referenceCents: 100 }, // pas de prix
      { productId: 'p1', storeId: 's9', referenceCents: 100 }, // autre magasin
      { productId: 'p4', storeId: 's1', referenceCents: 0 }, // référence invalide
    ];
    expect(detectPriceDrops(watch, prices, { now: NOW })).toEqual([
      { productId: 'p2', storeId: 's1', oldCents: 300, newCents: 210, dropPct: 30 },
      { productId: 'p1', storeId: 's1', oldCents: 200, newCents: 180, dropPct: 10 },
    ]);
    expect(detectPriceDrops(watch, prices, { now: NOW, thresholdPct: 1 }).map((d) => d.productId)).toEqual(['p2', 'p1', 'p3']);
    // promo expirée
    expect(detectPriceDrops(watch, prices, { now: '2026-09-25' }).map((d) => d.productId)).toEqual(['p1']);
    expect(detectPriceDrops([], prices)).toEqual([]);
  });

  const handoffs: OrderHandoff[] = [1, 2, 3].map((n) => ({
    id: `o${n}`,
    storeId: n === 3 ? 's2' : 's1',
    channel: 'drive',
    url: '',
    lines: [
      { itemId: 'i1', label: 'Pâtes', productId: 'p1', packs: 2, totalCents: n === 2 ? 360 : 400 },
      { itemId: 'i1b', label: 'Pâtes encore', productId: 'p1', packs: 1, totalCents: 200 },
      ...(n !== 1 ? [{ itemId: 'i2', label: 'Lait', productId: 'p2', packs: 0, totalCents: 0 }] : []),
    ],
    totalCents: 0,
    createdAt: `2026-09-0${n}T10:00:00Z`,
    status: 'confirmed' as const,
  }));

  it('habitualProducts : une commande compte une fois par produit', () => {
    expect(habitualProducts(handoffs)).toEqual([{ productId: 'p1', storeId: 's1', count: 2 }]);
    expect(habitualProducts(handoffs, 1)).toEqual([
      { productId: 'p1', storeId: 's1', count: 2 },
      { productId: 'p1', storeId: 's2', count: 1 },
      { productId: 'p2', storeId: 's1', count: 1 },
      { productId: 'p2', storeId: 's2', count: 1 },
    ]);
  });

  it('watchesFromHandoffs : dernier prix unitaire payé', () => {
    expect(watchesFromHandoffs(handoffs)).toEqual([{ productId: 'p1', storeId: 's1', referenceCents: 200 }]);
    expect(watchesFromHandoffs(handoffs, 1)).toEqual([
      { productId: 'p1', storeId: 's1', referenceCents: 200 },
      { productId: 'p1', storeId: 's2', referenceCents: 200 },
    ]);
  });
});

describe('barrel index', () => {
  it('exporte toutes les fonctions publiques et les référentiels', () => {
    const expected = [
      'hashString', 'mulberry32', 'seededShuffle', 'createId',
      'toISODate', 'parseISODate', 'startOfWeek', 'addDays', 'weekDates', 'weekdayIndex', 'isWeekend', 'formatDayLabel', 'formatWeekRange', 'relativeDayLabel',
      'formatPrice', 'formatPricePerUnit', 'sumCents', 'percent',
      'toBase', 'convertBase', 'formatQuantity', 'formatIngredientLine', 'pluralize',
      'householdPortions', 'scaleQuantity', 'scaleRecipeIngredients',
      'recipeAllergens', 'dietAllows', 'checkRecipe', 'isRecipeSafe', 'filterRecipes', 'assertPlanSafe',
      'generateMealPlan', 'suggestAlternatives', 'replaceMeal', 'buildLlmPrompt', 'parseLlmResponse', 'planFromSelection',
      'buildShoppingList', 'roundToPackaging', 'mergeWithExisting', 'groupByAisle', 'guessAisle', 'createManualItem', 'listProgress',
      'effectivePrice', 'buildCatalogIndex', 'compareItem', 'compareList',
      'storeTotals', 'optimizeBasket',
      'buildProductSearchUrl', 'buildOrderHandoff', 'formatOrderAsText',
      'canUse', 'maxMealsPerWeek', 'FEATURE_COPY',
      'subtractPantry', 'recipesUsingLeftovers', 'expiringSoon',
      'spendingByWeek', 'spendingByMonth', 'budgetStatus', 'totalSavings',
      'detectPriceDrops', 'habitualProducts',
      'ALLERGENS', 'DIETS', 'AISLES', 'FREE_TIER', 'PREMIUM_PRICING', 'ALLERGEN_LABELS', 'AISLE_LABELS',
    ];
    const exported = core as unknown as Record<string, unknown>;
    for (const name of expected) expect([name, exported[name] !== undefined]).toEqual([name, true]);
  });
});

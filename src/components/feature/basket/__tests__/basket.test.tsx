import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { BasketPlan, ItemComparison, Product, ShoppingListItem, Store, StoreOffer } from '@/core';
import { allOffersForItem, buildCatalogIndex, compareList, MINUS, NNBSP, optimizeBasket, storeDisplayName } from '@/core';
import { ingredients, prices, products, stores } from '@/data';

import { BasketControls } from '../BasketControls';
import { BasketReceipt } from '../BasketReceipt';
import {
  basketScreenState,
  cheapestGainCents,
  comparedStoreIds,
  comparisonRows,
  emptyBasketReason,
  estimatedCount,
  estimatedNote,
  feesLabel,
  feesValue,
  lineForItem,
  mddSignal,
  missingRows,
  orderCtaLabel,
  packLabel,
  minOrderWarning,
  packsLabel,
  productTitle,
  receiptSummary,
  savingsLabel,
  serviceLabel,
  visibleLines,
} from '../basketView';
import { ComparisonRow } from '../ComparisonRow';
import { needLabel, priceSpread, productChoices, selectionFor, storeOfferRows, storesWithoutItem } from '../comparatorView';
import { MissingItems, missingReason } from '../MissingItems';
import { OfferRow, ProductChoiceRow } from '../OfferRow';
import { StorePartCard } from '../StorePartCard';
import { comparableItems, findItem, manualItem } from './catalogPicks';

// ─── Données : vrai catalogue embarqué (données ouvertes), date figée ───────
// Les articles sont CHOISIS dans le catalogue (chiffrés dans mes 3 enseignes) et
// les attendus en sont dérivés : aucun produit ni prix en dur.

const NOW = '2026-11-10T09:00:00.000Z';
const TODAY = '2026-11-10';
const NBSP = ' ';
const index = buildCatalogIndex(products, prices, stores, ingredients);
const storesById = Object.fromEntries(stores.map((s) => [s.id, s])) as Record<string, Store>;
const productsById = Object.fromEntries(products.map((p) => [p.id, p])) as Record<string, Product>;
const MY_STORES = ['leclerc', 'carrefour', 'auchan'];

function item(id: string, ingredientId: string | undefined, label: string, quantity: number, over: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return {
    id,
    ...(ingredientId ? { ingredientId } : {}),
    label,
    quantity,
    unit: 'g',
    aisle: 'fruits_legumes',
    checked: false,
    source: ingredientId ? 'plan' : 'manual',
    recipeIds: ingredientId ? ['rec_a'] : [],
    ...over,
  };
}

const PRICED = comparableItems(index, ingredients, { storeIds: MY_STORES, count: 4, now: NOW });
const EAU = manualItem('i-eau', 'Eau gazeuse');
const ITEMS: ShoppingListItem[] = [...PRICED, EAU];
// Catalogue pas encore importé : repli sur l'article manuel (les tests dépendants échouent seuls).
const FIRST = PRICED[0] ?? EAU;
const comparisons = compareList(ITEMS, index, NOW);
const single = optimizeBasket(comparisons, stores, 'single_store', { allowedStoreIds: MY_STORES, now: NOW });
const cheapest = optimizeBasket(comparisons, stores, 'cheapest', { allowedStoreIds: MY_STORES, now: NOW });

// ─── Libellés ────────────────────────────────────────────────────────────────

describe('catalogue de test', () => {
  it('trouve 4 articles chiffrés dans mes 3 enseignes (catalogue importé)', () => {
    expect(PRICED).toHaveLength(4);
  });
});

describe('libellés', () => {
  it('nomme le service et la commande selon l’enseigne', () => {
    expect(orderCtaLabel(storesById.carrefour)).toBe('Commander chez Carrefour');
    expect(orderCtaLabel(storesById.leclerc)).toBe('Commander chez Leclerc');
    // Pas de commande en ligne chez Lidl, Aldi, Netto : une liste à emporter.
    expect(orderCtaLabel(storesById.lidl)).toBe('Ma liste pour Lidl');
    expect(orderCtaLabel(null)).toBe('Commander chez l’enseigne');
    expect(serviceLabel(storesById.leclerc, 'drive')).toBe('Drive');
    expect(serviceLabel(storesById.monoprix, 'drive')).toBe('Click & collect');
    expect(serviceLabel(storesById.aldi, 'drive')).toBe('En magasin');
    expect(serviceLabel(storesById.monoprix, 'delivery')).toBe('Livraison');
    expect(serviceLabel(undefined, 'drive')).toBe('Drive');
  });

  it('compte les prix estimés', () => {
    const lines = [{ priceSource: 'estimate' as const }, { priceSource: 'open_prices' as const }, {}, { priceSource: 'estimate' as const }];
    expect(estimatedCount(lines)).toBe(2);
    expect(estimatedNote(2)).toBe('dont 2 prix estimés');
    expect(estimatedNote(1)).toBe('dont 1 prix estimé');
    expect(estimatedNote(0)).toBe('');
  });

  it('chiffre les économies et les frais en typographie française', () => {
    expect(savingsLabel(714)).toBe(`${MINUS}7,14${NNBSP}€`);
    expect(savingsLabel(-50)).toBe(`0,00${NNBSP}€`);
    expect(feesLabel('drive')).toBe('Frais de retrait');
    expect(feesLabel('delivery')).toBe('Frais de livraison');
    expect(feesValue(0)).toBe('Offerts');
    expect(feesValue(599)).toBe(`5,99${NNBSP}€`);
  });

  it('écrit les conditionnements sans coupure de ligne', () => {
    expect(packLabel({ packSize: 250, packUnit: 'g' })).toBe(`250${NBSP}g`);
    expect(packLabel({ packSize: 1000, packUnit: 'g' })).toBe(`1${NBSP}kg`);
    expect(packLabel({ packSize: 6, packUnit: 'piece' })).toBe(`6${NBSP}pièces`);
    // Sachet d'herbes plus petit qu'une botte : fraction lisible, virgule française.
    expect(packLabel({ packSize: 0.4, packUnit: 'piece' })).toBe(`0,4${NBSP}pièce`);
    expect(packsLabel(2, { packSize: 250, packUnit: 'g' })).toBe(`2${NBSP}×${NBSP}250${NBSP}g`);
    expect(packsLabel(1, undefined)).toBe(`1${NBSP}×`);
    expect(productTitle({ name: 'Ail blanc', brand: 'Auchan' }, 'Ail')).toBe('Ail blanc · Auchan');
    expect(productTitle(undefined, 'Ail')).toBe('Ail');
    expect(needLabel({ quantity: 190, unit: 'g' })).toBe('190 g');
    expect(needLabel({ quantity: 3, unit: 'piece' })).toBe('3 pièces');
    expect(needLabel({ quantity: 1, unit: 'piece' })).toBe('1 pièce');
  });
});

// ─── État de l'écran ─────────────────────────────────────────────────────────

describe('basketScreenState', () => {
  const list = { items: ITEMS };
  const base = { hydrated: true, list, status: 'ready' as const, plan: single, otherWeek: false };

  it('attend la relecture du disque, puis distingue liste vide et tout coché', () => {
    expect(basketScreenState({ ...base, hydrated: false })).toBe('loading');
    expect(basketScreenState({ ...base, list: null })).toBe('empty');
    expect(basketScreenState({ ...base, list: { items: [] } })).toBe('empty');
    expect(basketScreenState({ ...base, list: { items: ITEMS.map((i) => ({ ...i, checked: true })) } })).toBe('allChecked');
  });

  it('montre des squelettes sans panier, l’erreur seulement sans panier exploitable', () => {
    expect(basketScreenState({ ...base, plan: null, status: 'computing' })).toBe('computing');
    expect(basketScreenState({ ...base, plan: null, status: 'idle' })).toBe('computing');
    expect(basketScreenState({ ...base, otherWeek: true })).toBe('computing');
    expect(basketScreenState({ ...base, plan: null, status: 'error' })).toBe('error');
    // Panier présent : il reste affiché pendant un recalcul ou après une erreur.
    expect(basketScreenState({ ...base, status: 'computing' })).toBe('ready');
    expect(basketScreenState({ ...base, status: 'error' })).toBe('ready');
  });
});

// ─── Ticket, comparaison, introuvables ───────────────────────────────────────

describe('receiptSummary', () => {
  it('résume le panier « un seul magasin » (articles, total, introuvables)', () => {
    const s = receiptSummary(single, storesById);
    expect(s.parts).toHaveLength(1);
    expect(MY_STORES).toContain(s.parts[0].storeId);
    expect(s.items).toBe(4);
    expect(s.missing).toBe(1);
    expect(s.estimated).toBe(estimatedCount(single.parts[0].lines));
    expect(s.parts[0].name).toBe(storeDisplayName(storesById[s.parts[0].storeId]));
    expect(s.totalCents).toBe(single.totalCents);
    expect(s.subtotalCents + s.feesCents).toBe(single.totalCents);
    expect(s.chains).toEqual([s.parts[0].store?.chain]);
  });

  it('additionne les magasins du panier « le moins cher »', () => {
    const s = receiptSummary(cheapest, storesById);
    expect(s.mode).toBe('cheapest');
    expect(s.totalCents).toBeLessThanOrEqual(single.totalCents);
    expect(s.parts.reduce((n, p) => n + p.items, 0)).toBe(s.items);
  });
});

describe('comparisonRows', () => {
  const rows = comparisonRows(comparisons, single);

  it('ne garde que les articles chiffrés, avec la meilleure offre et l’écart', () => {
    expect(rows.map((r) => r.itemId)).toEqual(PRICED.map((i) => i.id));
    for (const r of rows) {
      const c = comparisons.find((x) => x.itemId === r.itemId) as ItemComparison;
      expect(r.best.totalCents).toBe(Math.min(...c.offers.map((o) => o.totalCents)));
      expect(r.stores).toBeGreaterThanOrEqual(3);
      expect(r.spreadCents).toBe(Math.max(...c.offers.map((o) => o.totalCents)) - r.best.totalCents);
      expect(r.inBasket).toBe(true);
      expect(r.bestEstimated).toBe(r.best.priceSource === 'estimate');
    }
    const ids = Array.from(new Set(comparisons.flatMap((c) => c.offers.map((o) => o.storeId)))).sort();
    expect(comparedStoreIds(comparisons)).toEqual(ids);
  });

  it('indique le prix payé dans le panier quand il n’est pas au meilleur prix', () => {
    for (const r of rows) {
      const line = lineForItem(single, r.itemId);
      if (!line) continue;
      if (line.storeId === r.bestStoreId && line.totalCents === r.best.totalCents) expect(r.basket).toBeNull();
      else {
        expect(r.basket).toEqual({
          storeId: line.storeId,
          totalCents: line.totalCents,
          extraCents: Math.max(0, line.totalCents - r.best.totalCents),
          // Prix estimé dans le panier : toujours signalé.
          estimated: line.priceSource === 'estimate',
        });
      }
    }
    expect(lineForItem(null, FIRST.id)).toBeNull();
    expect(lineForItem(single, 'i-eau')).toBeNull();
  });

  it('signale la MDD moins chère, retenue ou disponible', () => {
    // Un article du catalogue dont la MDD bat la marque dans un même magasin.
    const altItem = findItem(index, ingredients, (it) => !!compareList([it], index, NOW)[0].cheaperAlternative);
    expect(altItem).toBeDefined();
    const withAlt = compareList([altItem as ShoppingListItem], index, NOW)[0];
    const alt = withAlt.cheaperAlternative as NonNullable<ItemComparison['cheaperAlternative']>;
    expect(mddSignal(withAlt)).toEqual({ kind: 'chosen', savingsCents: alt.savingsCents, storeId: alt.storeId, productId: alt.productId });
    // L'utilisateur a choisi la marque nationale dans ce magasin : la MDD devient une suggestion.
    const national: ItemComparison = {
      ...withAlt,
      offers: withAlt.offers.map((o) => (o.storeId === alt.storeId ? { ...o, productId: 'prd_marque', isStoreBrand: false } : o)),
    };
    expect(mddSignal(national)?.kind).toBe('available');
    expect(mddSignal({ ...withAlt, cheaperAlternative: undefined })).toBeNull();
  });
});

describe('missingRows', () => {
  it('distingue « introuvable partout » et « pas dans tes magasins »', () => {
    expect(missingRows(single, comparisons)).toEqual([{ itemId: 'i-eau', label: 'Eau gazeuse', reason: 'nowhere', elsewhere: null }]);
    const plan: BasketPlan = { ...single, missingItemIds: [FIRST.id] };
    const [row] = missingRows(plan, comparisons);
    const best = comparisons[0].best as NonNullable<ItemComparison['best']>;
    expect(row).toEqual({
      itemId: FIRST.id,
      label: FIRST.label,
      reason: 'elsewhere',
      elsewhere: { storeId: best.storeId, totalCents: best.totalCents, estimated: best.priceSource === 'estimate' },
    });
    expect(missingReason(row, storesById)).toMatch(/^Pas dans tes magasins\. Dispo chez /);
    expect(missingRows(null, comparisons)).toEqual([]);
  });

  it('dit « prix estimé » quand le meilleur prix ailleurs est une estimation', () => {
    const row = { itemId: 'x', label: 'Riz', reason: 'elsewhere' as const, elsewhere: { storeId: 'leclerc', totalCents: 595, estimated: true } };
    expect(missingReason(row, storesById)).toBe(`Pas dans tes magasins. Dispo chez Leclerc à 5,95${NNBSP}€ (prix estimé).`);
    expect(missingReason({ ...row, elsewhere: { ...row.elsewhere, estimated: false } }, storesById)).not.toMatch(/estimé/);
  });

  it('distingue un article écarté pour une allergie et un magasin écarté pour son minimum de commande', () => {
    const plan: BasketPlan = {
      ...single,
      missingItemIds: ['i-eau', FIRST.id],
      minOrderSkipped: [{ storeId: 'monoprix', minOrderCents: 6000, itemIds: [FIRST.id] }],
    };
    const noOffers = comparisons.map((c) => (c.itemId === FIRST.id ? c : { ...c, offers: [], best: undefined }));
    const rows = missingRows(plan, noOffers, { allergenExcludedItemIds: ['i-eau'] });
    expect(rows.map((r) => [r.itemId, r.reason])).toEqual([
      ['i-eau', 'allergen'],
      [FIRST.id, 'min_order'],
    ]);
    expect(missingReason(rows[0], storesById)).toMatch(/contiennent un de tes allergènes/);
    expect(missingReason(rows[1], storesById)).toBe(`Chez Monoprix, mais ta commande y resterait sous son minimum de 60,00${NNBSP}€.`);
  });

  it('avertit d’une part sous le minimum de commande (montant manquant)', () => {
    expect(minOrderWarning({ subtotalCents: 619, minOrderShortfallCents: 5381 }, storesById.monoprix)).toEqual({
      title: `Minimum de commande : 60,00${NNBSP}€`,
      message: `Il manque 53,81${NNBSP}€ pour commander chez Monoprix : ajoute des articles ou fais tes courses sur place.`,
    });
    expect(minOrderWarning({ subtotalCents: 6200 }, storesById.monoprix)).toBeNull();
  });
});

describe('emptyBasketReason', () => {
  it('distingue articles hors catalogue, pas de livraison et magasins qui ne les vendent pas', () => {
    // Articles saisis à la main (sans ingrédient) : aucune offre nulle part.
    const manual = compareList([item('m1', undefined, 'Lait', 1), item('m2', undefined, 'Lessive', 1)], index, NOW);
    expect(emptyBasketReason(manual, stores, { channel: 'drive', storeIds: ['leclerc'] })).toBe('not_in_catalog');
    // Même en livraison chez un magasin qui livre : pas « ne livre pas ».
    expect(emptyBasketReason(manual, stores, { channel: 'delivery', storeIds: ['carrefour'] })).toBe('not_in_catalog');
    // Lidl et Aldi ne livrent pas.
    expect(emptyBasketReason(comparisons, stores, { channel: 'delivery', storeIds: ['lidl', 'aldi'] })).toBe('no_delivery');
    expect(emptyBasketReason(comparisons, stores, { channel: 'delivery', storeIds: ['leclerc', 'carrefour'] })).toBe('not_sold');
    expect(emptyBasketReason(comparisons, stores, { channel: 'drive', storeIds: ['lidl'] })).toBe('not_sold');
    // Aucun magasin connu : tous les magasins comptent (certains livrent).
    expect(emptyBasketReason(comparisons, stores, { channel: 'delivery', storeIds: [] })).toBe('not_sold');
  });
});

describe('cheapestGainCents', () => {
  it('chiffre le gain du panier multi-magasins par rapport au panier affiché', () => {
    const gain = cheapestGainCents(comparisons, single, stores, { channel: 'drive', storeIds: MY_STORES });
    const expected = single.totalCents - cheapest.totalCents;
    expect(gain).toBe(expected > 0 ? expected : null);
    expect(cheapestGainCents(comparisons, cheapest, stores, { channel: 'drive', storeIds: MY_STORES })).toBeNull();
    expect(cheapestGainCents(comparisons, null, stores, { channel: 'drive', storeIds: MY_STORES })).toBeNull();
    expect(cheapestGainCents([], single, stores, { channel: 'drive', storeIds: MY_STORES })).toBeNull();
  });

  it('trouve un gain réel quand un magasin bat les autres sur certains articles', () => {
    // Articles chiffrés dans mes 3 enseignes (frais de retrait nuls) : le panier
    // « 2 magasins » couvre les mêmes articles que le meilleur magasin seul.
    const lines = comparableItems(index, ingredients, { storeIds: MY_STORES, count: 20, now: NOW });
    const cmp = compareList(lines, index, NOW);
    const one = optimizeBasket(cmp, stores, 'single_store', { allowedStoreIds: MY_STORES, now: NOW });
    const two = optimizeBasket(cmp, stores, 'cheapest', { allowedStoreIds: MY_STORES, now: NOW });
    const solo = one.parts[0].storeId;
    // Un article moins cher ailleurs que dans le magasin unique ⇒ gain strict.
    const improvable = cmp.some((c) => {
      const mine = c.offers.filter((o) => MY_STORES.includes(o.storeId));
      const here = mine.find((o) => o.storeId === solo);
      return !!here && mine.some((o) => o.totalCents < here.totalCents);
    });
    expect(improvable).toBe(true);
    expect(two.totalCents).toBeLessThan(one.totalCents);
    expect(cheapestGainCents(cmp, one, stores, { channel: 'drive', storeIds: MY_STORES })).toBe(one.totalCents - two.totalCents);
  });
});

describe('visibleLines', () => {
  it('replie au-delà de 3 lignes', () => {
    const part = { lines: Array.from({ length: 5 }, (_, i) => ({ itemId: `x${i}`, label: 'x', productId: 'p', packs: 1, totalCents: 100 })) };
    expect(visibleLines(part, false)).toHaveLength(3);
    expect(visibleLines(part, true)).toHaveLength(5);
  });
});

// ─── Détail d'un article (logique) ───────────────────────────────────────────

describe('comparatorView', () => {
  const first = comparisons[0];
  const line = lineForItem(single, FIRST.id);

  it('liste une offre par enseigne, la meilleure et celle du panier', () => {
    const rows = storeOfferRows(first, storesById, productsById, line);
    expect(rows).toHaveLength(first.offers.length);
    expect(rows.filter((r) => r.isBest)).toHaveLength(1);
    expect(rows[0].isBest).toBe(true);
    expect(rows[0].extraCents).toBe(0);
    expect(rows.filter((r) => r.inBasket)).toHaveLength(1);
    expect(rows.every((r, i) => i === 0 || r.extraCents >= 0)).toBe(true);
    expect(priceSpread(first)).toBe(rows[rows.length - 1].extraCents);
    expect(priceSpread({ ...first, offers: first.offers.slice(0, 1) })).toBe(0);
    // Enseignes sans prix connu : toutes celles qui n'ont pas d'offre.
    const without = storesWithoutItem(first, stores);
    expect(without.length + first.offers.length).toBe(stores.length);
    expect(without.every((s) => !first.offers.some((o) => o.storeId === s.id))).toBe(true);
    expect(storesWithoutItem({ ...first, offers: first.offers.slice(0, 1) }, stores)).toHaveLength(stores.length - 1);
  });

  it('propose les produits du magasin du panier, du moins cher au plus cher', () => {
    const [multi] = comparableItems(index, ingredients, { storeIds: ['leclerc'], count: 1, minStores: 1, choicesAt: 'leclerc', now: NOW });
    expect(multi).toBeDefined();
    const offers = allOffersForItem(multi, index, NOW);
    const choices = productChoices(offers, 'leclerc', productsById, null);
    expect(choices.length).toBeGreaterThanOrEqual(2);
    expect(choices[0].isAuto).toBe(true);
    expect(choices.slice(1).every((c) => !c.isAuto)).toBe(true);
    for (let i = 1; i < choices.length; i++) expect(choices[i].offer.totalCents).toBeGreaterThanOrEqual(choices[i - 1].offer.totalCents);
    const picked = productChoices(offers, 'leclerc', productsById, choices[1].productId);
    expect(picked.filter((c) => c.selected).map((c) => c.productId)).toEqual([choices[1].productId]);
    // Le produit automatique annule le choix ; un autre produit le fixe.
    expect(selectionFor(choices[0])).toBeNull();
    expect(selectionFor(choices[1])).toBe(choices[1].productId);
  });
});

// ─── Composants ──────────────────────────────────────────────────────────────

describe('BasketReceipt', () => {
  it('affiche magasins, frais offerts, économie chiffrée et total', async () => {
    const plan: BasketPlan = { ...single, savingsCents: 714 };
    const s = receiptSummary(plan, storesById);
    await render(<BasketReceipt summary={s} channel="drive" header="Un seul magasin" testID="r" />);
    expect(screen.getByText('Ticket · Un seul magasin')).toBeTruthy();
    expect(screen.getByText('1 magasin')).toBeTruthy();
    expect(screen.getByText(s.parts[0].name)).toBeTruthy();
    expect(screen.getByText('Offerts')).toBeTruthy();
    // Lignes de ticket lues en clair (libellé : montant).
    expect(screen.getByLabelText('Frais de retrait : Offerts')).toBeTruthy();
    const hint = ['4 articles', estimatedNote(s.parts[0].estimated)].filter(Boolean).join(', ');
    expect(screen.getByLabelText(new RegExp(`^${s.parts[0].name}, ${hint} : \\d+ euros`))).toBeTruthy();
    expect(screen.getByLabelText('Économie, vs. le magasin le plus cher : moins 7 euros 14')).toBeTruthy();
    expect(screen.getByText(`${MINUS}7,14${NNBSP}€`)).toBeTruthy();
    expect(screen.getByTestId('r-total')).toHaveTextContent(new RegExp(`^${(plan.totalCents / 100).toFixed(2).replace('.', ',')}`));
    expect(screen.getByTestId('r-total-detail')).toHaveTextContent(`4${NBSP}articles · 1${NBSP}introuvable`, { exact: false });
    expect(screen.getByLabelText(/^Total : /)).toBeTruthy();
  });

  it('signale un recalcul sans masquer les chiffres', async () => {
    await render(<BasketReceipt summary={receiptSummary(single, storesById)} channel="drive" updating testID="r" />);
    expect(screen.getByText('Mise à jour…')).toBeTruthy();
    expect(screen.getByTestId('r')).toHaveProp('accessibilityState', { busy: true });
    expect(screen.getByTestId('r-total')).toBeTruthy();
  });

  it('courses en magasin seulement (Lidl, Aldi, Netto) : pas de ligne « frais de retrait »', async () => {
    const plan: BasketPlan = { ...single, parts: single.parts.map((p) => ({ ...p, storeId: 'lidl', feesCents: 0 })) };
    await render(<BasketReceipt summary={receiptSummary(plan, storesById)} channel="drive" />);
    expect(screen.queryByText('Frais de retrait')).toBeNull();
  });

  it('montre les frais de livraison et masque l’économie nulle', async () => {
    const plan: BasketPlan = { ...single, savingsCents: 0, missingItemIds: [], parts: single.parts.map((p) => ({ ...p, feesCents: 599 })) };
    await render(<BasketReceipt summary={receiptSummary(plan, storesById)} channel="delivery" />);
    expect(screen.getByText('Frais de livraison')).toBeTruthy();
    expect(screen.getByText(`5,99${NNBSP}€`)).toBeTruthy();
    expect(screen.queryByText('Économie')).toBeNull();
  });
});

describe('BasketControls', () => {
  it('change de mode et de canal', async () => {
    const onModeChange = jest.fn();
    const onChannelChange = jest.fn();
    await render(
      <BasketControls mode="single_store" channel="drive" isPremium={false} onModeChange={onModeChange} onChannelChange={onChannelChange} testID="ctl" />,
    );
    await fireEvent.press(screen.getByTestId('ctl-mode-cheapest'));
    expect(onModeChange).toHaveBeenCalledWith('cheapest');
    expect(screen.getByRole('radio', { name: 'Drive' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Livraison' }));
    expect(onChannelChange).toHaveBeenCalledWith('delivery');
    // Le canal déjà choisi ne relance rien.
    await fireEvent.press(screen.getByRole('radio', { name: 'Drive' }));
    expect(onChannelChange).toHaveBeenCalledTimes(1);
  });

  it('rappelle que « le moins cher » est Premium pour un compte gratuit', async () => {
    const props = { channel: 'drive' as const, onModeChange: jest.fn(), onChannelChange: jest.fn() };
    const view = await render(<BasketControls mode="cheapest" isPremium={false} {...props} />);
    expect(screen.getByText(/Réservé à Premium\./)).toBeTruthy();
    await view.rerender(<BasketControls mode="cheapest" isPremium {...props} />);
    expect(screen.queryByText(/Réservé à Premium\./)).toBeNull();
  });
});

describe('StorePartCard', () => {
  // Catalogue pas encore importé : magasin vide (ces tests échouent seuls, pas la suite).
  const part = single.parts[0] ?? { storeId: 'leclerc', lines: [], subtotalCents: 0, feesCents: 0 };
  const store = storesById[part.storeId];
  const bigPart = { ...part, lines: [...part.lines, ...part.lines.map((l) => ({ ...l, itemId: `${l.itemId}-bis` }))] };

  it('replie les lignes, les déplie, et commande', async () => {
    const onOrder = jest.fn();
    const onOpenItem = jest.fn();
    await render(
      <StorePartCard part={bigPart} store={store} channel="drive" productsById={productsById} onOrder={onOrder} onOpenItem={onOpenItem} testID="sp" />,
    );
    expect(screen.queryByTestId('sp-line-3')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: `Voir les ${bigPart.lines.length} articles` }));
    expect(screen.getByTestId(`sp-line-${bigPart.lines.length - 1}`)).toBeTruthy();
    expect(screen.getByText('Replier')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('sp-line-0'));
    expect(onOpenItem).toHaveBeenCalledWith(bigPart.lines[0].itemId);
    await fireEvent.press(screen.getByRole('button', { name: orderCtaLabel(store) }));
    expect(onOrder).toHaveBeenCalledTimes(1);
  });

  it('signale une part sous le minimum de commande (montant manquant)', async () => {
    const monoprix = storesById.monoprix;
    const below = { ...part, storeId: 'monoprix', subtotalCents: 619, minOrderShortfallCents: 5381 };
    await render(<StorePartCard part={below} store={monoprix} channel="drive" productsById={productsById} onOrder={jest.fn()} testID="sp" />);
    expect(screen.getByTestId('sp-min-order')).toBeTruthy();
    expect(screen.getByText(`Minimum de commande : 60,00${NNBSP}€`)).toBeTruthy();
    expect(screen.getByText(/Il manque 53,81/)).toBeTruthy();
  });

  it('signale une commande déjà validée', async () => {
    await render(<StorePartCard part={part} store={store} channel="drive" productsById={productsById} orderStatus="confirmed" onOrder={jest.fn()} />);
    expect(screen.getByText('Commande validée cette semaine')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Voir ma commande' })).toBeTruthy();
  });
});

describe('ComparisonRow', () => {
  it('met en avant le meilleur prix et ouvre le détail', async () => {
    const rows = comparisonRows(comparisons, single);
    const row = rows[0];
    const onPress = jest.fn();
    await render(<ComparisonRow row={row} storesById={storesById} totalStores={5} onPress={onPress} testID="cr" />);
    expect(screen.getByText(row.label)).toBeTruthy();
    expect(screen.getByLabelText(new RegExp(`^${row.label}, meilleur prix .+ chez ${storeDisplayName(storesById[row.bestStoreId], { short: true })}`))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('cr'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('accorde « enseigne » au singulier quand une seule la vend', async () => {
    const row = { ...comparisonRows(comparisons, single)[0], stores: 1 };
    const view = await render(<ComparisonRow row={row} storesById={storesById} totalStores={5} onPress={jest.fn()} testID="cr" />);
    expect(screen.getByText(/ · 1 enseigne$/)).toBeTruthy();
    expect(screen.getByLabelText(/, 1 enseigne comparée/)).toBeTruthy();
    await view.rerender(<ComparisonRow row={{ ...row, stores: 3 }} storesById={storesById} totalStores={5} onPress={jest.fn()} testID="cr" />);
    expect(screen.getByText(/ · 3 enseignes$/)).toBeTruthy();
    expect(screen.getByLabelText(/, 3 enseignes comparées/)).toBeTruthy();
  });

  it('suggère la MDD moins chère quand une marque a été choisie', async () => {
    const row = { ...comparisonRows(comparisons, single)[0], mdd: { kind: 'available' as const, savingsCents: 50, storeId: 'auchan', productId: 'p' } };
    await render(<ComparisonRow row={row} storesById={storesById} onPress={jest.fn()} />);
    expect(screen.getByText(`MDD moins chère : ${MINUS}0,50${NNBSP}€`)).toBeTruthy();
  });
});

describe('MissingItems', () => {
  it('liste honnêtement les articles introuvables', async () => {
    await render(<MissingItems rows={missingRows(single, comparisons)} storesById={storesById} />);
    expect(screen.getByText('1 article introuvable')).toBeTruthy();
    expect(screen.getByText('Il n’est pas compté dans le total.')).toBeTruthy();
    expect(screen.getByText('Eau gazeuse')).toBeTruthy();
    expect(screen.getByText('Pas de prix connu dans nos enseignes : à acheter à part.')).toBeTruthy();
  });

  it('ne rend rien sans article manquant', async () => {
    const view = await render(<MissingItems rows={[]} storesById={storesById} />);
    expect(view.toJSON()).toBeNull();
  });
});

describe('OfferRow & ProductChoiceRow', () => {
  const first = comparisons[0];
  const rows = storeOfferRows(first, storesById, productsById, lineForItem(single, FIRST.id));
  /** Offre au prix relevé / estimé (provenance contrôlée, indépendante de l'import). */
  const observed = (o: StoreOffer): StoreOffer => ({
    ...o,
    priceSource: 'open_prices',
    priceUpdatedAt: '2026-11-05',
    observationCount: 3,
    estimateMethod: undefined,
  });
  const estimated = (o: StoreOffer): StoreOffer => ({
    ...o,
    priceSource: 'estimate',
    priceUpdatedAt: '2026-11-11',
    observationCount: undefined,
    estimateMethod: 'chain_index',
  });

  it('affiche l’offre, le prix au kilo et « meilleur prix »', async () => {
    await render(<OfferRow row={rows[0]} today={TODAY} />);
    expect(screen.getByText('Meilleur prix')).toBeTruthy();
    const name = storeDisplayName(rows[0].store, { short: true });
    expect(screen.getByLabelText(new RegExp(`^${name}, .*meilleur prix`))).toBeTruthy();
  });

  it('dit d’où vient le prix : relevé (date, nombre) ou estimé', async () => {
    const view = await render(<OfferRow row={{ ...rows[0], offer: observed(rows[0].offer) }} today={TODAY} testID="o" />);
    expect(screen.getByText('Relevé le 5 nov. · 3 relevés')).toBeTruthy();
    expect(screen.getByLabelText(/prix relevé en magasin le 5 novembre, 3 relevés/)).toBeTruthy();
    expect(screen.queryByText('Estimé')).toBeNull();
    await view.rerender(<OfferRow row={{ ...rows[0], offer: estimated(rows[0].offer) }} today={TODAY} testID="o" />);
    expect(screen.getByText('Estimé')).toBeTruthy();
    expect(screen.getByText('D’après les prix relevés ailleurs')).toBeTruthy();
    expect(screen.getByLabelText(/prix estimé, faute de relevé dans cette enseigne/)).toBeTruthy();
    expect(screen.queryByText(/^Relevé/)).toBeNull();
  });

  it('ouvre la fiche Open Food Facts d’un produit à code-barres, jamais pour le vrac', async () => {
    const product: Product = { ...(rows[0].product as Product), ean: '3017620422003', name: 'Produit test' };
    const onOpen = jest.fn();
    const view = await render(<OfferRow row={{ ...rows[0], product }} today={TODAY} onOpenProduct={onOpen} testID="o" />);
    await fireEvent.press(screen.getByRole('link', { name: 'Fiche Open Food Facts : Produit test' }));
    expect(onOpen).toHaveBeenCalledWith('https://world.openfoodfacts.org/product/3017620422003');
    // Vrac (sans code-barres) : pas de fiche.
    const loose: Product = { ...product, ean: undefined, offCategoryTag: 'en:tomatoes' };
    await view.rerender(<OfferRow row={{ ...rows[0], product: loose }} today={TODAY} onOpenProduct={onOpen} testID="o" />);
    expect(screen.queryByTestId('o-sheet')).toBeNull();
  });

  it('se coche comme un bouton radio', async () => {
    const [multi] = comparableItems(index, ingredients, { storeIds: ['leclerc'], count: 1, minStores: 1, choicesAt: 'leclerc', now: NOW });
    const offers = allOffersForItem(multi, index, NOW);
    const choices = productChoices(offers, 'leclerc', productsById, null);
    const onPress = jest.fn();
    const view = await render(<ProductChoiceRow choice={choices[0]} today={TODAY} onPress={onPress} testID="pc" />);
    expect(screen.getByRole('radio')).not.toBeChecked();
    expect(screen.getByText('Le moins cher')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio'));
    expect(onPress).toHaveBeenCalledTimes(1);
    await view.rerender(<ProductChoiceRow choice={{ ...choices[0], selected: true }} today={TODAY} onPress={onPress} testID="pc" />);
    expect(screen.getByRole('radio')).toBeChecked();
    // Prix estimé : badge et lecture.
    await view.rerender(<ProductChoiceRow choice={{ ...choices[0], offer: estimated(choices[0].offer) }} today={TODAY} onPress={onPress} testID="pc" />);
    expect(screen.getByText('Estimé')).toBeTruthy();
    expect(screen.getByRole('radio').props.accessibilityLabel).toMatch(/prix estimé/);
  });
});

describe('Provenance des choix : allergènes', () => {
  it('ne propose jamais un produit qui contient un allergène déclaré', () => {
    const [multi] = comparableItems(index, ingredients, { storeIds: ['leclerc'], count: 1, minStores: 1, choicesAt: 'leclerc', now: NOW });
    const offers = allOffersForItem(multi, index, NOW).filter((o) => o.storeId === 'leclerc');
    // Le 2e produit « contient » de l'arachide (catalogue de test, sans toucher aux données).
    const [, tainted] = Array.from(new Set(offers.map((o) => o.productId)));
    const byId = { ...productsById, [tainted]: { ...productsById[tainted], allergens: ['arachides' as const] } };
    const safe = productChoices(offers, 'leclerc', byId, null, ['arachides']);
    expect(safe.map((c) => c.productId)).not.toContain(tainted);
    expect(safe.length).toBeGreaterThanOrEqual(1);
    // Sans allergie déclarée, il reste proposé ; un produit inconnu n'est pas vérifiable : écarté.
    expect(productChoices(offers, 'leclerc', byId, null).map((c) => c.productId)).toContain(tainted);
    expect(productChoices([{ ...offers[0], productId: 'inconnu' }], 'leclerc', byId, null, ['arachides'])).toEqual([]);
  });
});

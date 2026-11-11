import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { BasketPlan, ItemComparison, Product, ShoppingListItem, Store } from '@/core';
import { allOffersForItem, buildCatalogIndex, compareList, MINUS, NNBSP, optimizeBasket } from '@/core';
import { ingredients, prices, products, stores } from '@/data';

import { BasketControls } from '../BasketControls';
import { BasketReceipt } from '../BasketReceipt';
import {
  basketScreenState,
  cheapestGainCents,
  comparedStoreIds,
  comparisonRows,
  emptyBasketReason,
  feesLabel,
  feesValue,
  lineForItem,
  mddSignal,
  missingRows,
  orderCtaLabel,
  packLabel,
  packsLabel,
  productTitle,
  receiptSummary,
  savingsLabel,
  storeShortName,
  visibleLines,
} from '../basketView';
import { ComparisonRow } from '../ComparisonRow';
import { needLabel, priceSpread, productChoices, selectionFor, storeOfferRows, storesWithoutItem } from '../comparatorView';
import { MissingItems, missingReason } from '../MissingItems';
import { OfferRow, ProductChoiceRow } from '../OfferRow';
import { StorePartCard } from '../StorePartCard';

// ─── Données : vrai catalogue de démo, date figée (promos déterministes) ────

const NOW = '2026-11-10T09:00:00.000Z';
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

const ITEMS: ShoppingListItem[] = [
  item('i-champi', 'champignons_paris', 'Champignons de Paris', 190),
  item('i-ail', 'ail', 'Ail', 60),
  item('i-carotte', 'carotte', 'Carotte', 600),
  item('i-gingembre', 'gingembre', 'Gingembre frais', 40),
  item('i-eau', undefined, 'Eau gazeuse', 1, { unit: 'piece', aisle: 'boissons' }),
];
const comparisons = compareList(ITEMS, index, NOW);
const single = optimizeBasket(comparisons, stores, 'single_store', { allowedStoreIds: MY_STORES, now: NOW });
const cheapest = optimizeBasket(comparisons, stores, 'cheapest', { allowedStoreIds: MY_STORES, now: NOW });

// ─── Libellés ────────────────────────────────────────────────────────────────

describe('libellés', () => {
  it('nomme les enseignes comme on les dit', () => {
    expect(storeShortName(storesById.leclerc)).toBe('Leclerc');
    expect(storeShortName(storesById.intermarche)).toBe('Intermarché');
    expect(storeShortName(null)).toBe('l’enseigne');
    expect(orderCtaLabel(storesById.carrefour)).toBe('Commander chez Carrefour');
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
    expect(rows.map((r) => r.itemId)).toEqual(['i-champi', 'i-ail', 'i-carotte', 'i-gingembre']);
    for (const r of rows) {
      const c = comparisons.find((x) => x.itemId === r.itemId) as ItemComparison;
      expect(r.best.totalCents).toBe(Math.min(...c.offers.map((o) => o.totalCents)));
      expect(r.stores).toBeGreaterThanOrEqual(3);
      expect(r.spreadCents).toBe(Math.max(...c.offers.map((o) => o.totalCents)) - r.best.totalCents);
      expect(r.inBasket).toBe(true);
    }
    expect(comparedStoreIds(comparisons)).toEqual(['auchan', 'carrefour', 'intermarche', 'leclerc', 'lidl']);
  });

  it('indique le prix payé dans le panier quand il n’est pas au meilleur prix', () => {
    for (const r of rows) {
      const line = lineForItem(single, r.itemId);
      if (!line) continue;
      if (line.storeId === r.bestStoreId && line.totalCents === r.best.totalCents) expect(r.basket).toBeNull();
      else expect(r.basket).toEqual({ storeId: line.storeId, totalCents: line.totalCents, extraCents: Math.max(0, line.totalCents - r.best.totalCents) });
    }
    expect(lineForItem(null, 'i-ail')).toBeNull();
    expect(lineForItem(single, 'i-eau')).toBeNull();
  });

  it('signale la MDD moins chère, retenue ou disponible', () => {
    const withAlt = comparisons.find((c) => !!c.cheaperAlternative) as ItemComparison;
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
    const plan: BasketPlan = { ...single, missingItemIds: ['i-champi'] };
    const [row] = missingRows(plan, comparisons);
    const best = comparisons[0].best as NonNullable<ItemComparison['best']>;
    expect(row).toEqual({ itemId: 'i-champi', label: 'Champignons de Paris', reason: 'elsewhere', elsewhere: { storeId: best.storeId, totalCents: best.totalCents } });
    expect(missingReason(row, storesById)).toMatch(/^Pas dans tes magasins\. Dispo chez /);
    expect(missingRows(null, comparisons)).toEqual([]);
  });
});

describe('emptyBasketReason', () => {
  it('distingue articles hors catalogue, pas de livraison et magasins qui ne les vendent pas', () => {
    // Articles saisis à la main (sans ingrédient) : aucune offre nulle part.
    const manual = compareList([item('m1', undefined, 'Lait', 1), item('m2', undefined, 'Lessive', 1)], index, NOW);
    expect(emptyBasketReason(manual, stores, { channel: 'drive', storeIds: ['leclerc'] })).toBe('not_in_catalog');
    // Même en livraison chez un magasin qui livre : pas « ne livre pas ».
    expect(emptyBasketReason(manual, stores, { channel: 'delivery', storeIds: ['carrefour'] })).toBe('not_in_catalog');
    // Leclerc et Lidl ne livrent pas.
    expect(emptyBasketReason(comparisons, stores, { channel: 'delivery', storeIds: ['leclerc', 'lidl'] })).toBe('no_delivery');
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
    const lines = [
      item('a', 'champignons_paris', 'Champignons', 190),
      item('b', 'gingembre', 'Gingembre', 40),
      item('c', 'escalope_dinde', 'Escalope', 400),
      item('d', 'creme_fraiche', 'Crème', 200, { unit: 'ml' }),
    ];
    const cmp = compareList(lines, index, NOW);
    const all = stores.map((s) => s.id);
    const one = optimizeBasket(cmp, stores, 'single_store', { allowedStoreIds: all, now: NOW });
    const two = optimizeBasket(cmp, stores, 'cheapest', { allowedStoreIds: all, now: NOW });
    expect(two.totalCents).toBeLessThan(one.totalCents);
    expect(cheapestGainCents(cmp, one, stores, { channel: 'drive', storeIds: all })).toBe(one.totalCents - two.totalCents);
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
  const champi = comparisons[0];
  const line = lineForItem(single, 'i-champi');

  it('liste une offre par enseigne, la meilleure et celle du panier', () => {
    const rows = storeOfferRows(champi, storesById, productsById, line);
    expect(rows).toHaveLength(champi.offers.length);
    expect(rows.filter((r) => r.isBest)).toHaveLength(1);
    expect(rows[0].isBest).toBe(true);
    expect(rows[0].extraCents).toBe(0);
    expect(rows.filter((r) => r.inBasket)).toHaveLength(1);
    expect(rows.every((r, i) => i === 0 || r.extraCents >= 0)).toBe(true);
    expect(priceSpread(champi)).toBe(rows[rows.length - 1].extraCents);
    expect(priceSpread({ ...champi, offers: champi.offers.slice(0, 1) })).toBe(0);
    expect(storesWithoutItem(champi, stores)).toEqual([]);
    expect(storesWithoutItem({ ...champi, offers: champi.offers.slice(0, 3) }, stores)).toHaveLength(2);
  });

  it('propose les produits du magasin du panier, du moins cher au plus cher', () => {
    const offers = allOffersForItem(ITEMS[0], index, NOW);
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
    expect(screen.getByLabelText(new RegExp(`^${s.parts[0].name}, 4 articles : \\d+ euros`))).toBeTruthy();
    expect(screen.getByLabelText('Économie, vs. le magasin le plus cher : moins 7 euros 14')).toBeTruthy();
    expect(screen.getByText(`${MINUS}7,14${NNBSP}€`)).toBeTruthy();
    expect(screen.getByTestId('r-total')).toHaveTextContent(new RegExp(`^${(plan.totalCents / 100).toFixed(2).replace('.', ',')}`));
    expect(screen.getByText(`4${NBSP}articles · 1${NBSP}introuvable`)).toBeTruthy();
    expect(screen.getByLabelText(/^Total : /)).toBeTruthy();
  });

  it('signale un recalcul sans masquer les chiffres', async () => {
    await render(<BasketReceipt summary={receiptSummary(single, storesById)} channel="drive" updating testID="r" />);
    expect(screen.getByText('Mise à jour…')).toBeTruthy();
    expect(screen.getByTestId('r')).toHaveProp('accessibilityState', { busy: true });
    expect(screen.getByTestId('r-total')).toBeTruthy();
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
  const part = single.parts[0];
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
    expect(screen.getByLabelText(new RegExp(`^${row.label}, meilleur prix .+ chez ${storeShortName(storesById[row.bestStoreId])}`))).toBeTruthy();
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
    expect(screen.getByText('Introuvable dans nos enseignes : à acheter à part.')).toBeTruthy();
  });

  it('ne rend rien sans article manquant', async () => {
    const view = await render(<MissingItems rows={[]} storesById={storesById} />);
    expect(view.toJSON()).toBeNull();
  });
});

describe('OfferRow & ProductChoiceRow', () => {
  const champi = comparisons[0];
  const rows = storeOfferRows(champi, storesById, productsById, lineForItem(single, 'i-champi'));

  it('affiche l’offre, le prix au kilo et « meilleur prix »', async () => {
    await render(<OfferRow row={rows[0]} testID="o" />);
    expect(screen.getByText('Meilleur prix')).toBeTruthy();
    expect(screen.getByTestId('o').props.accessibilityLabel).toMatch(/meilleur prix/);
  });

  it('se coche comme un bouton radio', async () => {
    const offers = allOffersForItem(ITEMS[0], index, NOW);
    const choices = productChoices(offers, 'leclerc', productsById, null);
    const onPress = jest.fn();
    const view = await render(<ProductChoiceRow choice={choices[0]} onPress={onPress} testID="pc" />);
    expect(screen.getByRole('radio')).not.toBeChecked();
    expect(screen.getByText('Le moins cher')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio'));
    expect(onPress).toHaveBeenCalledTimes(1);
    await view.rerender(<ProductChoiceRow choice={{ ...choices[0], selected: true }} onPress={onPress} testID="pc" />);
    expect(screen.getByRole('radio')).toBeChecked();
  });
});

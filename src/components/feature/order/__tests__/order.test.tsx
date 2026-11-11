import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { BasketStorePart, OrderHandoff, Product, ShoppingListItem, Store } from '@/core';
import { buildCatalogIndex, buildOrderHandoff, compareList, formatWeekRange, MINUS, NNBSP, optimizeBasket } from '@/core';
import { ingredients, prices, products, stores } from '@/data';

import { comparableItems } from '../../basket/__tests__/catalogPicks';

import { OrderActions } from '../OrderActions';
import { OrderConfirmedCard } from '../OrderConfirmedCard';
import { OrderHistoryRow } from '../OrderHistoryRow';
import { ORDER_COLLAPSED_LINES, OrderReceipt } from '../OrderReceipt';
import {
  historyOrder,
  ORDER_STATUS_LABELS,
  orderBudgetSentence,
  orderBudgetView,
  orderBudgetWeek,
  orderLineViews,
  orderMatchesPart,
  orderStage,
  orderTotals,
  orderWhenLabel,
  partSavingsCents,
} from '../orderView';

const NOW = '2026-11-10T09:00:00.000Z';
const index = buildCatalogIndex(products, prices, stores, ingredients);
const storesById = Object.fromEntries(stores.map((s) => [s.id, s])) as Record<string, Store>;
const productsById = Object.fromEntries(products.map((p) => [p.id, p])) as Record<string, Product>;

// Articles du catalogue réel chiffrés chez Carrefour (qui livre) : attendus dérivés des données.
const ITEMS: ShoppingListItem[] = comparableItems(index, ingredients, { storeIds: ['carrefour'], count: 8, minStores: 1, now: NOW });
const plan = optimizeBasket(compareList(ITEMS, index, NOW), stores, 'single_store', { allowedStoreIds: ['carrefour'], channel: 'delivery', now: NOW });
// Catalogue pas encore importé : panier vide (les tests qui en dépendent échouent seuls, pas la suite).
const part: BasketStorePart = plan.parts[0] ?? { storeId: 'carrefour', lines: [], subtotalCents: 0, feesCents: 0 };
const store = storesById[part.storeId];
const DELIVERY = storesById.carrefour.deliveryFeeCents as number;
const handoff = buildOrderHandoff(part, store, productsById, 'delivery', { id: 'order_1', now: NOW });

// ─── Logique ─────────────────────────────────────────────────────────────────

describe('orderView', () => {
  it('décrit chaque ligne : article, produit, marque, quantité', () => {
    const views = orderLineViews(part.lines, productsById);
    expect(views).toHaveLength(part.lines.length);
    const p = productsById[part.lines[0].productId];
    expect(views[0]).toMatchObject({ key: part.lines[0].itemId, label: part.lines[0].label, productName: p.name, brand: p.brand, totalCents: part.lines[0].totalCents });
    expect(orderLineViews([{ itemId: 'x', label: 'Mystère', productId: 'inconnu', packs: 2, totalCents: 100 }], productsById)[0]).toMatchObject({
      productName: null,
      brand: null,
      quantity: '2 ×',
    });
  });

  it('sépare sous-total et frais', () => {
    expect(part.feesCents).toBe(DELIVERY);
    expect(orderTotals(handoff.lines, handoff.totalCents)).toEqual({
      subtotalCents: part.subtotalCents,
      feesCents: DELIVERY,
      totalCents: part.subtotalCents + DELIVERY,
    });
  });

  it('signale les lignes au prix estimé', () => {
    const lines = [
      { itemId: 'a', label: 'A', productId: part.lines[0].productId, packs: 1, totalCents: 100, priceSource: 'estimate' as const },
      { itemId: 'b', label: 'B', productId: part.lines[0].productId, packs: 1, totalCents: 100, priceSource: 'open_prices' as const },
    ];
    expect(orderLineViews(lines, productsById).map((l) => l.isEstimate)).toEqual([true, false]);
  });

  it('reconnaît une commande qui colle encore au panier', () => {
    expect(orderMatchesPart(handoff, part, 'delivery')).toBe(true);
    expect(orderMatchesPart(handoff, part, 'drive')).toBe(false);
    expect(orderMatchesPart({ ...handoff, lines: handoff.lines.slice(1) }, part, 'delivery')).toBe(false);
    const changed = { ...part, lines: part.lines.map((l, i) => (i === 0 ? { ...l, packs: l.packs + 1 } : l)) };
    expect(orderMatchesPart(handoff, changed, 'delivery')).toBe(false);
  });

  it('déduit l’étape affichée', () => {
    expect(orderStage(null)).toBe('ready');
    expect(orderStage({ status: 'prepared' })).toBe('ready');
    expect(orderStage({ status: 'opened' })).toBe('opened');
    expect(orderStage({ status: 'confirmed' })).toBe('confirmed');
    expect(orderStage({ status: 'confirmed' }, true)).toBe('ready');
  });

  it('date la commande en relatif', () => {
    // Horodatages construits en heure locale : indépendants du fuseau de la machine.
    const at = (day: number, hour: number) => new Date(2026, 10, day, hour).toISOString();
    expect(orderWhenLabel({ status: 'confirmed', createdAt: at(9, 10), confirmedAt: at(10, 18) }, '2026-11-10')).toBe('Validée aujourd’hui');
    expect(orderWhenLabel({ status: 'prepared', createdAt: at(9, 10) }, '2026-11-10')).toBe('Préparée hier');
    expect(orderWhenLabel({ status: 'opened', createdAt: at(5, 10) }, '2026-11-10')).toBe(`${ORDER_STATUS_LABELS.opened} jeudi 5 novembre`);
  });

  it('compare le jour LOCAL de l’horodatage, pas son jour UTC', () => {
    // 0 h 30 heure locale le 12 nov. (à Paris, l'horodatage UTC est encore le 11).
    const afterMidnight = new Date(2026, 10, 12, 0, 30).toISOString();
    expect(orderWhenLabel({ status: 'confirmed', createdAt: afterMidnight, confirmedAt: afterMidnight }, '2026-11-12')).toBe('Validée aujourd’hui');
    // 21 h heure locale le 11 nov. (aux Antilles, l'horodatage UTC est déjà le 12).
    const evening = new Date(2026, 10, 11, 21, 0).toISOString();
    expect(orderWhenLabel({ status: 'prepared', createdAt: evening }, '2026-11-11')).toBe('Préparée aujourd’hui');
  });

  it('budget : semaine de la dépense (jour de validation), reste ou dépassement', () => {
    // Validée le samedi 14 nov. pour la semaine du 16 : la dépense compte dans la semaine du 9.
    const saturday = new Date(2026, 10, 14, 11, 0).toISOString();
    expect(orderBudgetWeek({ confirmedAt: saturday }, '2026-11-16')).toBe('2026-11-09');
    expect(orderBudgetWeek({}, '2026-11-16')).toBe('2026-11-16');
    expect(orderBudgetWeek(null, '2026-11-16')).toBe('2026-11-16');

    const within = orderBudgetView({ spentCents: 6240, remainingCents: 1760, over: false }, 8000, '2026-11-09', '2026-11-09');
    expect(within).toEqual({ remainingCents: 1760, overCents: 0, period: 'cette semaine' });
    expect(orderBudgetSentence(within)).toBe(`Il te reste 17,60${NNBSP}€ cette semaine.`);
    const over = orderBudgetView({ spentCents: 9500, remainingCents: 0, over: true }, 8000, '2026-11-09', '2026-11-09');
    expect(over).toMatchObject({ remainingCents: 0, overCents: 1500 });
    expect(orderBudgetSentence(over)).toBe(`Tu dépasses ton budget de 15,00${NNBSP}€ cette semaine.`);
    expect(orderBudgetView({ spentCents: 6240, remainingCents: 1760, over: false }, 8000, '2026-11-02', '2026-11-09')?.period).toBe(
      `sur la semaine du ${formatWeekRange('2026-11-02')}`,
    );
    expect(orderBudgetView({ spentCents: 6240, remainingCents: 0, over: true }, 0, '2026-11-09', '2026-11-09')).toBeNull();
    expect(orderBudgetSentence(null)).toBe('');
  });

  it('attribue au magasin sa part des économies', () => {
    expect(partSavingsCents({ savingsCents: 300, totalCents: 3000 }, { subtotalCents: 1400, feesCents: 100 })).toBe(150);
    expect(partSavingsCents(null, part)).toBe(0);
    expect(partSavingsCents({ savingsCents: 300, totalCents: 0 }, part)).toBe(0);
  });

  it('choisit la commande à rappeler dans l’historique', () => {
    type O = { id: string; status: OrderHandoff['status'] };
    const mine: O = { id: 'a', status: 'confirmed' };
    const other: O = { id: 'b', status: 'prepared' };
    expect(historyOrder(mine, mine, 'confirmed')).toBeNull();
    expect(historyOrder(mine, mine, 'ready')).toBe(mine);
    expect(historyOrder(other, mine, 'confirmed')).toBe(other);
    expect(historyOrder(null, null, 'ready')).toBeNull();
  });
});

// ─── Composants ──────────────────────────────────────────────────────────────

describe('OrderReceipt', () => {
  it('replie le ticket, le déplie, et affiche frais et total', async () => {
    const lines = orderLineViews(part.lines, productsById);
    expect(lines.length).toBeGreaterThan(ORDER_COLLAPSED_LINES);
    await render(
      <OrderReceipt
        lines={lines}
        subtotalCents={part.subtotalCents}
        feesCents={599}
        totalCents={part.subtotalCents + 599}
        savingsCents={120}
        channel="delivery"
        testID="rc"
      />,
    );
    expect(screen.getByText(`Ticket · Livraison · ${lines.length} articles`)).toBeTruthy();
    expect(screen.queryByTestId(`rc-line-${ORDER_COLLAPSED_LINES}`)).toBeNull();
    await fireEvent.press(screen.getByTestId('rc-toggle'));
    expect(screen.getByTestId(`rc-line-${lines.length - 1}`)).toBeTruthy();
    expect(screen.getByText('Frais de livraison')).toBeTruthy();
    expect(screen.getByText(`5,99${NNBSP}€`)).toBeTruthy();
    expect(screen.getByText(`${MINUS}1,20${NNBSP}€`)).toBeTruthy();
    expect(screen.getByLabelText(/^Total : /)).toBeTruthy();
  });

  it('courses en magasin : pas de ligne « Frais de retrait · Offerts »', async () => {
    const lines = orderLineViews(part.lines, productsById);
    const props = { lines, subtotalCents: part.subtotalCents, feesCents: 0, totalCents: part.subtotalCents, savingsCents: 0, channel: 'drive' as const };
    const view = await render(<OrderReceipt {...props} service="En magasin" inStoreOnly testID="rc" />);
    expect(screen.getByText(`Ticket · En magasin · ${lines.length} articles`)).toBeTruthy();
    expect(screen.queryByText('Frais de retrait')).toBeNull();
    await view.rerender(<OrderReceipt {...props} testID="rc" />);
    expect(screen.getByText('Frais de retrait')).toBeTruthy();
  });

  it('signale les prix estimés (ligne et sous-total)', async () => {
    const lines = orderLineViews(part.lines, productsById).map((l, i) => ({ ...l, isEstimate: i < 2 }));
    await render(<OrderReceipt lines={lines} subtotalCents={part.subtotalCents} feesCents={0} totalCents={part.subtotalCents} savingsCents={0} channel="drive" testID="rc" />);
    expect(screen.getByText('dont 2 prix estimés')).toBeTruthy();
    expect(screen.getByTestId('rc-line-0').props.accessibilityLabel).toMatch(/prix estimé/);
    expect(screen.getByTestId('rc-line-2').props.accessibilityLabel).not.toMatch(/prix estimé/);
  });
});

describe('OrderActions', () => {
  const handlers = () => ({ onCopy: jest.fn(), onOpen: jest.fn(), onPremium: jest.fn() });

  it('gratuit : 2 étapes (copier, ouvrir) et invitation Premium', async () => {
    const h = handlers();
    const view = await render(<OrderActions stage="ready" oneClick={false} storeName="Carrefour" copied={false} {...h} testID="a" />);
    expect(screen.getByText('Ta commande en 2 étapes')).toBeTruthy();
    expect(screen.getByText('Ouvre Carrefour')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Copier la liste' }));
    expect(h.onCopy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Avec Premium, un seul geste : ta liste est copiée et Carrefour s’ouvre.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Découvrir Premium' }));
    expect(h.onPremium).toHaveBeenCalledTimes(1);
    await view.rerender(<OrderActions stage="ready" oneClick={false} storeName="Carrefour" copied {...h} testID="a" />);
    expect(screen.getByRole('button', { name: 'Liste copiée, copier à nouveau' })).toBeTruthy();
  });

  it('enseigne sans commande en ligne : la liste part en magasin', async () => {
    const h = handlers();
    const view = await render(<OrderActions stage="ready" oneClick={false} storeName="Lidl" inStoreOnly copied={false} {...h} />);
    expect(screen.getByText('Tes courses en 2 étapes')).toBeTruthy();
    expect(screen.getByText('Direction Lidl')).toBeTruthy();
    expect(screen.queryByText('Ouvre Lidl')).toBeNull();
    await view.rerender(<OrderActions stage="opened" oneClick={false} storeName="Lidl" inStoreOnly copied={false} {...h} />);
    expect(screen.getByText('Tes courses sont faites ? Confirme ici : on les ajoute à ton budget.')).toBeTruthy();
  });

  it('Premium : commande en un clic, sans invitation', async () => {
    await render(<OrderActions stage="ready" oneClick storeName="Carrefour" copied={false} {...handlers()} />);
    expect(screen.getByText('Commande en un clic')).toBeTruthy();
    // La V1 copie la liste et ouvre le site : pas de « panier prêt » promis.
    expect(screen.getByText('En un geste, ta liste est copiée et Carrefour s’ouvre : colle-la dans la recherche du site, puis valide.')).toBeTruthy();
    expect(screen.queryByText(/panier est prêt/)).toBeNull();
    expect(screen.queryByText('Ta commande en 2 étapes')).toBeNull();
    expect(screen.queryByText('Découvrir Premium')).toBeNull();
  });

  it('au retour : rouvrir le site avant de confirmer', async () => {
    const h = handlers();
    await render(<OrderActions stage="opened" oneClick={false} storeName="Carrefour" copied={false} {...h} />);
    expect(screen.getByText('De retour de chez Carrefour ?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Rouvrir Carrefour' }));
    expect(h.onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('OrderConfirmedCard & OrderHistoryRow', () => {
  it('célèbre la commande, économies d’abord', async () => {
    await render(
      <OrderConfirmedCard
        storeName="Carrefour"
        totalCents={4642}
        savingsCents={301}
        budget={{ remainingCents: 7358, overCents: 0, period: 'cette semaine' }}
        when="Validée aujourd’hui"
        testID="ok"
      />,
    );
    expect(screen.getByText('Commande validée !')).toBeTruthy();
    expect(screen.getByTestId('ok-savings')).toHaveTextContent(`${MINUS}3,01${NNBSP}€`);
    expect(screen.getByText(/Il te reste 73,58/)).toBeTruthy();
    expect(screen.getByLabelText(/^Commande validée chez Carrefour\. 3 euros 1 économisés\./)).toBeTruthy();
    expect(screen.getByLabelText(/Il te reste 73 euros 58 cette semaine\.$/)).toBeTruthy();
  });

  it('budget dépassé : le dit, au lieu d’un reste à 0 €', async () => {
    await render(
      <OrderConfirmedCard
        storeName="Leclerc"
        totalCents={6240}
        savingsCents={0}
        budget={{ remainingCents: 0, overCents: 1500, period: 'cette semaine' }}
        when="Validée aujourd’hui"
      />,
    );
    expect(screen.getByText(/Tu dépasses ton budget de 15,00/)).toBeTruthy();
    expect(screen.queryByText(/Il te reste/)).toBeNull();
  });

  it('sans budget hebdo : pas de reste', async () => {
    await render(<OrderConfirmedCard storeName="Leclerc" totalCents={6240} savingsCents={0} budget={null} when="Validée aujourd’hui" />);
    expect(screen.getByText(/ajoutés à ton suivi du budget\.$/)).toBeTruthy();
  });

  it('rappelle la dernière commande de la semaine', async () => {
    const order: Pick<OrderHandoff, 'status' | 'totalCents' | 'channel' | 'lines'> = { ...handoff, status: 'confirmed' };
    await render(<OrderHistoryRow order={order} store={store} when="Validée hier" testID="h" />);
    expect(screen.getByText('Carrefour · Livraison')).toBeTruthy();
    // Enseigne sans commande en ligne : « En magasin ».
    await render(<OrderHistoryRow order={{ ...order, channel: 'drive' }} store={storesById.lidl} when="Validée hier" />);
    expect(screen.getByText('Lidl · En magasin')).toBeTruthy();
    expect(screen.getByText('Validée')).toBeTruthy();
    expect(screen.getByText(`Validée hier · ${part.lines.length} articles`)).toBeTruthy();
  });
});

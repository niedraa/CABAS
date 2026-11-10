import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { PantryItem, ShoppingListItem } from '@/core';
import { createManualItem } from '@/core';

import { AisleSection } from '../AisleSection';
import { ListActionsSheet } from '../ListActionsSheet';
import { ListDoneCard } from '../ListDoneCard';
import { ListItemRow } from '../ListItemRow';
import { ListItemSheet } from '../ListItemSheet';
import { ListProgressCard } from '../ListProgressCard';
import { QuantityField } from '../QuantityField';
import { QuickAddBar } from '../QuickAddBar';
import {
  applyFrozenOrder,
  countFr,
  itemA11yLabel,
  itemView,
  listPhase,
  orderSection,
  pantryHintFor,
  parseAmount,
  parseQuickAdd,
  progressSubtitle,
  quickAddPreview,
  recipeSources,
  remainingHeadline,
  sectionProgress,
  shareTitle,
} from '../listView';
import {
  dampenRowSwipe,
  ROW_SWIPE_MAX_THRESHOLD,
  ROW_SWIPE_MIN_THRESHOLD,
  rowSwipeProgress,
  rowSwipeThreshold,
  shouldRemoveOnRelease,
} from '../rowSwipe';

const item = (over: Partial<ShoppingListItem> = {}): ShoppingListItem => ({
  id: 'item_ail',
  ingredientId: 'ail',
  label: 'Ail',
  quantity: 5,
  unit: 'g',
  aisle: 'fruits_legumes',
  checked: false,
  source: 'plan',
  recipeIds: ['r1'],
  packaging: { packSize: 250, packs: 1, packUnit: 'g' },
  ...over,
});

const recipesById = { r1: { title: 'Poulet teriyaki' }, r2: { title: 'Dahl de lentilles' } };

// ─── Saisie rapide ───────────────────────────────────────────────────────────

describe('parseQuickAdd', () => {
  it('comprend une quantité devant ou derrière le libellé', () => {
    expect(parseQuickAdd('2 baguettes')).toEqual({ label: 'baguettes', quantity: 2, unit: 'piece' });
    expect(parseQuickAdd('500 g de farine')).toEqual({ label: 'farine', quantity: 500, unit: 'g' });
    expect(parseQuickAdd("25 cl d'huile")).toEqual({ label: 'huile', quantity: 250, unit: 'ml' });
    expect(parseQuickAdd('1,5l lait')).toEqual({ label: 'lait', quantity: 1500, unit: 'ml' });
    expect(parseQuickAdd('x6 œufs')).toEqual({ label: 'œufs', quantity: 6, unit: 'piece' });
    expect(parseQuickAdd('farine 1 kg')).toEqual({ label: 'farine', quantity: 1000, unit: 'g' });
    expect(parseQuickAdd('yaourts x4')).toEqual({ label: 'yaourts', quantity: 4, unit: 'piece' });
  });

  it('garde le texte tel quel sans quantité claire', () => {
    expect(parseQuickAdd('  sacs   poubelle ')).toEqual({ label: 'sacs poubelle' });
    expect(parseQuickAdd('2 laitues')).toEqual({ label: 'laitues', quantity: 2, unit: 'piece' });
    expect(parseQuickAdd('pack de 6')).toEqual({ label: 'pack de 6' });
    expect(parseQuickAdd('0 pomme')).toEqual({ label: '0 pomme' });
    expect(parseQuickAdd('   ')).toBeNull();
  });

  it('prévisualise le rayon deviné et la quantité', () => {
    expect(quickAddPreview(parseQuickAdd('2 baguettes'))).toEqual({ aisle: 'boulangerie', quantity: '× 2' });
    expect(quickAddPreview(parseQuickAdd('lessive'))).toEqual({ aisle: 'hygiene_maison', quantity: '' });
    expect(quickAddPreview(parseQuickAdd('1 kg de pommes'))).toEqual({ aisle: 'fruits_legumes', quantity: '1 kg' });
    expect(quickAddPreview(null)).toBeNull();
  });

  it('lit un nombre saisi au clavier', () => {
    expect(parseAmount('250')).toBe(250);
    expect(parseAmount('1,5')).toBe(1.5);
    expect(parseAmount(' 12 ')).toBe(12);
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('1,2,3')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });
});

// ─── Présentation d'un article ───────────────────────────────────────────────

describe('itemView', () => {
  it('donne quantité, conditionnement et recettes d’origine', () => {
    const v = itemView(item(), recipesById);
    expect(v).toMatchObject({ quantity: '5 g', buy: 'Prends 1 × 250 g', sources: 'Poulet teriyaki', sourcesA11y: 'Pour Poulet teriyaki', pantry: null });
    const two = itemView(item({ recipeIds: ['r1', 'r2', 'inconnue'] }), recipesById);
    expect(two.sources).toBe('Poulet teriyaki +1');
    expect(two.sourcesA11y).toBe('Pour Poulet teriyaki · Dahl de lentilles');
    expect(recipeSources([], recipesById)).toBeNull();
  });

  it('conseille un lot entier pour les articles à la pièce', () => {
    const eggs = item({ label: 'Œuf', quantity: 4, unit: 'piece', packaging: { packSize: 6, packs: 1, packUnit: 'piece' } });
    expect(itemView(eggs, {}).buy).toBe('Prends un lot de 6');
    expect(itemView({ ...eggs, quantity: 10, packaging: { packSize: 6, packs: 2, packUnit: 'piece' } }, {}).buy).toBe('Prends 2 lots de 6');
  });

  it('présente un ajout manuel', () => {
    const v = itemView(createManualItem('sacs poubelle'), recipesById);
    expect(v).toMatchObject({ quantity: '', buy: null, sources: 'Ajouté par toi' });
  });

  it('signale ce qui est déjà au placard', () => {
    expect(pantryHintFor(item({ note: 'Déjà 10 cl au placard' }))).toEqual({ label: 'Déjà 10 cl au placard', tone: 'success' });
    expect(pantryHintFor(item({ pantryStaple: true }))).toEqual({ label: 'Sûrement déjà chez toi', tone: 'neutral' });
    const pantry: PantryItem[] = [{ id: 'p1', label: 'Sacs Poubelle', quantity: 2, unit: 'piece', addedAt: '2026-11-01T10:00:00Z' }];
    expect(pantryHintFor(createManualItem('sacs poubelle'), pantry)).toEqual({ label: 'Déjà 2 au placard', tone: 'success' });
    expect(pantryHintFor(item(), pantry)).toBeNull();
  });

  it('compose une phrase claire pour le lecteur d’écran', () => {
    const it1 = item({ pantryStaple: true });
    expect(itemA11yLabel(it1, itemView(it1, recipesById))).toBe(
      'Ail, 5 g. Prends 1 × 250 g. Pour Poulet teriyaki. Sûrement déjà chez toi',
    );
    const it2 = item({ label: 'Oignon', quantity: 3, unit: 'piece', packaging: undefined, recipeIds: [] });
    expect(itemA11yLabel(it2, itemView(it2, {}))).toBe('Oignon, 3');
  });
});

// ─── Rayons & avancement ─────────────────────────────────────────────────────

describe('ordre et avancement', () => {
  const a = item({ id: 'a', label: 'Ail' });
  const b = item({ id: 'b', label: 'Brocoli', checked: true });
  const c = item({ id: 'c', label: 'Carotte' });

  it('met les cochés en bas, sauf un article encore « en transit »', () => {
    expect(orderSection([b, c, a]).map((i) => i.id)).toEqual(['a', 'c', 'b']);
    // « b » vient d'être coché : il garde sa place (rang « non coché ») le temps de l'animation.
    expect(orderSection([b, c, a], { b: false }).map((i) => i.id)).toEqual(['a', 'b', 'c']);
    const sections = [{ aisle: 'fruits_legumes' as const, items: [a, b, c] }];
    expect(applyFrozenOrder(sections, {})[0].items).toBe(sections[0].items);
    expect(applyFrozenOrder(sections, { b: false })[0].items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('résume l’avancement', () => {
    expect(sectionProgress([a, b])).toEqual({ done: 1, total: 2, complete: false });
    expect(sectionProgress([b])).toEqual({ done: 1, total: 1, complete: true });
    expect(sectionProgress([])).toEqual({ done: 0, total: 0, complete: false });
    expect(remainingHeadline(12)).toBe('Encore 12 articles');
    expect(remainingHeadline(1)).toBe('Plus qu’un article');
    expect(remainingHeadline(0)).toBe('Tout est dans le cabas');
    const sections = [
      { aisle: 'fruits_legumes' as const, items: [a, b] },
      { aisle: 'boucherie' as const, items: [item({ id: 'd', aisle: 'boucherie', checked: true })] },
    ];
    expect(progressSubtitle(sections)).toBe('Dernier rayon : Fruits & légumes');
    expect(progressSubtitle([...sections, { aisle: 'cremerie', items: [c] }])).toBe('2 rayons à faire');
    expect(progressSubtitle([{ aisle: 'boucherie', items: [a, c] }])).toBe('2 articles · 1 rayon');
    expect(progressSubtitle([{ aisle: 'boucherie', items: [b] }])).toBe('Tout est coché');
    expect(progressSubtitle([])).toBe('Ta liste est vide');
    expect(listPhase(0, 0)).toBe('empty');
    expect(listPhase(3, 1)).toBe('todo');
    expect(listPhase(3, 3)).toBe('complete');
    expect(countFr(1, 'reste')).toBe('1 reste');
    expect(countFr(4, 'reste')).toBe('4 restes');
    expect(shareTitle('9 – 15 nov.')).toBe('Ma liste Cabas · 9 – 15 nov.');
  });
});

// ─── Glisser pour retirer ────────────────────────────────────────────────────

describe('rowSwipe', () => {
  it('borne le seuil et calcule l’avancement', () => {
    expect(rowSwipeThreshold(0)).toBe(ROW_SWIPE_MIN_THRESHOLD);
    expect(rowSwipeThreshold(NaN)).toBe(ROW_SWIPE_MIN_THRESHOLD);
    expect(rowSwipeThreshold(350)).toBeCloseTo(112);
    expect(rowSwipeThreshold(2000)).toBe(ROW_SWIPE_MAX_THRESHOLD);
    expect(rowSwipeProgress(-56, 350)).toBeCloseTo(0.5);
    expect(rowSwipeProgress(-500, 350)).toBe(1);
    expect(rowSwipeProgress(30, 350)).toBe(0);
  });

  it('retire vers la gauche au-delà du seuil ou sur un coup sec', () => {
    expect(shouldRemoveOnRelease(-120, 0, 350)).toBe(true);
    expect(shouldRemoveOnRelease(-80, 0, 350)).toBe(false);
    expect(shouldRemoveOnRelease(-60, -1500, 350)).toBe(true);
    expect(shouldRemoveOnRelease(-30, -1500, 350)).toBe(false);
    expect(shouldRemoveOnRelease(200, 2000, 350)).toBe(false);
  });

  it('bloque vers la droite et freine au-delà de la largeur', () => {
    expect(dampenRowSwipe(80, 350)).toBe(0);
    expect(dampenRowSwipe(-100, 350)).toBe(-100);
    const far = dampenRowSwipe(-600, 350);
    expect(far).toBeLessThan(-350);
    expect(far).toBeGreaterThan(-600);
    expect(dampenRowSwipe(NaN, 350)).toBe(0);
  });
});

// ─── Composants ──────────────────────────────────────────────────────────────

const wrapper = GestureHandlerRootView;

describe('ListItemRow', () => {
  const handlers = () => ({ onToggle: jest.fn(), onEdit: jest.fn(), onRemove: jest.fn() });

  it('affiche libellé, quantité, conditionnement, recette et indice placard', async () => {
    const it1 = item({ note: 'Déjà 10 cl au placard' });
    await render(<ListItemRow item={it1} view={itemView(it1, recipesById)} testID="row" {...handlers()} />, { wrapper });
    expect(screen.getByText('Ail')).toBeTruthy();
    expect(screen.getByText('5 g')).toBeTruthy();
    expect(screen.getByText('Prends 1 × 250 g · Poulet teriyaki')).toBeTruthy();
    expect(screen.getByText('Déjà 10 cl au placard')).toBeTruthy();
  });

  it('coche au toucher, s’édite et se retire (actions accessibles)', async () => {
    const h = handlers();
    const it1 = item();
    const { rerender } = await render(<ListItemRow item={it1} view={itemView(it1, recipesById)} testID="row" {...h} />, { wrapper });
    const box = screen.getByRole('checkbox', { name: /^Ail, 5 g/ });
    expect(box).not.toBeChecked();
    await fireEvent.press(box);
    expect(h.onToggle).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Modifier : Ail' }));
    expect(h.onEdit).toHaveBeenCalledTimes(1);
    await fireEvent(box, 'accessibilityAction', { nativeEvent: { actionName: 'remove' } });
    expect(h.onRemove).toHaveBeenCalledTimes(1);
    await fireEvent(box, 'accessibilityAction', { nativeEvent: { actionName: 'edit' } });
    expect(h.onEdit).toHaveBeenCalledTimes(2);
    const done = item({ checked: true });
    await rerender(<ListItemRow item={done} view={itemView(done, recipesById)} testID="row" {...h} />);
    expect(screen.getByRole('checkbox', { name: /^Ail/ })).toBeChecked();
  });
});

describe('AisleSection', () => {
  it('montre le rayon, l’avancement, puis « Fait »', async () => {
    const render1 = (items: ShoppingListItem[]) => (
      <AisleSection aisle="fruits_legumes" items={items} renderItem={(i) => <React.Fragment key={i.id} />} testID="aisle" />
    );
    const { rerender } = await render(render1([item({ id: 'a' }), item({ id: 'b', checked: true })]));
    expect(screen.getByText('Fruits & légumes')).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Fruits & légumes, 1 sur 2 cochés' })).toBeTruthy();
    await rerender(render1([item({ id: 'a', checked: true })]));
    expect(screen.getByText('Fait')).toBeTruthy();
  });
});

describe('QuickAddBar', () => {
  it('prévisualise puis ajoute l’article interprété, et vide le champ', async () => {
    const onAdd = jest.fn();
    await render(<QuickAddBar onAdd={onAdd} testID="add" />);
    const input = screen.getByTestId('add-input');
    await fireEvent.changeText(input, '2 baguettes');
    expect(screen.getByText('Boulangerie · × 2')).toBeTruthy();
    await fireEvent(input, 'submitEditing');
    expect(onAdd).toHaveBeenCalledWith({ label: 'baguettes', quantity: 2, unit: 'piece' });
    expect(input.props.value).toBe('');
    // Champ vide : rien n'est ajouté.
    await fireEvent.press(screen.getByTestId('add-submit'));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

describe('ListProgressCard & ListDoneCard', () => {
  it('affiche ce qui reste et mène aux prix et au placard', async () => {
    const onComparePrices = jest.fn();
    const onOpenPantry = jest.fn();
    await render(
      <ListProgressCard done={5} total={17} subtitle="5 sur 17 cochés" onComparePrices={onComparePrices} onOpenPantry={onOpenPantry} testID="p" />,
    );
    expect(screen.getByText('Encore 12 articles')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: '5 articles cochés sur 17' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Comparer les prix' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Ouvrir mon placard' }));
    expect(onComparePrices).toHaveBeenCalledTimes(1);
    expect(onOpenPantry).toHaveBeenCalledTimes(1);
  });

  it('propose de ranger le surplus, puis d’aller au placard', async () => {
    const h = { onStoreLeftovers: jest.fn(), onOpenPantry: jest.fn(), onClearChecked: jest.fn() };
    const { rerender } = await render(<ListDoneCard total={12} celebrateKey={0} stored={false} testID="d" {...h} />);
    expect(screen.getByText('Tout est dans le cabas !')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Ranger le reste au placard' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Vider les articles cochés' }));
    expect(h.onStoreLeftovers).toHaveBeenCalledTimes(1);
    expect(h.onClearChecked).toHaveBeenCalledTimes(1);
    await rerender(<ListDoneCard total={12} celebrateKey={1} stored testID="d" {...h} />);
    expect(screen.getByText('Surplus rangé au placard')).toBeTruthy();
    expect(screen.getByRole('image', { name: 'Bravo, tout est coché' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Voir mon placard' }));
    expect(h.onOpenPantry).toHaveBeenCalledTimes(1);
  });
});

describe('ListItemSheet', () => {
  it('enregistre libellé, quantité et rayon modifiés', async () => {
    const onSave = jest.fn();
    const manual = createManualItem('farine', { id: 'm1', quantity: 500, unit: 'g' });
    await render(<ListItemSheet visible item={manual} onClose={jest.fn()} onSave={onSave} onRemove={jest.fn()} />);
    expect(screen.getByText('Ajouté par toi')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('list-item-label'), 'Farine T65 ');
    await fireEvent.changeText(screen.getByTestId('list-item-quantity-input'), '1,5');
    await fireEvent.press(screen.getByTestId('list-item-aisle-epicerie_salee'));
    await fireEvent.press(screen.getByTestId('list-item-save'));
    expect(onSave).toHaveBeenCalledWith({ label: 'Farine T65', quantity: 1.5, aisle: 'epicerie_salee' });
  });

  it('retire l’article et rappelle d’où il vient', async () => {
    const onRemove = jest.fn();
    await render(<ListItemSheet visible item={item()} recipesById={recipesById} onClose={jest.fn()} onSave={jest.fn()} onRemove={onRemove} />);
    expect(screen.getByText('Pour Poulet teriyaki')).toBeTruthy();
    expect(screen.getByText('Article de ton menu : Cabas le recalcule si tes repas changent.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('list-item-remove'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});

describe('ListActionsSheet', () => {
  const props = {
    visible: true,
    onClose: jest.fn(),
    totalCount: 4,
    onShare: jest.fn(),
    onCopy: jest.fn(),
    onUncheckAll: jest.fn(),
    onClearChecked: jest.fn(),
    onOpenPantry: jest.fn(),
  };

  it('ne propose « décocher / vider » que s’il y a des articles cochés', async () => {
    const { rerender } = await render(<ListActionsSheet {...props} checkedCount={0} />);
    expect(screen.getByText('4 articles · rien de coché')).toBeTruthy();
    expect(screen.queryByText('Tout décocher')).toBeNull();
    await fireEvent.press(screen.getByTestId('list-actions-copy'));
    expect(props.onCopy).toHaveBeenCalledTimes(1);
    await rerender(<ListActionsSheet {...props} checkedCount={2} />);
    await fireEvent.press(screen.getByTestId('list-actions-uncheck'));
    await fireEvent.press(screen.getByTestId('list-actions-clear'));
    expect(screen.getByText('2 articles quittent la liste.')).toBeTruthy();
    expect(props.onUncheckAll).toHaveBeenCalledTimes(1);
    expect(props.onClearChecked).toHaveBeenCalledTimes(1);
  });
});

describe('QuantityField', () => {
  it('pièces au sélecteur, grammes au clavier, unité au choix', async () => {
    const onChange = jest.fn();
    const onUnitChange = jest.fn();
    const { rerender } = await render(
      <QuantityField value={2} unit="piece" onChange={onChange} units={['piece', 'g', 'ml']} onUnitChange={onUnitChange} testID="q" />,
    );
    expect(screen.getByRole('adjustable', { name: 'Quantité' })).toBeTruthy();
    await fireEvent.press(screen.getByTestId('q-unit-g'));
    expect(onUnitChange).toHaveBeenCalledWith('g');
    await rerender(<QuantityField value={250} unit="g" onChange={onChange} testID="q" />);
    await fireEvent.changeText(screen.getByTestId('q-input'), 'abc');
    expect(screen.getByText('Indique un nombre, par exemple 250.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('q-input'), '300');
    expect(onChange).toHaveBeenLastCalledWith(300);
  });
});

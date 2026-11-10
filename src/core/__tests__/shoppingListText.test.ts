/// <reference types="jest" />
import {
  createManualItem,
  formatItemQuantity,
  formatListItemLine,
  formatPackaging,
  formatShoppingListAsText,
} from '../shoppingList';
import type { ShoppingListItem } from '../types';

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
  ...over,
});

describe('formatItemQuantity', () => {
  it('formate masses, volumes et pièces en français', () => {
    expect(formatItemQuantity(item())).toBe('5 g');
    expect(formatItemQuantity(item({ quantity: 1500 }))).toBe('1,5 kg');
    expect(formatItemQuantity(item({ quantity: 750, unit: 'ml' }))).toBe('75 cl');
    expect(formatItemQuantity(item({ quantity: 3, unit: 'piece' }))).toBe('× 3');
    expect(formatItemQuantity(item({ quantity: 0.5, unit: 'piece' }))).toBe('× ½');
  });

  it('n’affiche rien pour un article manuel à l’unité ou une quantité illisible', () => {
    expect(formatItemQuantity(createManualItem('sacs poubelle'))).toBe('');
    expect(formatItemQuantity(createManualItem('baguette', { quantity: 2 }))).toBe('× 2');
    expect(formatItemQuantity(item({ quantity: NaN, unit: 'piece' }))).toBe('');
    expect(formatItemQuantity(item({ quantity: -4 }))).toBe('0 g');
  });
});

describe('formatPackaging', () => {
  it('décrit le conditionnement réel à acheter', () => {
    expect(formatPackaging(item({ packaging: { packSize: 250, packs: 1, packUnit: 'g' } }))).toBe('1 × 250 g');
    expect(formatPackaging(item({ quantity: 450, packaging: { packSize: 300, packs: 2, packUnit: 'g' } }))).toBe('2 × 300 g');
    expect(formatPackaging(item({ quantity: 23, unit: 'ml', packaging: { packSize: 1000, packs: 1, packUnit: 'ml' } }))).toBe(
      '1 × 1 l',
    );
    expect(formatPackaging(item({ quantity: 4, unit: 'piece', packaging: { packSize: 6, packs: 1, packUnit: 'piece' } }))).toBe(
      'lot de 6',
    );
    expect(formatPackaging(item({ quantity: 10, unit: 'piece', packaging: { packSize: 6, packs: 2, packUnit: 'piece' } }))).toBe(
      '2 lots de 6',
    );
  });

  it('se tait quand le paquet correspond au besoin, ou sans conditionnement', () => {
    expect(formatPackaging(item())).toBeNull();
    expect(formatPackaging(item({ quantity: 500, packaging: { packSize: 500, packs: 1, packUnit: 'g' } }))).toBeNull();
    expect(formatPackaging(item({ packaging: { packSize: 0, packs: 1, packUnit: 'g' } }))).toBeNull();
    expect(formatPackaging(item({ packaging: { packSize: 250, packs: 0, packUnit: 'g' } }))).toBeNull();
  });
});

describe('formatListItemLine', () => {
  it('assemble libellé, quantité et conditionnement', () => {
    expect(formatListItemLine(item({ packaging: { packSize: 250, packs: 1, packUnit: 'g' } }))).toBe('Ail — 5 g (1 × 250 g)');
    expect(formatListItemLine(item({ label: 'Oignon', quantity: 3, unit: 'piece' }))).toBe('Oignon × 3');
    expect(formatListItemLine(createManualItem('sacs poubelle'))).toBe('Sacs poubelle');
  });
});

describe('formatShoppingListAsText', () => {
  const items: ShoppingListItem[] = [
    item({ id: 'a', label: 'Lardons', quantity: 150, aisle: 'boucherie' }),
    item({ id: 'b', label: 'Brocoli', quantity: 400, checked: true }),
    item({ id: 'c', label: 'Ail', packaging: { packSize: 250, packs: 1, packUnit: 'g' } }),
    createManualItem('sacs poubelle', { id: 'd' }),
  ];

  it('liste ce qui reste à acheter, rayon par rayon dans l’ordre de parcours', () => {
    expect(formatShoppingListAsText(items, { title: 'Ma liste Cabas' })).toBe(
      [
        'Ma liste Cabas',
        '',
        'Fruits & légumes',
        '• Ail — 5 g (1 × 250 g)',
        '',
        'Boucherie',
        '• Lardons — 150 g',
        '',
        'Hygiène & maison',
        '• Sacs poubelle',
      ].join('\n'),
    );
  });

  it('peut inclure les articles cochés (marqués ✓, après les autres)', () => {
    const text = formatShoppingListAsText(items, { includeChecked: true });
    expect(text.split('\n')[0]).toBe('Ma liste de courses');
    expect(text).toContain('• Ail — 5 g (1 × 250 g)\n✓ Brocoli — 400 g');
  });

  it('reste aimable quand il n’y a rien à acheter', () => {
    expect(formatShoppingListAsText([])).toBe('Ma liste de courses\n\nRien à acheter pour l’instant.');
    expect(formatShoppingListAsText([item({ checked: true })])).toBe('Ma liste de courses\n\nTout est déjà dans le cabas !');
  });
});

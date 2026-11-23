import type { ShoppingListItem } from '@/core';

import { itemQuantityLabel, itemSubtitle, listAsText, packagingLabel } from '../listFormat';

const item = (o: Partial<ShoppingListItem>): ShoppingListItem => ({
  id: 'i',
  label: 'Riz',
  quantity: 300,
  unit: 'g',
  aisle: 'epicerie_salee',
  checked: false,
  source: 'plan',
  recipeIds: [],
  ...o,
});

describe('listFormat', () => {
  it('formate quantités et conditionnements', () => {
    expect(itemQuantityLabel(item({}))).toBe('300 g');
    expect(packagingLabel(item({ packaging: { packs: 2, packSize: 500, packUnit: 'g' } }))).toBe('2 × 500 g');
    expect(packagingLabel(item({}))).toBeNull();
    expect(itemQuantityLabel(item({ quantity: 3, unit: 'piece' }))).toBe('3 pièces');
    expect(itemQuantityLabel(item({ quantity: 1, unit: 'piece' }))).toBe('1 pièce');
    // À la pièce : le conditionnement « 1 × 1 » n'apporte rien.
    expect(packagingLabel(item({ quantity: 2, unit: 'piece', packaging: { packs: 2, packSize: 1, packUnit: 'piece' } }))).toBeNull();
    expect(packagingLabel(item({ quantity: 15, unit: 'piece', packaging: { packs: 3, packSize: 6, packUnit: 'piece' } }))).toBe('3 paquets de 6');
    expect(itemSubtitle(item({ packaging: { packs: 1, packSize: 1000, packUnit: 'g' } }))).toBe('300 g · à acheter : 1 × 1 kg');
  });

  it('un article manuel « 1 » n’affiche pas de quantité', () => {
    expect(itemSubtitle(item({ source: 'manual', quantity: 1, unit: 'piece', label: 'Sacs poubelle' }))).toBe('');
  });

  it('produit un texte rangé par rayon, sans les articles cochés', () => {
    const text = listAsText(
      [
        item({ id: 'a', label: 'Riz' }),
        item({ id: 'b', label: 'Tomates', aisle: 'fruits_legumes', quantity: 4, unit: 'piece' }),
        item({ id: 'c', label: 'Lait', aisle: 'cremerie', checked: true }),
      ],
      { title: 'Ma liste' },
    );
    expect(text.split('\n')[0]).toBe('Ma liste');
    expect(text).toContain('Fruits & légumes');
    expect(text.indexOf('Tomates')).toBeLessThan(text.indexOf('Riz'));
    expect(text).not.toContain('Lait');
  });

  it('liste vide : message rassurant', () => {
    expect(listAsText([])).toContain('Rien à acheter');
  });
});

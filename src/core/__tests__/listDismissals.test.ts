import type { ShoppingListItem } from '../types';
import { dismissalKey, forgetDismissals, recordDismissals, withoutDismissed } from '../shoppingList';

function item(partial: Partial<ShoppingListItem> & Pick<ShoppingListItem, 'id'>): ShoppingListItem {
  return {
    label: partial.id,
    quantity: 100,
    unit: 'g',
    aisle: 'epicerie_salee',
    checked: false,
    source: 'plan',
    recipeIds: [],
    ...partial,
  };
}

describe('articles du menu retirés', () => {
  const riz = item({ id: 'li_riz', ingredientId: 'riz_basmati', quantity: 300 });
  const ail = item({ id: 'li_ail', ingredientId: 'ail', quantity: 5 });
  const sacs = item({ id: 'li_sacs', source: 'manual', unit: 'piece', quantity: 1 });

  it('clé : ingrédient + unité, sinon id', () => {
    expect(dismissalKey(riz)).toBe('riz_basmati|g');
    expect(dismissalKey(item({ id: 'x', unit: 'piece' }))).toBe('id:x');
  });

  it('mémorise seulement les articles du menu, en gardant la plus grande quantité', () => {
    let d = recordDismissals({}, [riz, sacs]);
    expect(d).toEqual({ 'riz_basmati|g': 300 });
    d = recordDismissals(d, [{ ...riz, quantity: 200 }]);
    expect(d['riz_basmati|g']).toBe(300);
  });

  it('une liste régénérée ne fait pas revenir un article retiré', () => {
    const d = recordDismissals({}, [riz]);
    expect(withoutDismissed([riz, ail, sacs], d).map((i) => i.id)).toEqual(['li_ail', 'li_sacs']);
  });

  it('l’article revient si le planning en demande davantage', () => {
    const d = recordDismissals({}, [riz]);
    expect(withoutDismissed([{ ...riz, quantity: 450 }], d)).toHaveLength(1);
    expect(withoutDismissed([{ ...riz, quantity: 300 }], d)).toHaveLength(0);
  });

  it('une autre unité du même ingrédient n’est pas concernée', () => {
    const d = recordDismissals({}, [riz]);
    expect(withoutDismissed([{ ...riz, unit: 'piece', quantity: 1 }], d)).toHaveLength(1);
  });

  it('annuler oublie le retrait', () => {
    const d = forgetDismissals(recordDismissals({}, [riz, ail]), [riz]);
    expect(d).toEqual({ 'ail|g': 5 });
    expect(withoutDismissed([riz], d)).toHaveLength(1);
  });
});

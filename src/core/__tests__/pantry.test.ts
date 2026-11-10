/// <reference types="jest" />
import { INGREDIENTS_BY_ID as I, RECIPES, makeProfile } from './fixtures';
import {
  consumePantry,
  createPantryItem,
  expiringSoon,
  pantryItemsFromShopping,
  recipesUsingLeftovers,
  subtractPantry,
} from '../pantry';
import { createManualItem } from '../shoppingList';
import type { PantryItem, ShoppingListItem } from '../types';

const NOW = '2026-09-14T09:00:00.000Z';

function pantry(id: string, ingredientId: string | undefined, quantity: number, unit: PantryItem['unit'], expiresAt?: string): PantryItem {
  return createPantryItem(ingredientId ?? id, quantity, unit, { id, ingredientId, expiresAt, now: NOW });
}

const item = (o: Partial<ShoppingListItem>): ShoppingListItem => ({
  id: 'item_x',
  label: 'X',
  quantity: 100,
  unit: 'g',
  aisle: 'autre',
  checked: false,
  source: 'plan',
  recipeIds: [],
  ...o,
});

describe('subtractPantry', () => {
  it('retire, réduit ou laisse les articles', () => {
    const items = [
      item({ id: 'item_riz', ingredientId: 'riz', label: 'Riz', quantity: 300 }),
      item({ id: 'item_tomate', ingredientId: 'tomate', label: 'Tomate', quantity: 500, packaging: { packSize: 1000, packUnit: 'g', packs: 1 } }),
      item({ id: 'item_oignon', ingredientId: 'oignon', label: 'Oignon', quantity: 3, unit: 'piece' }),
      createManualItem('Sacs poubelle', { id: 'manual_sacs' }),
      createManualItem('Lessive', { id: 'manual_lessive' }),
    ];
    const res = subtractPantry(
      items,
      [
        pantry('p1', 'riz', 500, 'g'),
        pantry('p2', 'tomate', 1, 'piece'), // 120 g
        pantry('p3', 'tomate', 100, 'g'),
        pantry('p4', 'oignon', 0, 'piece'),
        pantry('p5', 'oignon', 1, 'ml'), // 1 ml ≈ 1 g ≈ 0,009 oignon : reste 2,99 → 3
        createPantryItem('sacs poubelle', 1, 'piece', { id: 'p6', now: NOW }),
      ],
      I,
    );
    expect(res.find((i) => i.id === 'item_riz')).toBeUndefined();
    const tomate = res.find((i) => i.id === 'item_tomate');
    expect(tomate).toMatchObject({ quantity: 280, note: 'Déjà 220 g au placard' });
    expect(tomate?.packaging).toBeUndefined();
    expect(res.find((i) => i.id === 'item_oignon')?.quantity).toBe(3); // 2,99 → 3
    expect(res.find((i) => i.id === 'manual_sacs')).toBeUndefined();
    expect(res.find((i) => i.id === 'manual_lessive')).toBeDefined();
  });

  it('sans correspondance : articles inchangés (même référence)', () => {
    const items = [item({ ingredientId: 'riz' })];
    expect(subtractPantry(items, [pantry('p', 'pates', 100, 'g')], I)[0]).toBe(items[0]);
    // unité inconvertible (pièces sans poids connu)
    expect(subtractPantry(items, [pantry('p', 'riz', 2, 'piece')], I)[0]).toBe(items[0]);
  });
});

describe('expiringSoon', () => {
  it('liste ce qui périme sous 3 jours (et le déjà périmé), trié', () => {
    const list = [
      pantry('a', 'riz', 1, 'g', '2026-09-20'),
      pantry('b', 'tomate', 1, 'g', '2026-09-16'),
      pantry('c', 'lait', 1, 'ml', '2026-09-12'),
      pantry('d', 'pates', 1, 'g'),
      pantry('e', 'oeuf', 1, 'piece', '2026-09-17T10:00:00Z'),
      pantry('f', 'oignon', 1, 'piece', '2026-09-16'),
    ];
    expect(expiringSoon(list, NOW).map((p) => p.id)).toEqual(['c', 'f', 'b', 'e']);
    expect(expiringSoon(list, NOW, 0).map((p) => p.id)).toEqual(['c']);
    expect(expiringSoon(list, NOW, 10).map((p) => p.id)).toEqual(['c', 'f', 'b', 'e', 'a']);
  });
});

describe('recipesUsingLeftovers', () => {
  it('recettes sûres qui écoulent les restes, péremption proche d’abord', () => {
    const stock = [
      pantry('l', 'lait_coco', 400, 'ml', '2026-09-15'),
      pantry('c', 'carotte', 500, 'g', '2026-09-20'),
      pantry('c2', 'carotte', 200, 'g', '2026-09-18'),
      pantry('r', 'riz', 1000, 'g'),
      pantry('s', 'sel', 500, 'g'),
      pantry('z', undefined, 1, 'piece'),
      pantry('v', 'oignon', 0, 'piece'),
    ];
    const res = recipesUsingLeftovers(RECIPES, stock, I, makeProfile({ allergens: ['soja'] }));
    expect(res.length).toBeGreaterThan(0);
    // lait de coco (15/09) d'abord
    const firstIds = res.slice(0, 3).map((r) => r.recipe.id);
    expect(firstIds.every((id) => ['poulet_curry', 'dahl', 'pois_chiches_curry'].includes(id))).toBe(true);
    for (const s of res) {
      expect(s.matchedIngredientIds.length).toBeGreaterThan(0);
      expect(s.coverage).toBeGreaterThan(0);
      expect(s.coverage).toBeLessThanOrEqual(1);
      expect(s.recipe.id).not.toBe('tofu_sesame'); // soja
      expect(s.recipe.id).not.toBe('crevettes_sautees'); // sauce soja
      expect(s.matchedIngredientIds).not.toContain('sel'); // placard de base ignoré
      expect(s.matchedIngredientIds).not.toContain('oignon'); // quantité nulle
    }
    // à péremption égale : couverture décroissante
    const carrotGroup = res.filter((s) => !s.matchedIngredientIds.includes('lait_coco') && s.matchedIngredientIds.includes('carotte'));
    for (let i = 1; i < carrotGroup.length; i++) expect(carrotGroup[i - 1].coverage).toBeGreaterThanOrEqual(carrotGroup[i].coverage);
    // sans date : en dernier
    const last = res[res.length - 1];
    expect(last.matchedIngredientIds).toEqual(['riz']);
    expect(recipesUsingLeftovers(RECIPES, stock, I, makeProfile(), 2)).toHaveLength(2);
  });

  it('exclut ingrédients détestés, ustensiles manquants, et placard vide', () => {
    const stock = [pantry('p', 'pomme_de_terre', 1000, 'g')];
    expect(recipesUsingLeftovers(RECIPES, stock, I, makeProfile()).map((s) => s.recipe.id).sort()).toEqual([
      'gratin_dauphinois',
      'soupe_carottes',
    ]);
    expect(recipesUsingLeftovers(RECIPES, stock, I, makeProfile({ equipment: ['plaques'] }))).toEqual([]);
    expect(recipesUsingLeftovers(RECIPES, stock, I, makeProfile({ dislikedIngredientIds: ['ail', 'oignon'] }))).toEqual([]);
    expect(recipesUsingLeftovers(RECIPES, [], I, makeProfile())).toEqual([]);
  });
});

describe('helpers placard', () => {
  it('createPantryItem', () => {
    const p = createPantryItem('  riz basmati ', -3, 'g');
    expect(p).toMatchObject({ label: 'Riz basmati', quantity: 0, unit: 'g' });
    expect(p.id).toMatch(/^pantry_/);
    expect(p.ingredientId).toBeUndefined();
    expect(p.expiresAt).toBeUndefined();
    expect(Number.isNaN(Date.parse(p.addedAt))).toBe(false);
  });

  it('pantryItemsFromShopping : le surplus des paquets rejoint le placard', () => {
    const items = [
      item({ id: 'item_riz', ingredientId: 'riz', label: 'Riz', quantity: 300, checked: true, packaging: { packSize: 1000, packUnit: 'g', packs: 1 } }),
      item({ id: 'item_pates', ingredientId: 'pates', label: 'Pâtes', quantity: 500, checked: true, packaging: { packSize: 500, packUnit: 'g', packs: 1 } }),
      item({ id: 'item_tomate', ingredientId: 'tomate', quantity: 300, checked: true }),
      item({ id: 'item_lait', ingredientId: 'lait', checked: false, packaging: { packSize: 1000, packUnit: 'ml', packs: 1 } }),
      { ...createManualItem('Sel'), checked: true },
    ];
    const res = pantryItemsFromShopping(items, NOW);
    expect(res).toEqual([
      { id: 'pantry_item_riz', ingredientId: 'riz', label: 'Riz', quantity: 700, unit: 'g', addedAt: NOW },
    ]);
  });

  it('consumePantry', () => {
    const list = [pantry('a', 'riz', 500, 'g'), pantry('b', 'pates', 200, 'g')];
    expect(consumePantry(list, 'a', 200)[0].quantity).toBe(300);
    expect(consumePantry(list, 'a', 500).map((p) => p.id)).toEqual(['b']);
    expect(consumePantry(list, 'z', 1)).toEqual(list);
  });
});

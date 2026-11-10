/// <reference types="jest" />
import { INGREDIENTS_BY_ID as I, PRODUCTS, RECIPES_BY_ID as R, emptyPlan } from './fixtures';
import {
  buildShoppingList,
  createManualItem,
  groupByAisle,
  guessAisle,
  listProgress,
  mergeWithExisting,
  planItemId,
  roundToPackaging,
  toggleItem,
} from '../shoppingList';
import type { MealPlan, ShoppingListItem } from '../types';

const PLAN: MealPlan = emptyPlan('2026-09-14', [
  { id: 'm1', date: '2026-09-14', type: 'diner', recipeId: 'pates_tomate', servings: 3 },
  { id: 'm2', date: '2026-09-15', type: 'diner', recipeId: 'dahl', servings: 3 },
  { id: 'm3', date: '2026-09-16', type: 'diner', recipeId: 'chili_sin_carne', servings: 4 },
  { id: 'm4', date: '2026-09-17', type: 'diner', recipeId: 'recette_supprimee', servings: 4 },
]);

const byIngredient = (items: ShoppingListItem[], id: string) => items.find((i) => i.ingredientId === id);

describe('buildShoppingList', () => {
  const items = buildShoppingList(PLAN, R, I);

  it('met à l’échelle, convertit et agrège par ingrédient', () => {
    // oignon : 0,75 → ½ sup. = 1 (pâtes) + 1 (dahl) + 1 (chili)
    expect(byIngredient(items, 'oignon')).toMatchObject({ id: 'item_oignon', quantity: 3, unit: 'piece', label: 'Oignon' });
    // tomate : 375 g + 1,5 pièce × 120 g + 400 g = 955 g
    expect(byIngredient(items, 'tomate')).toMatchObject({ quantity: 955, unit: 'g', aisle: 'fruits_legumes' });
    expect(byIngredient(items, 'tomate')?.recipeIds).toEqual(['pates_tomate', 'dahl', 'chili_sin_carne']);
    expect(byIngredient(items, 'pates')).toMatchObject({ quantity: 300, unit: 'g', label: 'Pâtes' });
    expect(byIngredient(items, 'lait_coco')).toMatchObject({ quantity: 300, unit: 'ml' });
    // 2 c. à s. × 0,75 = 22,5 ml → 23 ml
    expect(byIngredient(items, 'huile_olive')).toMatchObject({ quantity: 23, unit: 'ml', pantryStaple: true });
    expect(byIngredient(items, 'riz')?.pantryStaple).toBeUndefined();
  });

  it('ignore les optionnels et les recettes inconnues', () => {
    expect(byIngredient(items, 'parmesan')).toBeUndefined();
    expect(items.every((i) => i.source === 'plan' && !i.checked)).toBe(true);
  });

  it('unité inconvertible : article séparé à id stable', () => {
    const pc = byIngredient(items, 'pois_chiches');
    expect(pc).toMatchObject({ id: 'item_pois_chiches_piece', unit: 'piece', quantity: 1 });
    expect(planItemId('x')).toBe('item_x');
    expect(planItemId('x', 'g', 'g')).toBe('item_x');
  });

  it('trie par rayon puis par libellé', () => {
    expect(items.map((i) => i.ingredientId)).toEqual([
      'oignon',
      'tomate',
      'lait_coco',
      'lentilles',
      'pates',
      'pois_chiches',
      'riz',
      'huile_olive',
    ]);
  });

  it('ingrédient inconnu ignoré', () => {
    const r = { ...R.riz_legumes, ingredients: [...R.riz_legumes.ingredients, { ingredientId: 'fantome', quantity: 1, unit: 'g' as const }] };
    const list = buildShoppingList(emptyPlan('2026-09-14', [{ id: 'm', date: '2026-09-14', type: 'diner', recipeId: r.id, servings: 4 }]), { [r.id]: r }, I);
    expect(list.some((i) => i.ingredientId === 'fantome')).toBe(false);
  });

  it('même recette deux fois : recipeIds sans doublon', () => {
    const plan = emptyPlan('2026-09-14', [
      { id: 'a', date: '2026-09-14', type: 'diner', recipeId: 'dahl', servings: 2 },
      { id: 'b', date: '2026-09-15', type: 'diner', recipeId: 'dahl', servings: 2 },
    ]);
    const list = buildShoppingList(plan, R, I);
    expect(byIngredient(list, 'lentilles')).toMatchObject({ quantity: 300, recipeIds: ['dahl'] });
  });

  it('arrondit aux conditionnements réels des produits', () => {
    const withPacks = buildShoppingList(PLAN, R, I, { products: PRODUCTS });
    expect(byIngredient(withPacks, 'pates')?.packaging).toEqual({ packSize: 500, packUnit: 'g', packs: 1 });
    expect(byIngredient(withPacks, 'tomate')?.packaging).toEqual({ packSize: 1000, packUnit: 'g', packs: 1 });
    // oignons à l'unité (1 pièce) plutôt qu'un filet de 1 kg (≈ 9 pièces)
    expect(byIngredient(withPacks, 'oignon')?.packaging).toEqual({ packSize: 1, packUnit: 'piece', packs: 3 });
    expect(byIngredient(withPacks, 'huile_olive')?.packaging).toEqual({ packSize: 750, packUnit: 'ml', packs: 1 });
    expect(byIngredient(withPacks, 'riz')?.packaging).toBeUndefined();
  });

  it('(V2) déduit le placard', () => {
    const list = buildShoppingList(PLAN, R, I, {
      products: PRODUCTS,
      pantry: [
        { id: 'p1', ingredientId: 'riz', label: 'Riz', quantity: 1000, unit: 'g', addedAt: '2026-09-01' },
        { id: 'p2', ingredientId: 'tomate', label: 'Tomates', quantity: 2, unit: 'piece', addedAt: '2026-09-01' },
      ],
    });
    expect(byIngredient(list, 'riz')).toBeUndefined();
    expect(byIngredient(list, 'tomate')).toMatchObject({ quantity: 715, note: 'Déjà 240 g au placard' });
    expect(byIngredient(list, 'tomate')?.packaging).toEqual({ packSize: 1000, packUnit: 'g', packs: 1 });
  });
});

describe('roundToPackaging', () => {
  it('minimise le surplus, puis le nombre de paquets', () => {
    expect(roundToPackaging(600, [500, 1000])).toEqual({ packSize: 1000, packs: 1 }); // surplus 400 = 400 → 1 paquet
    expect(roundToPackaging(1200, [250, 1000])).toEqual({ packSize: 250, packs: 5 });
    expect(roundToPackaging(500, [500, 250])).toEqual({ packSize: 500, packs: 1 });
    expect(roundToPackaging(300, [1000, 500, 500])).toEqual({ packSize: 500, packs: 1 });
    expect(roundToPackaging(0.3, [0.1])).toEqual({ packSize: 0.1, packs: 3 }); // pas de bruit flottant
    expect(roundToPackaging(1, [6])).toEqual({ packSize: 6, packs: 1 });
  });

  it('cas limites', () => {
    expect(roundToPackaging(0, [500])).toBeUndefined();
    expect(roundToPackaging(-5, [500])).toBeUndefined();
    expect(roundToPackaging(100, [])).toBeUndefined();
    expect(roundToPackaging(100, [0, -1])).toBeUndefined();
  });
});

describe('mergeWithExisting', () => {
  const next = buildShoppingList(PLAN, R, I);
  const manual = createManualItem('Sacs poubelle', { id: 'manual_1' });

  it('garde les articles manuels et les coches si la quantité n’a pas augmenté', () => {
    const previous: ShoppingListItem[] = [
      { ...(byIngredient(next, 'oignon') as ShoppingListItem), checked: true, quantity: 3 },
      { ...(byIngredient(next, 'tomate') as ShoppingListItem), checked: true, quantity: 500 }, // a augmenté → décoché
      { ...(byIngredient(next, 'riz') as ShoppingListItem), id: 'ancien_id', checked: true, quantity: 1000 }, // par ingrédient
      { id: 'item_poulet', ingredientId: 'poulet', label: 'Poulet', quantity: 600, unit: 'g', aisle: 'boucherie', checked: true, source: 'plan', recipeIds: [] },
      manual,
    ];
    const merged = mergeWithExisting(previous, next);
    expect(byIngredient(merged, 'oignon')?.checked).toBe(true);
    expect(byIngredient(merged, 'tomate')?.checked).toBe(false);
    expect(byIngredient(merged, 'riz')?.checked).toBe(true);
    expect(byIngredient(merged, 'poulet')).toBeUndefined();
    expect(merged.find((i) => i.id === 'manual_1')).toBe(manual);
    expect(merged).toHaveLength(next.length + 1);
  });

  it('unité différente : coche non reprise', () => {
    const prev = [{ ...(byIngredient(next, 'riz') as ShoppingListItem), unit: 'piece' as const, checked: true, quantity: 9999 }];
    expect(byIngredient(mergeWithExisting(prev, next), 'riz')?.checked).toBe(false);
  });
});

describe('rayons, articles manuels, progression', () => {
  it('guessAisle : mots-clés français', () => {
    const cases: [string, string][] = [
      ['Pain de mie', 'boulangerie'],
      ['Baguette tradition', 'boulangerie'],
      ['Lait demi-écrémé', 'cremerie'],
      ['Yaourts nature', 'cremerie'],
      ['Fromage râpé', 'cremerie'],
      ['Laitue', 'fruits_legumes'],
      ['Blancs de poulet', 'boucherie'],
      ['Steak de bœuf', 'boucherie'],
      ['Saumon fumé', 'poissonnerie'],
      ['Sacs poubelle 30L', 'hygiene_maison'],
      ['Éponges', 'hygiene_maison'],
      ['Savon de Marseille', 'hygiene_maison'],
      ['Eau gazeuse', 'boissons'],
      ["Jus d'orange", 'boissons'],
      ['Petits pois surgelés', 'surgeles'],
      ['Pommes Golden', 'fruits_legumes'],
      ['Chou-fleur', 'fruits_legumes'],
      ['Sucre glace', 'epicerie_sucree'],
      ['Chocolat noir', 'epicerie_sucree'],
      ['Vinaigre de vin', 'condiments'],
      ['Bouillon de poulet', 'condiments'],
      ['Huile de tournesol', 'condiments'],
      ['Lait de coco', 'epicerie_salee'],
      ['Pâtes complètes', 'epicerie_salee'],
      ['Piles AA', 'autre'],
      ['', 'autre'],
    ];
    for (const [label, aisle] of cases) expect([label, guessAisle(label)]).toEqual([label, aisle]);
  });

  it('createManualItem', () => {
    const item = createManualItem('  sacs   poubelle ');
    expect(item).toMatchObject({ label: 'Sacs poubelle', quantity: 1, unit: 'piece', aisle: 'hygiene_maison', source: 'manual', checked: false, recipeIds: [] });
    expect(item.id).toMatch(/^manual_/);
    expect(item.note).toBeUndefined();
    const custom = createManualItem('Lait', { quantity: 2, unit: 'ml', aisle: 'autre', id: 'm1', note: 'bio' });
    expect(custom).toMatchObject({ id: 'm1', quantity: 2, unit: 'ml', aisle: 'autre', note: 'bio' });
    expect(createManualItem('Lait', { quantity: 0 }).quantity).toBe(1);
  });

  it('groupByAisle : ordre des rayons, non cochés d’abord', () => {
    const items = [
      createManualItem('Yaourt', { id: 'a' }),
      { ...createManualItem('Beurre', { id: 'b' }), checked: true },
      createManualItem('Crème', { id: 'c' }),
      createManualItem('Tomates', { id: 'd' }),
      { ...createManualItem('Bizarre', { id: 'e' }), aisle: 'inconnu' as never },
    ];
    const groups = groupByAisle(items);
    expect(groups.map((g) => g.aisle)).toEqual(['fruits_legumes', 'cremerie', 'autre']);
    expect(groups[1].items.map((i) => i.id)).toEqual(['c', 'a', 'b']);
    expect(groupByAisle([])).toEqual([]);
  });

  it('toggleItem / listProgress', () => {
    const items = [createManualItem('A', { id: 'a' }), createManualItem('B', { id: 'b' })];
    const toggled = toggleItem(items, 'a');
    expect(toggled[0].checked).toBe(true);
    expect(items[0].checked).toBe(false);
    expect(toggleItem(toggled, 'a', true)[0].checked).toBe(true);
    expect(listProgress(toggled)).toEqual({ done: 1, total: 2, ratio: 0.5 });
    expect(listProgress([])).toEqual({ done: 0, total: 0, ratio: 0 });
  });
});

import React from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { Ingredient, PantryItem, Recipe } from '@/core';
import { ingredients, recipes } from '@/data';

import { AddPantrySheet } from '../AddPantrySheet';
import { ExpiryPicker } from '../ExpiryPicker';
import { LeftoverCard } from '../LeftoverCard';
import { PantryItemRow } from '../PantryItemRow';
import { PantryItemSheet } from '../PantryItemSheet';
import {
  defaultQuantity,
  expiryFromPreset,
  expiryInfo,
  leftoverUsesLabel,
  pantryAisle,
  pantryCountLabel,
  presetForExpiry,
  quantityStep,
  searchIngredients,
  sortPantry,
  splitPantry,
} from '../pantryView';

const TODAY = '2026-11-10';
const ingredientsById = Object.fromEntries(ingredients.map((i) => [i.id, i])) as Record<string, Ingredient>;

const pantryItem = (over: Partial<PantryItem> = {}): PantryItem => ({
  id: 'p1',
  ingredientId: 'creme_fraiche',
  label: 'Crème fraîche épaisse',
  quantity: 100,
  unit: 'ml',
  addedAt: '2026-11-08T10:00:00.000Z',
  expiresAt: '2026-11-12',
  ...over,
});

// ─── Péremption ──────────────────────────────────────────────────────────────

describe('expiryInfo', () => {
  it('rend la date limite lisible, relative à aujourd’hui', () => {
    expect(expiryInfo('2026-11-12', TODAY)).toMatchObject({ days: 2, label: 'Périme dans 2 jours', short: 'Dans 2 j', tone: 'warning' });
    expect(expiryInfo('2026-11-11', TODAY)).toMatchObject({ label: 'Périme demain', short: 'Demain', tone: 'warning' });
    expect(expiryInfo('2026-11-10T08:00:00Z', TODAY)).toMatchObject({ label: 'À consommer aujourd’hui', tone: 'danger' });
    expect(expiryInfo('2026-11-09', TODAY)).toMatchObject({ label: 'Périmé depuis hier', short: 'Périmé', tone: 'danger' });
    expect(expiryInfo('2026-11-05', TODAY)).toMatchObject({ label: 'Périmé depuis 5 jours', tone: 'danger' });
    expect(expiryInfo('2026-11-15', TODAY)).toMatchObject({ label: 'Périme dans 5 jours', tone: 'neutral' });
    expect(expiryInfo('2026-11-18', TODAY)).toMatchObject({ label: 'Périme mercredi 18 novembre', short: '18 nov.' });
    expect(expiryInfo('2026-12-24', TODAY)).toMatchObject({ label: 'À consommer avant le 24 déc.', short: '24 déc.' });
    expect(expiryInfo(undefined, TODAY)).toBeNull();
    expect(expiryInfo('bientôt', TODAY)).toBeNull();
  });

  it('propose des dates limites en un toucher', () => {
    expect(expiryFromPreset('none', TODAY)).toBeUndefined();
    expect(expiryFromPreset('d0', TODAY)).toBe('2026-11-10');
    expect(expiryFromPreset('d3', TODAY)).toBe('2026-11-13');
    expect(expiryFromPreset('d14', TODAY)).toBe('2026-11-24');
    expect(expiryFromPreset('inconnu', TODAY)).toBeUndefined();
    expect(presetForExpiry(undefined, TODAY)).toBe('none');
    expect(presetForExpiry('2026-11-17', TODAY)).toBe('d7');
    expect(presetForExpiry('2026-11-12', TODAY)).toBe('custom');
  });
});

// ─── Tri, recherche, quantités ───────────────────────────────────────────────

describe('placard', () => {
  const egg = pantryItem({ id: 'p2', ingredientId: 'oeuf', label: 'Œuf', quantity: 4, unit: 'piece', expiresAt: '2026-11-16' });
  const rice = pantryItem({ id: 'p3', ingredientId: 'riz_basmati', label: 'Riz basmati', quantity: 400, unit: 'g', expiresAt: undefined });
  const free = pantryItem({ id: 'p4', ingredientId: undefined, label: 'Reste de soupe', quantity: 1, unit: 'piece', expiresAt: undefined });
  const cream = pantryItem();

  it('trie par péremption puis alphabétiquement, et isole « à consommer vite »', () => {
    expect(sortPantry([rice, egg, free, cream]).map((p) => p.id)).toEqual(['p1', 'p2', 'p4', 'p3']);
    const { soon, rest } = splitPantry([rice, egg, cream, free], [cream]);
    expect(soon.map((p) => p.id)).toEqual(['p1']);
    expect(rest.map((p) => p.id)).toEqual(['p2', 'p4', 'p3']);
    expect(pantryCountLabel(1)).toBe('1 article');
    expect(pantryCountLabel(3)).toBe('3 articles');
  });

  it('retrouve le rayon : ingrédient connu, sinon deviné', () => {
    expect(pantryAisle(egg, ingredientsById)).toBe('cremerie');
    expect(pantryAisle(free, ingredientsById)).toBe('epicerie_salee');
    expect(pantryAisle({ label: 'Lessive' }, ingredientsById)).toBe('hygiene_maison');
  });

  it('cherche un ingrédient sans tenir compte des accents', () => {
    const res = searchIngredients(ingredients, 'tom', 4);
    expect(res).toHaveLength(4);
    expect(res[0].name.toLowerCase().startsWith('tom')).toBe(true);
    expect(searchIngredients(ingredients, 'CREME').some((i) => i.id === 'creme_fraiche')).toBe(true);
    expect(searchIngredients(ingredients, 'oeufs').map((i) => i.id)).toContain('oeuf');
    expect(searchIngredients(ingredients, '   ')).toEqual([]);
    expect(searchIngredients(ingredients, 'zzzz')).toEqual([]);
  });

  it('propose une quantité et un pas adaptés', () => {
    expect(defaultQuantity('piece')).toBe(1);
    expect(defaultQuantity('g')).toBe(200);
    expect(defaultQuantity('ml')).toBe(250);
    expect(quantityStep('piece', 12)).toBe(1);
    expect(quantityStep('g', 1500)).toBe(100);
    expect(quantityStep('g', 400)).toBe(50);
    expect(quantityStep('ml', 80)).toBe(10);
    expect(quantityStep('g', 20)).toBe(5);
  });

  it('nomme les restes utilisés par une recette', () => {
    expect(leftoverUsesLabel(['creme_fraiche', 'oeuf', 'inconnu'], ingredientsById)).toBe('Utilise crème fraîche épaisse et œuf');
    expect(leftoverUsesLabel([], ingredientsById)).toBe('Utilise tes restes');
  });
});

// ─── Composants ──────────────────────────────────────────────────────────────

describe('PantryItemRow', () => {
  it('affiche quantité et péremption, s’ouvre, se termine et se retire', async () => {
    const h = { onPress: jest.fn(), onUseAll: jest.fn(), onRemove: jest.fn() };
    await render(<PantryItemRow item={pantryItem()} aisle="cremerie" today={TODAY} testID="row" {...h} />, { wrapper: GestureHandlerRootView });
    expect(screen.getByText('Crème fraîche épaisse')).toBeTruthy();
    expect(screen.getByText('10 cl')).toBeTruthy();
    expect(screen.getByText('Dans 2 j')).toBeTruthy();
    const row = screen.getByRole('button', { name: 'Crème fraîche épaisse, 10 cl, Périme dans 2 jours' });
    await fireEvent.press(row);
    expect(h.onPress).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Tout utilisé : Crème fraîche épaisse' }));
    expect(h.onUseAll).toHaveBeenCalledTimes(1);
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'remove' } });
    expect(h.onRemove).toHaveBeenCalledTimes(1);
  });
});

describe('LeftoverCard', () => {
  it('présente la recette et l’ouvre au toucher', async () => {
    const recipe = recipes[0] as Recipe;
    const onPress = jest.fn();
    await render(<LeftoverCard recipe={recipe} uses="Utilise œuf" onPress={onPress} />);
    expect(screen.getByText(recipe.title)).toBeTruthy();
    expect(screen.getByText('Utilise œuf')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(`^${recipe.title.replace(/[()]/g, '.')}`) }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('ExpiryPicker', () => {
  it('convertit un choix en date et garde une date personnalisée', async () => {
    const onChange = jest.fn();
    const { rerender } = await render(<ExpiryPicker value={undefined} onChange={onChange} today={TODAY} testID="e" />);
    expect(screen.getByRole('radio', { name: 'Aucune' })).toBeChecked();
    await fireEvent.press(screen.getByTestId('e-chips-d1'));
    expect(onChange).toHaveBeenLastCalledWith('2026-11-11');
    await fireEvent.press(screen.getByTestId('e-chips-none'));
    await rerender(<ExpiryPicker value="2026-11-12" onChange={onChange} today={TODAY} testID="e" />);
    expect(screen.getByRole('radio', { name: 'Dans 2 j' })).toBeChecked();
  });
});

describe('PantryItemSheet', () => {
  it('enregistre la quantité restante et la date, ou termine / retire l’article', async () => {
    const h = { onClose: jest.fn(), onSave: jest.fn(), onUseAll: jest.fn(), onRemove: jest.fn() };
    await render(<PantryItemSheet visible item={pantryItem()} today={TODAY} {...h} />);
    expect(screen.getByText('Périme dans 2 jours')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('pantry-item-quantity-input'), '40');
    await fireEvent.press(screen.getByTestId('pantry-item-expiry-chips-none'));
    await fireEvent.press(screen.getByTestId('pantry-item-save'));
    expect(h.onSave).toHaveBeenCalledWith({ quantity: 40, expiresAt: undefined });
    await fireEvent.press(screen.getByTestId('pantry-item-use-all'));
    await fireEvent.press(screen.getByTestId('pantry-item-remove'));
    expect(h.onUseAll).toHaveBeenCalledTimes(1);
    expect(h.onRemove).toHaveBeenCalledTimes(1);
    // Saisie invalide : « Enregistrer » inactif (pas d'ancienne valeur enregistrée en douce).
    await fireEvent.changeText(screen.getByTestId('pantry-item-quantity-input'), '4O');
    expect(screen.getByTestId('pantry-item-save')).toBeDisabled();
  });
});

describe('AddPantrySheet', () => {
  it('ajoute un ingrédient du catalogue avec quantité et date limite', async () => {
    const onAdd = jest.fn();
    await render(<AddPantrySheet visible ingredients={ingredients} today={TODAY} onClose={jest.fn()} onAdd={onAdd} />);
    await fireEvent.changeText(screen.getByTestId('pantry-search'), 'oeuf');
    await fireEvent.press(screen.getByTestId('pantry-result-oeuf'));
    // Œufs : à la pièce, 1 par défaut → 2.
    await fireEvent.press(screen.getByTestId('pantry-add-quantity-stepper-inc'));
    await fireEvent.press(screen.getByTestId('pantry-add-expiry-chips-d7'));
    await fireEvent.press(screen.getByTestId('pantry-add-submit'));
    expect(onAdd).toHaveBeenCalledWith({ label: 'Œuf', quantity: 2, unit: 'piece', ingredientId: 'oeuf', expiresAt: '2026-11-17' });
  });

  it('accepte un texte libre et son unité', async () => {
    const onAdd = jest.fn();
    await render(<AddPantrySheet visible ingredients={ingredients} today={TODAY} onClose={jest.fn()} onAdd={onAdd} />);
    await fireEvent.changeText(screen.getByTestId('pantry-search'), 'reste de soupe');
    await fireEvent.press(screen.getByTestId('pantry-result-free'));
    expect(screen.getByText('Reste de soupe')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('pantry-add-quantity-unit-ml'));
    await fireEvent.press(screen.getByTestId('pantry-add-submit'));
    expect(onAdd).toHaveBeenCalledWith({ label: 'Reste de soupe', quantity: 250, unit: 'ml', ingredientId: undefined, expiresAt: undefined });
    // « Changer » revient à la recherche.
    await fireEvent.press(screen.getByTestId('pantry-change'));
    expect(screen.getByTestId('pantry-search')).toBeTruthy();
  });

  it('n’ajoute rien quand le champ quantité est vidé', async () => {
    const onAdd = jest.fn();
    await render(<AddPantrySheet visible ingredients={ingredients} today={TODAY} onClose={jest.fn()} onAdd={onAdd} />);
    await fireEvent.changeText(screen.getByTestId('pantry-search'), 'reste de soupe');
    await fireEvent.press(screen.getByTestId('pantry-result-free'));
    await fireEvent.press(screen.getByTestId('pantry-add-quantity-unit-g'));
    await fireEvent.changeText(screen.getByTestId('pantry-add-quantity-input'), '');
    expect(screen.getByTestId('pantry-add-submit')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('pantry-add-submit'));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('clavier ouvert : un toucher atteint le résultat, la feuille cède la place au clavier', async () => {
    await render(<AddPantrySheet visible ingredients={ingredients} today={TODAY} onClose={jest.fn()} onAdd={jest.fn()} />);
    type Node = ReturnType<typeof screen.getByTestId>;
    const ancestor = (from: Node, match: (n: Node) => boolean): Node | null => {
      let n: Node | null = from;
      while (n && !match(n)) n = n.parent;
      return n;
    };
    const search = screen.getByTestId('pantry-search');
    const scroll = ancestor(search, (n) => n.props.keyboardShouldPersistTaps !== undefined);
    expect(scroll?.props.keyboardShouldPersistTaps).toBe('handled');
    // Hauteur fixe (86 %) mais rétractable : elle ne passe pas sous la barre d'état.
    const sheet = ancestor(search, (n) => n.props.accessibilityViewIsModal === true);
    expect(StyleSheet.flatten(sheet?.props.style)).toMatchObject({ flexShrink: 1 });
  });
});

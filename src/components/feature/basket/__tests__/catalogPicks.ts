/**
 * Choix d'articles de test DÉRIVÉS du catalogue embarqué (données réelles :
 * les produits et prix changent à chaque import) — jamais d'identifiant de
 * produit ni de prix en dur. Utilisé par les tests de l'onglet Prix, du
 * comparateur et de la commande.
 */
import type { CatalogIndex, Ingredient, ShoppingListItem } from '@/core';
import { allOffersForItem, compareItem } from '@/core';

/** Quantité « d'une recette » dans l'unité de base de l'ingrédient. */
function needFor(ing: Pick<Ingredient, 'baseUnit'>): number {
  return ing.baseUnit === 'piece' ? 2 : ing.baseUnit === 'ml' ? 400 : 300;
}

/** Article de liste (« plan ») pour un ingrédient. */
export function itemFor(ing: Ingredient, over: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return {
    id: `i-${ing.id}`,
    ingredientId: ing.id,
    label: ing.name,
    quantity: needFor(ing),
    unit: ing.baseUnit,
    aisle: ing.aisle,
    checked: false,
    source: 'plan',
    recipeIds: ['rec_a'],
    ...over,
  };
}

/** Article saisi à la main (sans ingrédient : jamais chiffré). */
export function manualItem(id: string, label: string): ShoppingListItem {
  return { id, label, quantity: 1, unit: 'piece', aisle: 'boissons', checked: false, source: 'manual', recipeIds: [] };
}

export interface PickOptions {
  /** Enseignes qui doivent TOUTES chiffrer l'article. */
  storeIds: readonly string[];
  /** Nombre d'articles voulus (au plus). */
  count: number;
  /** Nombre minimal d'enseignes qui le chiffrent (défaut 3). */
  minStores?: number;
  /** Au moins 2 produits au choix dans cette enseigne. */
  choicesAt?: string;
  now?: string;
}

/**
 * Articles chiffrés dans toutes les enseignes `storeIds` (et au moins
 * `minStores` en tout), dans l'ordre du catalogue d'ingrédients.
 */
export function comparableItems(index: CatalogIndex, ingredients: readonly Ingredient[], opts: PickOptions): ShoppingListItem[] {
  const out: ShoppingListItem[] = [];
  for (const ing of ingredients) {
    if (out.length >= opts.count) break;
    if (!(index.productsByIngredient.get(ing.id)?.length ?? 0)) continue;
    const it = itemFor(ing);
    const c = compareItem(it, index, opts.now);
    if (c.offers.length < (opts.minStores ?? 3)) continue;
    if (!opts.storeIds.every((id) => c.offers.some((o) => o.storeId === id))) continue;
    if (opts.choicesAt) {
      const ids = new Set(allOffersForItem(it, index, opts.now).filter((o) => o.storeId === opts.choicesAt).map((o) => o.productId));
      if (ids.size < 2) continue;
    }
    out.push(it);
  }
  return out;
}

/** Premier article (parmi tous les ingrédients) qui satisfait `test`. */
export function findItem(
  index: CatalogIndex,
  ingredients: readonly Ingredient[],
  test: (item: ShoppingListItem) => boolean,
): ShoppingListItem | undefined {
  for (const ing of ingredients) {
    if (!(index.productsByIngredient.get(ing.id)?.length ?? 0)) continue;
    const it = itemFor(ing);
    if (test(it)) return it;
  }
  return undefined;
}

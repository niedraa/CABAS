/**
 * listStore — liste de courses, une par semaine (persisté : `cabas/list`).
 * 100 % hors-ligne : tout est calculé sur l'appareil.
 *
 * État : `lists: Record<weekStart, ShoppingList>`.
 * Actions (semaine par défaut : `weekStore.activeWeekStart`) :
 *  - `regenerateFromPlan(plan)` → ShoppingList : core › buildShoppingList (conditionnements
 *    réels des produits, déduction du placard) puis core › mergeWithExisting (les
 *    articles manuels et les cases cochées sont conservés). Appelée
 *    automatiquement par planStore après chaque changement du planning ;
 *  - `toggleItem(itemId, weekStart?)`, `setChecked(itemId, checked, weekStart?)` ;
 *  - `addManualItem(label, quantity?, unit?, weekStart?)` → article (rayon deviné) ou null ;
 *  - `updateItem(itemId, patch, weekStart?)`, `removeItem(itemId, weekStart?)` ;
 *  - `clearChecked(weekStart?)` (retire les articles cochés), `uncheckAll(weekStart?)` ;
 *  - `reset()`.
 * Sélecteurs purs : `groupItemsByAisle(items)` (rayons dans l'ordre de parcours,
 * non cochés d'abord), `listProgressOf(items)`, `emptyList(weekStart)`.
 * Hooks mémoïsés : `useActiveList()`, `useListSections(weekStart?)`, `useListProgress(weekStart?)`.
 */
import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Aisle, BaseUnit, MealPlan, ShoppingList, ShoppingListItem } from '@/core';
import { buildShoppingList, createManualItem, groupByAisle, listProgress, mergeWithExisting, toggleItem as toggleCore } from '@/core';
import { track } from '@/services/analytics';
import { getCatalogSnapshot } from '@/services/catalog';

import { pantryForWeekList, usePantryStore } from './pantryStore';
import { basePersistOptions, registerPersistedStore } from './registry';
import { activeWeek, useWeekStore } from './weekStore';

export type ListItemPatch = Partial<Pick<ShoppingListItem, 'label' | 'quantity' | 'unit' | 'aisle' | 'note' | 'checked'>>;

export interface ListState {
  hydrated: boolean;
  lists: Record<string, ShoppingList>;
  regenerateFromPlan(plan: MealPlan): ShoppingList;
  toggleItem(itemId: string, weekStart?: string): void;
  setChecked(itemId: string, checked: boolean, weekStart?: string): void;
  addManualItem(label: string, quantity?: number, unit?: BaseUnit, weekStart?: string): ShoppingListItem | null;
  updateItem(itemId: string, patch: ListItemPatch, weekStart?: string): void;
  removeItem(itemId: string, weekStart?: string): void;
  clearChecked(weekStart?: string): void;
  uncheckAll(weekStart?: string): void;
  setList(weekStart: string, list: ShoppingList): void;
  reset(): void;
}

export function emptyList(weekStart: string): ShoppingList {
  return { id: `list_${weekStart}`, mealPlanId: null, items: [], updatedAt: new Date(0).toISOString() };
}

/** Rayons dans l'ordre de parcours, articles non cochés d'abord. */
export function groupItemsByAisle(items: readonly ShoppingListItem[]): { aisle: Aisle; items: ShoppingListItem[] }[] {
  return groupByAisle(items);
}

export function listProgressOf(items: readonly ShoppingListItem[]) {
  return listProgress(items);
}

export const useListStore = create<ListState>()(
  persist(
    (set, get) => {
      /** Applique une transformation aux articles d'une semaine. */
      const mutate = (weekStart: string | undefined, fn: (items: ShoppingListItem[]) => ShoppingListItem[]) => {
        const ws = weekStart ?? activeWeek();
        const list = get().lists[ws] ?? emptyList(ws);
        const items = fn(list.items);
        set({ lists: { ...get().lists, [ws]: { ...list, items, updatedAt: new Date().toISOString() } } });
      };

      return {
        hydrated: false,
        lists: {},

        regenerateFromPlan(plan) {
          const catalog = getCatalogSnapshot();
          const { items: pantryItems, origins } = usePantryStore.getState();
          const pantry = pantryForWeekList(pantryItems, origins, plan.weekStart);
          const fresh = buildShoppingList(plan, catalog.recipesById, catalog.ingredientsById, {
            products: catalog.products,
            pantry,
          });
          const previous = get().lists[plan.weekStart] ?? emptyList(plan.weekStart);
          const list: ShoppingList = {
            id: previous.id,
            mealPlanId: plan.id,
            items: mergeWithExisting(previous.items, fresh),
            updatedAt: new Date().toISOString(),
          };
          set({ lists: { ...get().lists, [plan.weekStart]: list } });
          track('list_generated', {
            items: list.items.length,
            manual: list.items.filter((i) => i.source === 'manual').length,
            meals: plan.meals.length,
          });
          return list;
        },
        toggleItem(itemId, weekStart) {
          let checked = false;
          mutate(weekStart, (items) => {
            const next = toggleCore(items, itemId);
            checked = next.find((i) => i.id === itemId)?.checked ?? false;
            return next;
          });
          if (checked) track('item_checked');
        },
        setChecked(itemId, checked, weekStart) {
          mutate(weekStart, (items) => toggleCore(items, itemId, checked));
        },
        addManualItem(label, quantity, unit, weekStart) {
          if (!label.trim()) return null;
          const item = createManualItem(label, { quantity, unit });
          mutate(weekStart, (items) => [...items, item]);
          track('manual_item_added', { aisle: item.aisle });
          return item;
        },
        updateItem(itemId, patch, weekStart) {
          mutate(weekStart, (items) =>
            items.map((i) => {
              if (i.id !== itemId) return i;
              const next: ShoppingListItem = { ...i, ...patch };
              if (patch.label !== undefined) next.label = patch.label.trim() || i.label;
              if (patch.quantity !== undefined) {
                next.quantity = Number.isFinite(patch.quantity) && patch.quantity > 0 ? patch.quantity : i.quantity;
                // La quantité a changé : l'ancien arrondi au conditionnement ne vaut plus.
                if (next.quantity !== i.quantity) delete next.packaging;
              }
              return next;
            }),
          );
        },
        removeItem(itemId, weekStart) {
          mutate(weekStart, (items) => items.filter((i) => i.id !== itemId));
        },
        clearChecked(weekStart) {
          mutate(weekStart, (items) => items.filter((i) => !i.checked));
        },
        uncheckAll(weekStart) {
          mutate(weekStart, (items) => items.map((i) => (i.checked ? { ...i, checked: false } : i)));
        },
        setList(weekStart, list) {
          set({ lists: { ...get().lists, [weekStart]: list } });
        },
        reset() {
          set({ lists: {} });
        },
      };
    },
    {
      ...basePersistOptions<Partial<ListState>>('list'),
      partialize: (s) => ({ lists: s.lists }),
    },
  ),
);

registerPersistedStore('list', useListStore);

/** Liste d'une semaine (hors React ; liste vide si absente). */
export function getList(weekStart: string = activeWeek()): ShoppingList {
  return useListStore.getState().lists[weekStart] ?? emptyList(weekStart);
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/** Liste de la semaine (défaut : semaine active), ou null si jamais générée. */
export function useWeekList(weekStart?: string): ShoppingList | null {
  const active = useWeekStore((s) => s.activeWeekStart);
  const ws = weekStart ?? active;
  return useListStore((s) => s.lists[ws] ?? null);
}

export function useActiveList(): ShoppingList | null {
  return useWeekList();
}

/** Articles groupés par rayon (mémoïsé). */
export function useListSections(weekStart?: string) {
  const list = useWeekList(weekStart);
  return useMemo(() => groupByAisle(list?.items ?? []), [list]);
}

export function useListProgress(weekStart?: string) {
  const list = useWeekList(weekStart);
  return useMemo(() => listProgress(list?.items ?? []), [list]);
}

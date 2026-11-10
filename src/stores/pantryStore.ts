/**
 * pantryStore — (V2) placard & anti-gaspi (persisté : `cabas/pantry`).
 *
 * État : `items: PantryItem[]`.
 * Actions :
 *  - `add({ label, quantity, unit, ingredientId?, expiresAt? })` → PantryItem
 *    (même ingrédient / même libellé et même unité : les quantités s'additionnent) ;
 *  - `update(id, patch)`, `remove(id)`, `consume(id, quantity)` (supprimé à zéro) ;
 *  - `addFromShopping(items)` : après les courses, le SURPLUS des articles cochés
 *    (paquet entamé) rejoint le placard (core › pantryItemsFromShopping) — voir
 *    aussi `addFromCheckedList()` dans src/stores/index.ts qui lit la liste active ;
 *  - `setItems(items)` (sync), `reset()`.
 * La liste de courses déduit automatiquement le placard (planStore se charge
 * de la régénérer quand le placard change).
 * Sélecteurs purs : `pantryIngredientIds(items)`, `expiringItems(items, now?, days?)`.
 * Hooks : `useLeftoverSuggestions(limit?)` (recettes sûres qui écoulent les restes),
 * `useExpiringSoon(days?)`.
 */
import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { BaseUnit, PantryItem, ShoppingListItem } from '@/core';
import { consumePantry, createPantryItem, expiringSoon, foldText, pantryItemsFromShopping, recipesUsingLeftovers, roundTo } from '@/core';
import { track } from '@/services/analytics';
import { useCatalog } from '@/services/catalog';

import { useProfileStore } from './profileStore';
import { basePersistOptions, registerPersistedStore } from './registry';

export interface PantryInput {
  label: string;
  quantity: number;
  unit: BaseUnit;
  ingredientId?: string;
  expiresAt?: string;
}

export interface PantryState {
  hydrated: boolean;
  items: PantryItem[];
  add(input: PantryInput): PantryItem | null;
  update(id: string, patch: Partial<Omit<PantryItem, 'id' | 'addedAt'>>): void;
  remove(id: string): void;
  consume(id: string, quantity: number): void;
  addFromShopping(items: readonly ShoppingListItem[]): number;
  setItems(items: PantryItem[]): void;
  reset(): void;
}

function sameStock(a: PantryItem, input: { label: string; unit: BaseUnit; ingredientId?: string; expiresAt?: string }): boolean {
  if (a.unit !== input.unit) return false;
  if ((a.expiresAt ?? '') !== (input.expiresAt ?? '')) return false;
  if (input.ingredientId) return a.ingredientId === input.ingredientId;
  return !a.ingredientId && foldText(a.label.trim()) === foldText(input.label.trim());
}

export const usePantryStore = create<PantryState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      items: [],
      add(input) {
        const label = input.label.trim();
        if (!label || !(input.quantity > 0)) return null;
        const existing = get().items.find((p) => sameStock(p, input));
        if (existing) {
          const merged = { ...existing, quantity: roundTo(existing.quantity + input.quantity, 4) };
          set({ items: get().items.map((p) => (p.id === existing.id ? merged : p)) });
          return merged;
        }
        const item = createPantryItem(label, input.quantity, input.unit, {
          ingredientId: input.ingredientId,
          expiresAt: input.expiresAt,
        });
        set({ items: [...get().items, item] });
        track('pantry_item_added', { unit: item.unit, linked: !!item.ingredientId });
        return item;
      },
      update(id, patch) {
        set({
          items: get().items.map((p) => {
            if (p.id !== id) return p;
            const next: PantryItem = { ...p, ...patch };
            if (patch.label !== undefined) next.label = patch.label.trim() || p.label;
            if (patch.quantity !== undefined) next.quantity = Math.max(0, Number.isFinite(patch.quantity) ? patch.quantity : p.quantity);
            if (patch.expiresAt === undefined && 'expiresAt' in patch) delete next.expiresAt;
            return next;
          }),
        });
      },
      remove(id) {
        set({ items: get().items.filter((p) => p.id !== id) });
      },
      consume(id, quantity) {
        if (!(quantity > 0)) return;
        set({ items: consumePantry(get().items, id, quantity) });
      },
      addFromShopping(items) {
        const incoming = pantryItemsFromShopping(items, new Date().toISOString());
        if (incoming.length === 0) return 0;
        // Ids stables (`pantry_<itemId>`) : un second passage remplace au lieu de doubler.
        const ids = new Set(incoming.map((i) => i.id));
        set({ items: [...get().items.filter((p) => !ids.has(p.id)), ...incoming] });
        return incoming.length;
      },
      setItems(items) {
        set({ items: items.slice() });
      },
      reset() {
        set({ items: [] });
      },
    }),
    {
      ...basePersistOptions<Partial<PantryState>>('pantry'),
      partialize: (s) => ({ items: s.items }),
    },
  ),
);

registerPersistedStore('pantry', usePantryStore);

// ─── Sélecteurs purs ─────────────────────────────────────────────────────────

/** Ingrédients présents (bonus anti-gaspi du moteur de repas). */
export function pantryIngredientIds(items: readonly PantryItem[]): string[] {
  return Array.from(new Set(items.filter((p) => p.ingredientId && p.quantity > 0).map((p) => p.ingredientId as string)));
}

export function expiringItems(items: readonly PantryItem[], nowIso = new Date().toISOString(), days = 3): PantryItem[] {
  return expiringSoon(items, nowIso, days);
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/** Recettes sûres qui utilisent les restes du placard (péremption la plus proche d'abord). */
export function useLeftoverSuggestions(limit = 10) {
  const items = usePantryStore((s) => s.items);
  const profile = useProfileStore((s) => s.profile);
  const catalog = useCatalog();
  return useMemo(() => {
    if (!profile) return [];
    return recipesUsingLeftovers(catalog.recipes, items, catalog.ingredientsById, profile, limit);
  }, [items, profile, catalog, limit]);
}

export function useExpiringSoon(days = 3): PantryItem[] {
  const items = usePantryStore((s) => s.items);
  return useMemo(() => expiringSoon(items, new Date().toISOString(), days), [items, days]);
}

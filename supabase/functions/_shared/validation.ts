/**
 * Validation des entrées des Edge Functions. Tout ce qui vient du client est
 * NON FIABLE : types vérifiés, tailles bornées, valeurs d'énumération
 * contrôlées. Les erreurs deviennent des HTTP 400 explicites (en français).
 */
import { HttpError } from './http.ts';
import type { Aisle, BaseUnit, ShoppingListItem } from './core/index.ts';
import { AISLES, isISODate } from './core/index.ts';

export function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function badRequest(message: string, details?: unknown): HttpError {
  return new HttpError(400, 'invalid_request', message, details);
}

export function requireRecord(v: unknown, what = 'Le corps de la requête'): Record<string, unknown> {
  if (!isRecord(v)) throw badRequest(`${what} doit être un objet JSON.`);
  return v;
}

/** Date ISO `YYYY-MM-DD` valide. */
export function requireIsoDate(v: unknown, field: string): string {
  if (typeof v !== 'string' || !isISODate(v)) throw badRequest(`${field} doit être une date AAAA-MM-JJ.`);
  return v;
}

export function optionalInt(v: unknown, field: string, min: number, max: number): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw badRequest(`${field} doit être un entier entre ${min} et ${max}.`);
  }
  return v;
}

/** Tableau de chaînes courtes (ids), borné. */
export function optionalStringArray(v: unknown, field: string, maxItems: number, maxLen = 128): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || v.length > maxItems) throw badRequest(`${field} doit être une liste d'au plus ${maxItems} éléments.`);
  for (const s of v) {
    if (typeof s !== 'string' || s.length === 0 || s.length > maxLen) {
      throw badRequest(`${field} contient une valeur invalide.`);
    }
  }
  return Array.from(new Set(v as string[]));
}

export function optionalEnum<T extends string>(v: unknown, field: string, allowed: readonly T[]): T | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    throw badRequest(`${field} doit valoir : ${allowed.join(', ')}.`);
  }
  return v as T;
}

const BASE_UNITS: readonly BaseUnit[] = ['g', 'ml', 'piece'];

/** Valide et normalise les articles d'une liste de courses (core › ShoppingListItem). */
export function parseShoppingListItems(v: unknown, maxItems = 300): ShoppingListItem[] {
  if (!Array.isArray(v) || v.length === 0) throw badRequest('items doit être une liste non vide d\'articles.');
  if (v.length > maxItems) throw badRequest(`Liste trop longue (${maxItems} articles maximum).`);
  const seen = new Set<string>();
  return v.map((raw, i) => {
    if (!isRecord(raw)) throw badRequest(`items[${i}] doit être un objet.`);
    const id = raw.id;
    if (typeof id !== 'string' || id.length === 0 || id.length > 160) throw badRequest(`items[${i}].id est invalide.`);
    if (seen.has(id)) throw badRequest(`items[${i}].id est en double : ${id}.`);
    seen.add(id);
    const quantity = raw.quantity;
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0 || quantity > 1_000_000) {
      throw badRequest(`items[${i}].quantity doit être un nombre positif.`);
    }
    const unit = optionalEnum(raw.unit, `items[${i}].unit`, BASE_UNITS);
    if (!unit) throw badRequest(`items[${i}].unit est obligatoire (g, ml ou piece).`);
    const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim().slice(0, 200) : id;
    const ingredientId = raw.ingredientId;
    if (ingredientId !== undefined && ingredientId !== null && (typeof ingredientId !== 'string' || ingredientId.length > 128)) {
      throw badRequest(`items[${i}].ingredientId est invalide.`);
    }
    const aisle = optionalEnum(raw.aisle, `items[${i}].aisle`, AISLES) ?? ('autre' as Aisle);
    const item: ShoppingListItem = {
      id,
      label,
      quantity,
      unit,
      aisle,
      checked: raw.checked === true,
      source: raw.source === 'plan' ? 'plan' : 'manual',
      recipeIds: Array.isArray(raw.recipeIds) ? raw.recipeIds.filter((r): r is string => typeof r === 'string').slice(0, 50) : [],
    };
    if (typeof ingredientId === 'string' && ingredientId) item.ingredientId = ingredientId;
    return item;
  });
}

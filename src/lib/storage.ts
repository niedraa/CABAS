/**
 * Persistance locale de Cabas (AsyncStorage ; localStorage sur le web).
 *
 * - `persistStorage()` : adaptateur `persist` de zustand (JSON).
 * - `storageKey('plan')` → « cabas/plan » : toutes les clés de l'app partagent
 *   le préfixe `cabas/`, ce qui permet l'export RGPD et l'effacement complet.
 *   La version de schéma de chaque store est portée par l'option `version`
 *   de `persist` (voir `STORE_VERSIONS`) et migrée par `migrate`.
 * - `readJSON` / `writeJSON` : petites valeurs hors stores (cache catalogue,
 *   utilisateur démo, magasin simulé), jamais d'exception.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, type PersistStorage } from 'zustand/middleware';

export const STORAGE_PREFIX = 'cabas/';

/** Noms des stores persistés (clé `cabas/<nom>`). */
export type PersistedStoreName =
  | 'profile'
  | 'subscription'
  | 'plan'
  | 'list'
  | 'basket'
  | 'order'
  | 'pantry'
  | 'budget'
  | 'settings'
  | 'week';

/** Version de schéma de chaque store (incrémenter + écrire `migrate` en cas de rupture). */
export const STORE_VERSIONS: Record<PersistedStoreName, number> = {
  profile: 1,
  subscription: 1,
  plan: 1,
  list: 1,
  basket: 1,
  order: 1,
  pantry: 1,
  budget: 1,
  settings: 1,
  week: 1,
};

/** Clé de persistance : `cabas/<nom>`. */
export function storageKey(name: string): string {
  return `${STORAGE_PREFIX}${name}`;
}

/** Adaptateur zustand `persist` sur AsyncStorage (JSON). */
export function persistStorage<S>(): PersistStorage<S> {
  return createJSONStorage<S>(() => AsyncStorage) as PersistStorage<S>;
}

/** Lit une valeur JSON ; `fallback` si absente, illisible ou stockage indisponible. */
export async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Écrit une valeur JSON (échec silencieux : la persistance n'est jamais bloquante). */
export async function writeJSON(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Stockage plein ou indisponible : l'app continue en mémoire.
  }
}

export async function removeKey(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignoré
  }
}

/** Toutes les clés Cabas présentes sur l'appareil. */
export async function listCabasKeys(): Promise<string[]> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    return keys.filter((k) => k.startsWith(STORAGE_PREFIX));
  } catch {
    return [];
  }
}

/** Toutes les données Cabas locales `{ clé: valeur JSON }` (export RGPD). */
export async function readAllCabasData(): Promise<Record<string, unknown>> {
  const keys = await listCabasKeys();
  const out: Record<string, unknown> = {};
  if (keys.length === 0) return out;
  try {
    const pairs = await AsyncStorage.multiGet(keys);
    for (const [k, v] of pairs) {
      if (v == null) continue;
      try {
        out[k] = JSON.parse(v);
      } catch {
        out[k] = v;
      }
    }
  } catch {
    // stockage indisponible : export partiel
  }
  return out;
}

/** Efface toutes les données Cabas de l'appareil (suppression de compte, reset). */
export async function clearAllCabasData(): Promise<void> {
  const keys = await listCabasKeys();
  if (keys.length === 0) return;
  try {
    await AsyncStorage.multiRemove(keys);
  } catch {
    for (const k of keys) await removeKey(k);
  }
}

/**
 * Registre des stores persistés : suivi de l'hydratation (lecture
 * AsyncStorage au démarrage) et remise à zéro globale.
 *
 * Chaque store persisté :
 *  - a un champ `hydrated: boolean` (faux tant que le disque n'est pas lu) ;
 *  - s'enregistre ici via `registerPersistedStore(name, store)`.
 */
import type { StoreApi, UseBoundStore } from 'zustand';

import { STORE_VERSIONS, persistStorage, storageKey, type PersistedStoreName } from '@/lib/storage';

interface PersistApi {
  hasHydrated(): boolean;
  onFinishHydration(fn: () => void): () => void;
  rehydrate(): Promise<void> | void;
}

export type PersistedBoundStore<S extends { hydrated: boolean }> = UseBoundStore<StoreApi<S>> & { persist: PersistApi };

interface Entry {
  name: PersistedStoreName;
  persist: PersistApi;
  reset(): void;
  isHydrated(): boolean;
}

const entries = new Map<PersistedStoreName, Entry>();
const hydrationListeners = new Set<() => void>();

function notifyHydration(): void {
  for (const l of Array.from(hydrationListeners)) l();
}

/** Options `persist` communes : clé `cabas/<nom>`, version, AsyncStorage. */
export function basePersistOptions<P>(name: PersistedStoreName) {
  return {
    name: storageKey(name),
    version: STORE_VERSIONS[name],
    storage: persistStorage<P>(),
  };
}

/**
 * Enregistre un store persisté : pose `hydrated: true` dès que la lecture du
 * disque est terminée, et rend possible `resetAllStores()`.
 */
export function registerPersistedStore<S extends { hydrated: boolean }>(
  name: PersistedStoreName,
  store: PersistedBoundStore<S>,
): void {
  const mark = () => {
    if (!store.getState().hydrated) store.setState({ hydrated: true } as Partial<S>);
    notifyHydration();
  };
  store.persist.onFinishHydration(mark);
  if (store.persist.hasHydrated()) mark();
  entries.set(name, {
    name,
    persist: store.persist,
    isHydrated: () => store.persist.hasHydrated() || store.getState().hydrated,
    reset: () => {
      // L'état initial contient aussi les actions : remplacement complet.
      store.setState({ ...store.getInitialState(), hydrated: true }, true);
    },
  });
}

/** Tous les stores persistés ont lu le disque. */
export function allStoresHydrated(): boolean {
  for (const e of entries.values()) if (!e.isHydrated()) return false;
  return true;
}

export function subscribeHydration(listener: () => void): () => void {
  hydrationListeners.add(listener);
  return () => {
    hydrationListeners.delete(listener);
  };
}

/** Attend l'hydratation de tous les stores (indispensable avant d'écrire en masse, ex. seed). */
export function waitForHydration(timeoutMs = 5000): Promise<void> {
  if (allStoresHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, timeoutMs);
    const unsub = subscribeHydration(() => {
      if (allStoresHydrated()) done();
    });
    function done() {
      clearTimeout(timer);
      unsub();
      resolve();
    }
  });
}

/** Remet tous les stores persistés à leur état initial (le disque suit automatiquement). */
export function resetPersistedStores(): void {
  for (const e of entries.values()) e.reset();
}

export function registeredStoreNames(): PersistedStoreName[] {
  return Array.from(entries.keys());
}

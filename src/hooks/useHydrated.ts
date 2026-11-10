/**
 * `useHydrated()` : vrai quand TOUS les stores persistés ont relu le disque.
 * À utiliser avant d'afficher un écran qui dépend de l'état sauvegardé
 * (garde d'onboarding, planning…) pour éviter un « flash » d'état vide.
 */
import { useSyncExternalStore } from 'react';

// Importer le barrel garantit que chaque store persisté est enregistré.
import { allStoresHydrated, subscribeHydration } from '@/stores';

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeHydration, allStoresHydrated, allStoresHydrated);
}

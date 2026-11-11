/**
 * État client de Cabas — point d'entrée unique des écrans.
 *
 * Stores (zustand v5 + persist AsyncStorage `cabas/<nom>`, champ `hydrated`) :
 *  - `useProfileStore`      profil du foyer + brouillon d'onboarding (consentement RGPD)
 *  - `useSubscriptionStore` abonnement Premium (RevenueCat / magasin simulé)
 *  - `usePlanStore`         planning par semaine (génération, remplacement, verrou…)
 *  - `useListStore`         liste de courses par semaine (100 % hors-ligne)
 *  - `useBasketStore`       comparateur + panier optimisé
 *  - `useOrderStore`        commandes transmises aux enseignes
 *  - `usePantryStore`       (V2) placard & anti-gaspi
 *  - `useBudgetStore`       (V2) suivi des dépenses
 *  - `useSettingsStore`     thème, haptique, notifications, consentement analytique
 *  - `useWeekStore`         semaine affichée (non persisté)
 * Voir l'en-tête de chaque fichier pour l'API détaillée.
 *
 * Actions transverses :
 *  - `resetAllStores()` : remet TOUS les stores à zéro (mémoire + disque) ;
 *  - `addFromCheckedList(weekStart?)` : après les courses, le surplus des
 *    articles cochés rejoint le placard ;
 *  - `deleteAccount()` : suppression RGPD (serveur puis appareil) + remise à zéro ;
 *    `onAccountDeleted(fn)` prévient ensuite le démarrage (src/hooks), qui se relance ;
 *  - `startAutoSync()` / `applyPulledData()` : synchronisation Supabase (production).
 */
import { deleteMyAccount } from '@/services/account';
import { getPurchases } from '@/services/purchases';

import { useBasketStore } from './basketStore';
import { useBudgetStore } from './budgetStore';
import { useListStore } from './listStore';
import { useOrderStore } from './orderStore';
import { usePantryStore } from './pantryStore';
import { usePlanStore } from './planStore';
import { useProfileStore } from './profileStore';
import { resetPersistedStores } from './registry';
import { useSettingsStore } from './settingsStore';
import { useSubscriptionStore } from './subscriptionStore';
import { activeWeek, useWeekStore } from './weekStore';

export * from './profileStore';
export * from './subscriptionStore';
export * from './planStore';
export * from './listStore';
export * from './basketStore';
export * from './orderStore';
export * from './pantryStore';
export * from './budgetStore';
export * from './settingsStore';
export * from './weekStore';
export * from './priceWatch';
export { startAutoSync, applyPulledData } from './autoSync';
export { allStoresHydrated, subscribeHydration, waitForHydration, registeredStoreNames } from './registry';

/**
 * Remet tous les stores à leur état initial. Les stores persistés réécrivent
 * aussitôt leur état vide sur le disque. Options :
 *  - `resetSimulatedPurchases` : remet aussi le magasin simulé à zéro (essai à nouveau disponible).
 */
export async function resetAllStores(opts: { resetSimulatedPurchases?: boolean } = {}): Promise<void> {
  // Chaque store expose `reset()` : on l'appelle d'abord (effets de bord : haptique,
  // analytique, calculs en cours annulés), puis on restaure l'état initial complet.
  for (const reset of [
    useBasketStore.getState().reset,
    usePlanStore.getState().reset,
    useListStore.getState().reset,
    useOrderStore.getState().reset,
    usePantryStore.getState().reset,
    useBudgetStore.getState().reset,
    useSubscriptionStore.getState().reset,
    useSettingsStore.getState().reset,
    useProfileStore.getState().reset,
  ]) {
    reset();
  }
  resetPersistedStores();
  const week = useWeekStore.getState();
  week.refreshToday();
  week.setActiveWeek(useWeekStore.getState().currentWeekStart);
  if (opts.resetSimulatedPurchases) await getPurchases().simulated?.reset();
}

/**
 * Après les courses : le surplus des articles cochés (paquet entamé) rejoint le
 * placard. Renvoie le nombre d'articles ajoutés. Un article déjà rangé ne l'est
 * pas une seconde fois (listStore › storeLeftovers).
 */
export function addFromCheckedList(weekStart: string = activeWeek()): number {
  return useListStore.getState().storeLeftovers(weekStart);
}

const accountDeletedListeners = new Set<() => void>();

/**
 * Appelé après chaque suppression de compte réussie (appareil remis à zéro).
 * Le démarrage (`src/hooks/useAppBootstrap`) s'y abonne pour repartir de zéro :
 * nouvelle session, RevenueCat ré-identifié, synchronisation relancée.
 */
export function onAccountDeleted(listener: () => void): () => void {
  accountDeletedListeners.add(listener);
  return () => {
    accountDeletedListeners.delete(listener);
  };
}

/**
 * Suppression du compte (RGPD art. 17) : serveur (production) puis appareil.
 * Lève une erreur lisible (FR) si le serveur refuse : rien n'est alors effacé.
 */
export async function deleteAccount(): Promise<void> {
  await deleteMyAccount();
  await resetAllStores({ resetSimulatedPurchases: true });
  for (const l of Array.from(accountDeletedListeners)) l();
}

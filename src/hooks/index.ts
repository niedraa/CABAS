/**
 * Hooks applicatifs partagés par les écrans.
 *  - `useAppBootstrap()` → `{ ready, session, error }` (une fois, dans le layout racine) ;
 *    `restartBootstrap()` relance tout (fait automatiquement après une suppression de compte)
 *  - `useHydrated()` → tous les stores persistés relus
 *  - `useEntitlement()` → 'free' | 'premium' ; `useSubscription()` → détails + `canUse(feature)`
 *  - `useCurrentWeek()` → semaine affichée + navigation semaine en cours / suivante
 */
export {
  useAppBootstrap,
  bootstrapApp,
  restartBootstrap,
  whenSessionReady,
  type AppBootstrapState,
  type BootstrapResult,
} from './useAppBootstrap';
export { useHydrated } from './useHydrated';
export { useEntitlement, useSubscription, type SubscriptionInfo } from './useEntitlement';
export { useCurrentWeek, type CurrentWeek } from './useCurrentWeek';

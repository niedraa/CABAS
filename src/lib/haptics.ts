/**
 * Retours haptiques de Cabas — une seule porte d'entrée vers `expo-haptics`.
 *
 * Carte des usages (voir docs/brand/README.md § Haptique) :
 * - `tap()`      : appui sur un bouton / une carte pressable (impact léger)
 * - `select()`   : changement de valeur (puce, segment, stepper, interrupteur)
 * - `success()`  : action aboutie (liste générée, commande prête, article coché)
 * - `warning()`  : action à confirmer, limite atteinte (plan gratuit, stepper en butée)
 * - `error()`    : échec (réseau, validation)
 *
 * Toutes les fonctions sont « fire and forget » : elles ne lèvent jamais
 * d'erreur et ne font rien sur le web ou si l'utilisateur a coupé les vibrations.
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

let enabled = true;

/** Active / désactive globalement les retours haptiques (réglage utilisateur). */
export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

/** État courant du réglage (utile pour les tests et l'écran Réglages). */
export function isHapticsEnabled(): boolean {
  return enabled;
}

/** Vrai si une vibration doit réellement être émise. */
function canVibrate(): boolean {
  return enabled && Platform.OS !== 'web';
}

/** Ignore silencieusement les échecs (appareil sans moteur haptique, etc.). */
function fire(run: () => Promise<void>): void {
  if (!canVibrate()) return;
  try {
    run().catch(() => undefined);
  } catch {
    // Module natif indisponible : on ne casse jamais l'interface pour une vibration.
  }
}

/** Appui sur un élément pressable. */
export function tap(): void {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Appui « appuyé » (FAB, CTA principal, glisser-déposer). */
export function impact(): void {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** Changement de sélection (puce, segment, stepper…). */
export function select(): void {
  fire(() => Haptics.selectionAsync());
}

/** Réussite d'une action significative. */
export function success(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Avertissement (limite atteinte, confirmation requise). */
export function warning(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

/** Erreur. */
export function error(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

/** Espace de noms pratique : `haptics.tap()`. */
export const haptics = { tap, impact, select, success, warning, error };
export default haptics;

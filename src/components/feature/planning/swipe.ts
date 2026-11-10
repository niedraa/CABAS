/**
 * Logique pure du « glisser pour remplacer » d'une carte repas.
 *
 * Toutes les fonctions sont des worklets (exécutables sur le thread UI par
 * Reanimated) ET des fonctions JS ordinaires (tests unitaires).
 */

/** Distance minimale (pt) avant que le geste horizontal ne s'active. */
export const SWIPE_ACTIVATION_PX = 12;
/** Seuil minimal / maximal de déclenchement (pt). */
export const SWIPE_MIN_THRESHOLD = 96;
export const SWIPE_MAX_THRESHOLD = 150;
/** Part de la largeur de la carte à franchir pour remplacer. */
export const SWIPE_THRESHOLD_RATIO = 0.36;
/** Vitesse (pt/s) d'un « coup sec » qui suffit à remplacer à mi-course. */
export const SWIPE_FLICK_VELOCITY = 900;

/** Seuil de déclenchement pour une carte de largeur `width`. */
export function swipeThreshold(width: number): number {
  'worklet';
  const w = Number.isFinite(width) && width > 0 ? width : 0;
  return Math.min(SWIPE_MAX_THRESHOLD, Math.max(SWIPE_MIN_THRESHOLD, w * SWIPE_THRESHOLD_RATIO));
}

/**
 * Le relâchement déclenche-t-il le remplacement ?
 * - vers la gauche uniquement ;
 * - au-delà du seuil, ou coup sec rapide après 40 % du seuil.
 */
export function shouldSwapOnRelease(translationX: number, velocityX: number, width: number): boolean {
  'worklet';
  if (!(translationX < 0)) return false;
  const th = swipeThreshold(width);
  const distance = -translationX;
  if (distance >= th) return true;
  return velocityX <= -SWIPE_FLICK_VELOCITY && distance >= th * 0.4;
}

/** Avancement 0 → 1 vers le seuil (pour l'arrière-plan « Remplacer »). */
export function swipeProgress(translationX: number, width: number): number {
  'worklet';
  if (!(translationX < 0)) return 0;
  return Math.min(1, -translationX / swipeThreshold(width));
}

/**
 * Déplacement affiché pour un déplacement du doigt : libre vers la gauche
 * jusqu'au seuil puis élastique, très freiné vers la droite (aucune action).
 */
export function dampenSwipe(translationX: number, width: number): number {
  'worklet';
  if (!Number.isFinite(translationX)) return 0;
  if (translationX > 0) return Math.min(24, translationX * 0.15);
  const th = swipeThreshold(width);
  const d = -translationX;
  if (d <= th) return translationX;
  // Au-delà du seuil : la carte résiste (élasticité logarithmique).
  return -(th + Math.log1p((d - th) / 40) * 40);
}

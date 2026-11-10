/**
 * Logique pure du « glisser pour retirer » d'une ligne (liste, placard).
 * Worklets ET fonctions JS ordinaires (tests unitaires).
 */

/** Distance minimale (pt) avant que le geste horizontal ne s'active. */
export const ROW_SWIPE_ACTIVATION_PX = 14;
export const ROW_SWIPE_MIN_THRESHOLD = 88;
export const ROW_SWIPE_MAX_THRESHOLD = 140;
/** Part de la largeur de la ligne à franchir pour retirer. */
export const ROW_SWIPE_RATIO = 0.32;
/** Vitesse (pt/s) d'un coup sec qui suffit à mi-course. */
export const ROW_SWIPE_FLICK_VELOCITY = 1000;

export function rowSwipeThreshold(width: number): number {
  'worklet';
  const w = Number.isFinite(width) && width > 0 ? width : 0;
  return Math.min(ROW_SWIPE_MAX_THRESHOLD, Math.max(ROW_SWIPE_MIN_THRESHOLD, w * ROW_SWIPE_RATIO));
}

/** Avancement 0 → 1 vers le seuil (arrière-plan « Retirer »). */
export function rowSwipeProgress(translationX: number, width: number): number {
  'worklet';
  if (!(translationX < 0)) return 0;
  return Math.min(1, -translationX / rowSwipeThreshold(width));
}

/** Le relâchement retire-t-il la ligne ? Vers la gauche, au-delà du seuil ou coup sec après 45 %. */
export function shouldRemoveOnRelease(translationX: number, velocityX: number, width: number): boolean {
  'worklet';
  if (!(translationX < 0)) return false;
  const th = rowSwipeThreshold(width);
  const d = -translationX;
  if (d >= th) return true;
  return velocityX <= -ROW_SWIPE_FLICK_VELOCITY && d >= th * 0.45;
}

/** Déplacement affiché : libre vers la gauche (élastique au-delà de la largeur), bloqué vers la droite. */
export function dampenRowSwipe(translationX: number, width: number): number {
  'worklet';
  if (!Number.isFinite(translationX) || translationX >= 0) return 0;
  const limit = Number.isFinite(width) && width > 0 ? width : rowSwipeThreshold(width) * 2;
  const d = -translationX;
  if (d <= limit) return translationX;
  return -(limit + Math.log1p((d - limit) / 40) * 40);
}

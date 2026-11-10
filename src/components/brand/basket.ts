/**
 * Géométrie du panier Cabas (viewBox 0 0 120 120).
 * Source unique de la marque — synchronisée avec
 * `scripts/generate-brand-assets.mjs` et `docs/brand/*.svg`.
 *
 * Fidèle au dossier PENRA :
 *   anse   : arche crème/forêt (trait 10, extrémités rondes)
 *   corps  : trapèze moutarde aux coins inférieurs adoucis
 *   fentes : 3 fentes verticales fines, vert forêt
 */
export const BASKET_VIEWBOX = '0 0 120 120';

export const basketGeometry = {
  handle: 'M33 60 V52 A27 27 0 0 1 87 52 V60',
  handleStroke: 10,
  body: 'M15 58 Q14 58 14.3 59.2 L24.6 103.2 Q25.3 106 28.2 106 H91.8 Q94.7 106 95.4 103.2 L105.7 59.2 Q106 58 105 58 Z',
  slots: [
    { x: 45, y: 70, width: 6, height: 26, rx: 3 },
    { x: 57, y: 70, width: 6, height: 26, rx: 3 },
    { x: 69, y: 70, width: 6, height: 26, rx: 3 },
  ],
} as const;

/** Corps + fentes en un seul tracé (règle evenodd) pour la version monochrome. */
export const basketBodyWithHoles =
  basketGeometry.body +
  ' ' +
  basketGeometry.slots
    .map(
      (s) =>
        `M${s.x + s.rx} ${s.y} H${s.x + s.width - s.rx} A${s.rx} ${s.rx} 0 0 1 ${s.x + s.width} ${s.y + s.rx} V${s.y + s.height - s.rx} A${s.rx} ${s.rx} 0 0 1 ${s.x + s.width - s.rx} ${s.y + s.height} H${s.x + s.rx} A${s.rx} ${s.rx} 0 0 1 ${s.x} ${s.y + s.height - s.rx} V${s.y + s.rx} A${s.rx} ${s.rx} 0 0 1 ${s.x + s.rx} ${s.y} Z`,
    )
    .join(' ');

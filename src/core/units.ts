/**
 * Conversion et formatage des quantités.
 *
 * Toute quantité est normalisée dans une unité de base (g, ml ou pièce).
 * Les unités « de cuisine » ont des équivalences par défaut :
 * c. à soupe = 15 ml, c. à café = 5 ml, pincée = 0,5 g ;
 * gousse / botte / tranche / sachet / boîte comptent comme des pièces.
 */
import type { BaseUnit, Ingredient, Unit } from './types';
import { capitalize, deOrElided, lowerFirst, pluralize } from './text';

/** Facteur et unité de base « brute » de chaque unité de recette. */
const RAW: Record<Unit, { factor: number; unit: BaseUnit }> = {
  g: { factor: 1, unit: 'g' },
  kg: { factor: 1000, unit: 'g' },
  ml: { factor: 1, unit: 'ml' },
  cl: { factor: 10, unit: 'ml' },
  l: { factor: 1000, unit: 'ml' },
  cs: { factor: 15, unit: 'ml' },
  cc: { factor: 5, unit: 'ml' },
  pincee: { factor: 0.5, unit: 'g' },
  piece: { factor: 1, unit: 'piece' },
  gousse: { factor: 1, unit: 'piece' },
  botte: { factor: 1, unit: 'piece' },
  tranche: { factor: 1, unit: 'piece' },
  sachet: { factor: 1, unit: 'piece' },
  boite: { factor: 1, unit: 'piece' },
};

/** Unités qui se comptent (arrondies à la demi-unité lors des mises à l'échelle). */
export const COUNT_UNITS: readonly Unit[] = ['piece', 'gousse', 'botte', 'tranche', 'sachet', 'boite'];

export function isCountUnit(unit: Unit): boolean {
  return COUNT_UNITS.includes(unit);
}

/** Arrondi flottant propre (supprime le bruit 0,1 + 0,2). */
export function roundTo(x: number, decimals = 6): number {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}

/**
 * Convertit entre unités de base. g ↔ ml via la densité (1 par défaut) ;
 * pièce ↔ g/ml seulement si `gramsPerPiece` est connu. Renvoie null sinon.
 */
export function convertBase(
  q: number,
  from: BaseUnit,
  to: BaseUnit,
  ingredient?: Partial<Ingredient>,
): number | null {
  if (from === to) return q;
  const density = ingredient?.density && ingredient.density > 0 ? ingredient.density : 1;
  const gpp = ingredient?.gramsPerPiece && ingredient.gramsPerPiece > 0 ? ingredient.gramsPerPiece : undefined;
  // On passe toujours par les grammes.
  let grams: number;
  if (from === 'g') grams = q;
  else if (from === 'ml') grams = q * density;
  else if (gpp !== undefined) grams = q * gpp;
  else return null;

  if (to === 'g') return roundTo(grams);
  if (to === 'ml') return roundTo(grams / density);
  return gpp !== undefined ? roundTo(grams / gpp) : null;
}

/**
 * Normalise une quantité de recette dans l'unité de base. Si l'ingrédient
 * précise son unité de base (celle de la liste de courses), on s'y ramène
 * quand c'est possible (densité, poids moyen d'une pièce).
 */
export function toBase(
  quantity: number,
  unit: Unit,
  ingredient?: Partial<Ingredient>,
): { quantity: number; unit: BaseUnit } {
  const raw = RAW[unit] ?? RAW.piece;
  const q = roundTo(quantity * raw.factor);
  const target = ingredient?.baseUnit;
  if (target && target !== raw.unit) {
    const converted = convertBase(q, raw.unit, target, ingredient);
    if (converted !== null) return { quantity: converted, unit: target };
  }
  return { quantity: q, unit: raw.unit };
}

// ─── Formatage ───────────────────────────────────────────────────────────────

/** Nombre → texte français (virgule, décimales inutiles supprimées). */
export function formatNumberFr(n: number, maxDecimals = 1): string {
  const r = roundTo(n, maxDecimals);
  return String(r).replace('.', ',');
}

const FRACTIONS: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' };

/** Pièces : « 3 », « ½ », « 1½ » (au quart près, entier au-delà de 10). */
export function formatPieces(q: number): string {
  if (q >= 10) return String(Math.round(q));
  let whole = Math.floor(q);
  let frac = Math.round((q - whole) * 4) / 4;
  if (frac === 1) {
    whole += 1;
    frac = 0;
  }
  const glyph = FRACTIONS[frac] ?? '';
  if (whole === 0) return glyph || '0';
  return `${whole}${glyph}`;
}

/** Arrondi « humain » des masses / volumes : au 5 près au-delà de 50. */
function roundHuman(q: number): number {
  if (q > 50) return Math.round(q / 5) * 5;
  if (q >= 10) return Math.round(q);
  return roundTo(q, 1);
}

const UNIT_LABELS: Record<Unit, [string, string]> = {
  g: ['g', 'g'],
  kg: ['kg', 'kg'],
  ml: ['ml', 'ml'],
  cl: ['cl', 'cl'],
  l: ['l', 'l'],
  piece: ['', ''],
  cs: ['c. à s.', 'c. à s.'],
  cc: ['c. à c.', 'c. à c.'],
  pincee: ['pincée', 'pincées'],
  botte: ['botte', 'bottes'],
  gousse: ['gousse', 'gousses'],
  tranche: ['tranche', 'tranches'],
  sachet: ['sachet', 'sachets'],
  boite: ['boîte', 'boîtes'],
};

/** Libellé d'unité accordé : « pincée » / « pincées », « c. à s. »… (vide pour pièce). */
export function unitLabel(unit: Unit, q = 1): string {
  const labels = UNIT_LABELS[unit] ?? UNIT_LABELS.piece;
  return Math.abs(q) >= 2 ? labels[1] : labels[0];
}

/**
 * Quantité + unité lisible : « 1,5 kg », « 250 g », « 75 cl », « 15 ml », « 3 ».
 * Les g ≥ 1000 passent en kg, les ml ≥ 1000 en l, les ml multiples de 10 en cl.
 */
export function formatQuantity(q: number, unit: Unit): string {
  const raw = RAW[unit] ?? RAW.piece;
  if (unit === 'g' || unit === 'kg') {
    const g = roundHuman(q * raw.factor);
    if (g >= 1000) return `${formatNumberFr(q * raw.factor / 1000, 1)} kg`;
    return `${formatNumberFr(g)} g`;
  }
  if (unit === 'ml' || unit === 'cl' || unit === 'l') {
    const ml = roundHuman(q * raw.factor);
    if (ml >= 1000) return `${formatNumberFr(q * raw.factor / 1000, 1)} l`;
    if (ml >= 10 && ml % 10 === 0) return `${formatNumberFr(ml / 10)} cl`;
    return `${formatNumberFr(ml)} ml`;
  }
  if (unit === 'piece') return formatPieces(q);
  const n = isCountUnit(unit) ? formatPieces(q) : formatNumberFr(q, 1);
  return `${n} ${unitLabel(unit, q)}`;
}

/** Seuil sous lequel une masse s'affiche en pincées (g). */
const PINCH_THRESHOLD_G = 1.5;

/**
 * Ligne d'ingrédient en français naturel :
 * « 3 oignons », « 1 oignon », « ½ citron », « 250 g de farine »,
 * « 20 cl d'huile d'olive », « 2 gousses d'ail », « 1 pincée de sel ».
 */
export function formatIngredientLine(q: number, unit: Unit, ingredient: Partial<Ingredient>): string {
  const name = lowerFirst(ingredient.name ?? '');
  if (!Number.isFinite(q) || q <= 0) return capitalize(name);
  const plural = ingredient.namePlural ? lowerFirst(ingredient.namePlural) : pluralize(name);

  if (unit === 'piece') {
    return `${formatPieces(q)} ${q >= 2 ? plural : name}`.trim();
  }

  const raw = RAW[unit] ?? RAW.piece;
  const isMassOrVolume = unit === 'g' || unit === 'kg' || unit === 'ml' || unit === 'cl' || unit === 'l';
  if (unit === 'pincee' || (raw.unit === 'g' && isMassOrVolume && q * raw.factor < PINCH_THRESHOLD_G)) {
    const pinches = unit === 'pincee' ? Math.max(1, Math.round(q)) : Math.max(1, Math.round((q * raw.factor) / 0.5));
    return `${pinches} ${unitLabel('pincee', pinches)} ${deOrElided(name)}`;
  }
  // Masse/volume (« 250 g de farine ») ou unités de cuisine / de comptage
  // (« 2 c. à s. d'huile », « 2 gousses d'ail ») : même construction.
  return `${formatQuantity(q, unit)} ${deOrElided(name)}`;
}

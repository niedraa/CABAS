/**
 * Montants en centimes entiers → texte français.
 * Typographie : espace fine insécable (U+202F) avant « € » et comme
 * séparateur de milliers, virgule décimale. Ex. « 1 234,50 € ».
 */

/** Espace fine insécable (U+202F). */
export const NNBSP = ' ';
/** Signe moins typographique (U+2212), lu « moins » par les lecteurs d'écran. */
export const MINUS = '−';

export interface FormatPriceOptions {
  /** Affiche « + » devant les montants positifs (variations, économies). */
  signed?: boolean;
  /** Supprime « ,00 » pour les montants ronds : « 5 € ». */
  compact?: boolean;
}

/** Groupe les milliers d'un entier positif avec U+202F. */
function groupThousands(n: number): string {
  const s = String(n);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += NNBSP;
    out += s[i];
  }
  return out;
}

/** Centimes → « 4,99 € ». */
export function formatPrice(cents: number, opts: FormatPriceOptions = {}): string {
  const rounded = Math.round(Number.isFinite(cents) ? cents : 0);
  const abs = Math.abs(rounded);
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;
  const decimals = opts.compact && rest === 0 ? '' : `,${rest < 10 ? '0' : ''}${rest}`;
  let sign = '';
  if (rounded < 0) sign = MINUS;
  else if (opts.signed && rounded > 0) sign = '+';
  return `${sign}${groupThousands(euros)}${decimals}${NNBSP}€`;
}

export type PriceReferenceUnit = 'kg' | 'l' | 'piece';

const REF_LABEL: Record<PriceReferenceUnit, string> = { kg: 'kg', l: 'L', piece: 'pièce' };

/** Prix de référence : « 3,20 €/kg », « 1,15 €/L », « 0,45 €/pièce ». */
export function formatPricePerUnit(cents: number, ref: PriceReferenceUnit): string {
  return `${formatPrice(cents)}/${REF_LABEL[ref]}`;
}

/** Somme de centimes (ignore les valeurs non finies). */
export function sumCents(xs: readonly number[]): number {
  let total = 0;
  for (const x of xs) if (Number.isFinite(x)) total += x;
  return Math.round(total);
}

/** Pourcentage entier arrondi de a par rapport à b (0 si b = 0). */
export function percent(a: number, b: number): number {
  if (!b || !Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((a / b) * 100);
}

/** Euros saisis (« 4,99 », « 12 », « 1 234,5 € ») → centimes, ou null si illisible. */
export function parsePriceToCents(input: string): number | null {
  const cleaned = input.replace(/[\s  €]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

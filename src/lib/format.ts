/**
 * Formatage d'affichage pour le kit UI.
 *
 * Volontairement autonome (le kit UI ne dépend que du thème) mais aligné à
 * l'octet près sur `core/money.ts` : virgule décimale, espace fine insécable
 * (U+202F) avant « € » et entre les milliers, signe moins typographique (U+2212).
 */

/** Espace fine insécable (U+202F). */
export const NNBSP = ' ';
/** Signe moins typographique (U+2212). */
export const MINUS = '−';

export interface FormatCentsOptions {
  /** « + » devant les montants positifs (économies, variations). */
  signed?: boolean;
  /** « 5 € » au lieu de « 5,00 € » pour les montants ronds. */
  compact?: boolean;
  /** Masque le symbole « € » (colonnes alignées, prix détaillés). */
  hideCurrency?: boolean;
}

function groupThousands(n: number): string {
  const s = String(n);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += NNBSP;
    out += s[i];
  }
  return out;
}

/** Décompose un montant en parties (utile pour styler euros / centimes séparément). */
export function splitCents(cents: number): { sign: '' | '-' ; euros: string; decimals: string } {
  const rounded = Math.round(Number.isFinite(cents) ? cents : 0);
  const abs = Math.abs(rounded);
  const rest = abs % 100;
  return {
    sign: rounded < 0 ? '-' : '',
    euros: groupThousands(Math.floor(abs / 100)),
    decimals: `${rest < 10 ? '0' : ''}${rest}`,
  };
}

/** Centimes → « 4,99 € » (« 1 234,50 € », « −2,00 € »). */
export function formatCents(cents: number, opts: FormatCentsOptions = {}): string {
  const rounded = Math.round(Number.isFinite(cents) ? cents : 0);
  const { euros, decimals } = splitCents(rounded);
  const dec = opts.compact && decimals === '00' ? '' : `,${decimals}`;
  let sign = '';
  if (rounded < 0) sign = MINUS;
  else if (opts.signed && rounded > 0) sign = '+';
  const currency = opts.hideCurrency ? '' : `${NNBSP}€`;
  return `${sign}${euros}${dec}${currency}`;
}

/** Prix de référence « 3,20 €/kg ». */
export function formatCentsPerUnit(cents: number, unit: 'kg' | 'l' | 'piece'): string {
  const label = unit === 'kg' ? 'kg' : unit === 'l' ? 'L' : 'pièce';
  return `${formatCents(cents)}/${label}`;
}

/** Pourcentage de remise « −12 % » (arrondi entier). */
export function formatDiscount(oldCents: number, newCents: number): string {
  if (oldCents <= 0 || newCents >= oldCents) return '';
  const pct = Math.round(((oldCents - newCents) / oldCents) * 100);
  return `${MINUS}${pct}${NNBSP}%`;
}

/** Initiales d'un nom (« Camille Martin » → « CM »), 1 à 2 lettres. */
export function initialsOf(name: string, max = 2): string {
  const parts = name
    .trim()
    .split(/[\s\-_.]+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, Math.min(max, 1)).toUpperCase();
  return parts
    .slice(0, max)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

// GENERATED — do not edit.
// Copie générée de src/core par scripts/sync-shared.mjs (npm run sync:shared).
// Toute modification doit être faite dans src/core puis resynchronisée.
/**
 * Petits utilitaires de texte français, sans dépendre d'Intl ni de
 * String.prototype.normalize (indisponible selon les builds Hermes).
 */

const ACCENTS: Record<string, string> = {
  à: 'a', á: 'a', â: 'a', ä: 'a', ã: 'a', å: 'a',
  ç: 'c',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ñ: 'n',
  ó: 'o', ò: 'o', ô: 'o', ö: 'o', õ: 'o',
  ú: 'u', ù: 'u', û: 'u', ü: 'u',
  ý: 'y', ÿ: 'y',
  œ: 'oe', æ: 'ae',
};

/** Minuscules sans accents : « Crème Fraîche » → « creme fraiche ». */
export function foldText(s: string): string {
  const lower = s.toLowerCase();
  let out = '';
  for (const ch of lower) out += ACCENTS[ch] ?? ch;
  return out;
}

/** Comparaison alphabétique française stable (insensible casse/accents). */
export function compareFr(a: string, b: string): number {
  const fa = foldText(a);
  const fb = foldText(b);
  if (fa < fb) return -1;
  if (fa > fb) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Majuscule initiale. */
export function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Minuscule initiale, sauf sigle/nom propre (« AOP », « McDo »). */
export function lowerFirst(s: string): string {
  if (s.length < 2) return s.toLowerCase();
  const second = s[1];
  if (second !== second.toLowerCase()) return s; // sigle : on ne touche pas
  return s[0].toLowerCase() + s.slice(1);
}

/** Énumération française : « a, b et c ». */
export function joinFr(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

/**
 * Mots commençant par un h muet courants en cuisine (élision « d'huile »).
 * Liste blanche volontaire : « haricot », « hachis », « homard »… ont un
 * h aspiré (« de haricots ») et ne sont donc pas élidés.
 */
const H_MUET = ['huile', 'huitre', 'herbe', 'hysope'];

/** Vrai si le mot commence par une voyelle ou un h muet (« d'oignon », « d'huile »). */
export function startsWithVowelSound(word: string): boolean {
  const f = foldText(word.trim());
  if (!f) return false;
  if (/^[aeiou]/.test(f)) return true;
  return H_MUET.some((w) => f.startsWith(w));
}

/** « de » ou « d' » selon le mot qui suit. */
export function deOrElided(word: string): string {
  return startsWithVowelSound(word) ? `d'${word}` : `de ${word}`;
}

/** Pluriel d'un mot isolé (règles usuelles + exceptions courantes). */
export function pluralizeWord(word: string): string {
  const w = word;
  const f = foldText(w);
  if (/[sxz]$/.test(f)) return w;
  if (['bijou', 'caillou', 'chou', 'genou', 'hibou', 'joujou', 'pou'].includes(f)) return `${w}x`;
  if (/(eau|au|eu)$/.test(f) && !['pneu', 'bleu'].includes(f)) return `${w}x`;
  if (/al$/.test(f) && !['bal', 'carnaval', 'festival', 'chacal', 'regal'].includes(f)) {
    return `${w.slice(0, -2)}aux`;
  }
  return `${w}s`;
}

/**
 * Pluriel d'un nom (éventuellement composé) selon la quantité.
 * Règle française : pluriel à partir de 2 (« 1,5 oignon », « 2 oignons »).
 * « pomme de terre » → « pommes de terre » ; « chou-fleur » → « choux-fleurs ».
 */
export function pluralize(name: string, count = 2): string {
  if (Math.abs(count) < 2) return name;
  const m = /^(\S+?)(\s+(?:de|d'|à|au|aux|en)\b.*)$/.exec(name);
  if (m) return pluralizeWord(m[1]) + m[2];
  if (name.includes('-') && !name.includes(' ')) {
    return name
      .split('-')
      .map((p) => pluralizeWord(p))
      .join('-');
  }
  const words = name.split(' ');
  // « tomate cerise » → « tomates cerises » ; on accorde le premier mot et
  // les adjectifs simples qui suivent.
  return words.map((p, i) => (i === 0 || /^[a-zà-ÿ]+$/.test(p) ? pluralizeWord(p) : p)).join(' ');
}

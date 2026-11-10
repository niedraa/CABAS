/**
 * Aides d'accessibilité : textes lus par VoiceOver / TalkBack.
 *
 * Les lecteurs d'écran lisent mal « 4,99 € » (« 4 virgule 99 euro ») : on
 * fournit des libellés explicites (« 4 euros 99 »), pluriels compris.
 */
import { AccessibilityInfo, Platform } from 'react-native';

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${Math.abs(n) >= 2 ? pluralForm : singular}`;
}

/** 499 → « 4 euros 99 » ; 500 → « 5 euros » ; 45 → « 45 centimes » ; −120 → « moins 1 euro 20 ». */
export function formatPriceForA11y(cents: number): string {
  const rounded = Math.round(Number.isFinite(cents) ? cents : 0);
  const abs = Math.abs(rounded);
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;
  const sign = rounded < 0 ? 'moins ' : '';
  if (euros === 0) return `${sign}${plural(rest, 'centime')}`;
  const e = plural(euros, 'euro');
  return rest === 0 ? `${sign}${e}` : `${sign}${e} ${rest}`;
}

/** Libellé d'un prix barré : « 3 euros 49 au lieu de 3 euros 99 ». */
export function formatPriceChangeForA11y(cents: number, oldCents?: number | null): string {
  const now = formatPriceForA11y(cents);
  if (oldCents == null || oldCents === cents) return now;
  return `${now} au lieu de ${formatPriceForA11y(oldCents)}`;
}

/** « 3 portions », « 1 article ». */
export function countLabel(n: number, singular: string, pluralForm?: string): string {
  return plural(n, singular, pluralForm);
}

/** Durée en minutes → « 1 heure 15 minutes ». */
export function formatDurationForA11y(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return plural(r, 'minute');
  return r === 0 ? plural(h, 'heure') : `${plural(h, 'heure')} ${plural(r, 'minute')}`;
}

/** Pourcentage de progression → « 40 pour cent ». */
export function formatPercentForA11y(ratio: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return `${pct} pour cent`;
}

/** Annonce un message aux lecteurs d'écran (toasts, résultats de recherche). */
export function announce(message: string): void {
  if (!message) return;
  try {
    if (Platform.OS === 'web') return;
    AccessibilityInfo.announceForAccessibility(message);
  } catch {
    // Pas de lecteur d'écran disponible : rien à faire.
  }
}

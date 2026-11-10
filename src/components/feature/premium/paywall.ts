/**
 * Logique pure du paywall et du statut d'abonnement (aucun composant ici) :
 * fonctionnalité mise en avant (`?feature=`), offres affichées (prix localisés
 * du store, repli sur la grille tarifaire), libellés du CTA et des mentions,
 * statut « Gratuit / Essai / Premium » et ses dates.
 */
import type { Feature, SubscriptionState } from '@/core';
import {
  FREE_TIER,
  formatDayLabel,
  formatPrice,
  PREMIUM_FEATURES,
  PREMIUM_PRICING,
  todayISO,
  yearlySavingsPercent,
} from '@/core';
import type { NormalizedOfferings, NormalizedPackage, PackageId } from '@/services/purchases';

// ─── Fonctionnalité d'origine ────────────────────────────────────────────────

/** `?feature=optimized_basket` → fonctionnalité Premium connue, sinon null. */
export function parseFeatureParam(value: unknown): Feature | null {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === 'string' && (PREMIUM_FEATURES as readonly string[]).includes(v) ? (v as Feature) : null;
}

/** Lien vers le paywall, avec la fonctionnalité d'origine (`/premium?feature=…`). */
export function premiumHref(feature?: Feature | null): string {
  return feature ? `/premium?feature=${encodeURIComponent(feature)}` : '/premium';
}

/** Bénéfices dans l'ordre du paywall, la fonctionnalité d'origine en tête. */
export function orderedFeatures(highlight: Feature | null): Feature[] {
  const all = [...PREMIUM_FEATURES];
  if (!highlight || !all.includes(highlight)) return all;
  return [highlight, ...all.filter((f) => f !== highlight)];
}

/** Accroche du héros selon la fonctionnalité d'origine (titre ≤ 5 mots). */
const FEATURE_HEADLINES: Record<Feature, string> = {
  unlimited_planning: 'Planifie toute ta semaine',
  advanced_personalization: 'Des menus vraiment à toi',
  optimized_basket: 'Paie tes courses moins cher',
  one_click_order: 'Ta commande en un clic',
  price_alerts: 'Ne rate plus une promo',
  budget_tracking: 'Garde l’œil sur ton budget',
  pantry: 'Rien ne se perd',
};

/** Titre et sous-titre du héros (adaptés à la fonctionnalité d'origine). */
export function paywallHeadline(feature: Feature | null): { title: string; subtitle: string } {
  const trial = `${PREMIUM_PRICING.trialDays} jours pour essayer, sans engagement.`;
  if (feature && FEATURE_HEADLINES[feature]) {
    return { title: FEATURE_HEADLINES[feature], subtitle: `Avec Premium, tout Cabas est à toi. ${trial}` };
  }
  return {
    title: 'Tes courses, sans limite',
    subtitle: `Toute ta semaine planifiée, le panier le moins cher et ta commande prête en un clic. ${trial}`,
  };
}

// ─── Offres ──────────────────────────────────────────────────────────────────

export interface PlanOptionView {
  id: PackageId;
  title: string;
  /** « 39,99 €/an ». */
  price: string;
  /** « soit 3,33 €/mois » (annuel) ou phrase courte (mensuel). */
  detail: string;
  /** « −33 % » (annuel uniquement). */
  badge: string | null;
  /** « 7 jours d'essai gratuit », ou null si l'essai a déjà servi. */
  trial: string | null;
  trialDays: number | null;
  /** Vrai si le prix vient du store (sinon grille tarifaire de repli). */
  fromStore: boolean;
}

const PERIOD_SUFFIX: Record<PackageId, string> = { monthly: '/mois', annual: '/an' };

/** Vue d'une offre à partir du package normalisé (repli : grille PREMIUM_PRICING). */
export function planOptionView(id: PackageId, pkg: NormalizedPackage | null): PlanOptionView {
  const fallbackCents = id === 'annual' ? PREMIUM_PRICING.yearlyCents : PREMIUM_PRICING.monthlyCents;
  const priceString = pkg?.priceString ?? formatPrice(fallbackCents);
  const perMonth =
    id === 'annual' ? (pkg?.pricePerMonthString ?? formatPrice(Math.round(PREMIUM_PRICING.yearlyCents / 12))) : null;
  return {
    id,
    title: id === 'annual' ? 'Annuel' : 'Mensuel',
    price: `${priceString}${PERIOD_SUFFIX[id]}`,
    detail: perMonth ? `soit ${perMonth}/mois` : 'Sans engagement',
    badge: id === 'annual' ? `−${yearlySavingsPercent()} %` : null,
    trial: pkg ? (pkg.trial?.label ?? null) : null,
    trialDays: pkg?.trial?.days ?? null,
    fromStore: !!pkg,
  };
}

/** Les deux offres, annuelle d'abord (la plus avantageuse). */
export function planOptions(offerings: NormalizedOfferings | null): PlanOptionView[] {
  return [planOptionView('annual', offerings?.annual ?? null), planOptionView('monthly', offerings?.monthly ?? null)];
}

/**
 * Jours d'essai offerts à cet utilisateur : ceux du store une fois les offres
 * chargées (null si l'essai a déjà servi), sinon la durée standard.
 */
export function offeredTrialDays(offerings: NormalizedOfferings | null): number | null {
  if (!offerings) return PREMIUM_PRICING.trialDays;
  return offerings.annual?.trial?.days ?? offerings.monthly?.trial?.days ?? null;
}

/** Offre présélectionnée : l'annuelle si elle existe, sinon la mensuelle. */
export function defaultPackage(offerings: NormalizedOfferings | null): PackageId {
  if (offerings && !offerings.annual && offerings.monthly) return 'monthly';
  return 'annual';
}

/** Libellé du bouton d'achat. */
export function purchaseCtaLabel(option: PlanOptionView): string {
  if (option.trialDays) return `Essayer ${option.trialDays} jours gratuits`;
  return `Passer à Premium · ${option.price}`;
}

/** Mentions sous le bouton d'achat (renouvellement automatique, résiliation). */
export function purchaseLegalText(option: PlanOptionView): string {
  const then = option.trialDays
    ? `Gratuit pendant ${option.trialDays} jours, puis ${option.price}.`
    : `${option.price}, débité à la confirmation.`;
  return `${then} Renouvellement automatique, résiliable à tout moment depuis ton store.`;
}

// ─── Statut d'abonnement ─────────────────────────────────────────────────────

export type SubscriptionKind = 'free' | 'trial' | 'premium';

export interface SubscriptionStatusView {
  kind: SubscriptionKind;
  /** « Gratuit », « Essai Premium », « Premium ». */
  label: string;
  /** Phrase courte : « Essai gratuit jusqu’au lundi 17 novembre ». */
  detail: string;
  /** Jour de fin (local, `YYYY-MM-DD`) ou null. */
  endDate: string | null;
  /** « Mensuel » / « Annuel » / null. */
  planName: string | null;
  willRenew: boolean;
  /** Jours restants (arrondis au supérieur) avant la fin, ou null. */
  daysLeft: number | null;
}

/** « cabas_premium_annual » → « Annuel ». */
export function planNameOf(productId: string | null | undefined): string | null {
  if (!productId) return null;
  if (/annual|year|annuel/i.test(productId)) return 'Annuel';
  if (/month|mensuel/i.test(productId)) return 'Mensuel';
  return null;
}

/** Horodatage ISO → jour local `YYYY-MM-DD` (ou null si illisible). */
export function localDayOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? todayISO(new Date(t)) : null;
}

/** « lundi 17 novembre ». */
export function formatEndDate(iso: string | null | undefined): string | null {
  const day = localDayOf(iso);
  return day ? formatDayLabel(day, 'long') : null;
}

/** Statut affichable (un Premium expiré redevient « Gratuit »). */
export function subscriptionStatus(state: SubscriptionState, nowMs: number = Date.now()): SubscriptionStatusView {
  const exp = state.expiresAt ? Date.parse(state.expiresAt) : NaN;
  const active = state.entitlement === 'premium' && (!state.expiresAt || (Number.isFinite(exp) && exp > nowMs));
  const planName = planNameOf(state.productId);
  if (!active) {
    return {
      kind: 'free',
      label: 'Gratuit',
      detail: `${FREE_TIER.maxMealsPerWeek} repas planifiés par semaine, liste et comparateur.`,
      endDate: null,
      planName: null,
      willRenew: false,
      daysLeft: null,
    };
  }
  const end = formatEndDate(state.expiresAt);
  const daysLeft = Number.isFinite(exp) ? Math.max(0, Math.ceil((exp - nowMs) / 86_400_000)) : null;
  if (state.isTrial) {
    return {
      kind: 'trial',
      label: 'Essai Premium',
      detail: end ? `Essai gratuit jusqu’au ${end}` : 'Essai gratuit en cours',
      endDate: localDayOf(state.expiresAt),
      planName,
      willRenew: state.willRenew,
      daysLeft,
    };
  }
  return {
    kind: 'premium',
    label: 'Premium',
    detail: end ? (state.willRenew ? `Se renouvelle le ${end}` : `Actif jusqu’au ${end}`) : 'Abonnement actif',
    endDate: localDayOf(state.expiresAt),
    planName,
    willRenew: state.willRenew,
    daysLeft,
  };
}

/** Phrase sur la suite de l'essai / de l'abonnement (écran Abonnement). */
export function renewalSentence(status: SubscriptionStatusView): string | null {
  if (status.kind === 'free' || !status.endDate) return null;
  const end = formatDayLabel(status.endDate, 'long');
  if (status.kind === 'trial') {
    return status.willRenew
      ? `Ton abonnement${status.planName ? ` ${status.planName.toLowerCase()}` : ''} démarrera le ${end}, sauf si tu l’annules avant.`
      : `Ton essai se termine le ${end}. Tu repasseras ensuite à l’offre gratuite.`;
  }
  return status.willRenew
    ? `Renouvellement automatique le ${end}.`
    : `Renouvellement désactivé : Premium reste actif jusqu’au ${end}.`;
}

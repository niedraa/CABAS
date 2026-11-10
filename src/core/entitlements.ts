/**
 * Gratuit vs Premium (dossier projet §02 — modèle économique).
 *
 * Gratuit : planning de 3 repas / semaine, liste automatique, comparateur
 * de prix, placard. Premium (4,99 €/mois ou 39,99 €/an) : planning illimité,
 * personnalisation avancée, panier multi-magasins optimisé, commande en un
 * clic, alertes prix, suivi du budget.
 */
import type { Entitlement } from './types';
import { FREE_TIER, PREMIUM_PRICING } from './types';
import { MAX_MEALS_PER_WEEK } from './mealEngine';
import { formatPrice } from './money';

export type Feature =
  | 'unlimited_planning'
  | 'advanced_personalization'
  | 'optimized_basket'
  | 'one_click_order'
  | 'price_alerts'
  | 'budget_tracking'
  | 'pantry';

/** Fonctionnalités incluses dans l'offre gratuite. */
export const FREE_FEATURES: readonly Feature[] = ['pantry'];

/** Ordre d'affichage sur le paywall. */
export const PREMIUM_FEATURES: readonly Feature[] = [
  'unlimited_planning',
  'optimized_basket',
  'one_click_order',
  'price_alerts',
  'budget_tracking',
  'advanced_personalization',
];

export function canUse(feature: Feature, entitlement: Entitlement): boolean {
  return entitlement === 'premium' || FREE_FEATURES.includes(feature);
}

/** Repas planifiables par semaine (gratuit 3, premium 14 = « illimité »). */
export function maxMealsPerWeek(entitlement: Entitlement): number {
  return entitlement === 'premium' ? MAX_MEALS_PER_WEEK : FREE_TIER.maxMealsPerWeek;
}

export const FEATURE_COPY: Record<Feature, { title: string; description: string }> = {
  unlimited_planning: {
    title: 'Planning illimité',
    description: 'Tous tes midis et tes soirs planifiés, pas seulement 3 repas par semaine.',
  },
  advanced_personalization: {
    title: 'Menus vraiment à ton goût',
    description: 'Cuisines préférées, ingrédients à éviter, restes à écouler : les suggestions s’adaptent à toi.',
  },
  optimized_basket: {
    title: 'Panier le moins cher',
    description: 'On répartit tes courses entre 2 magasins pour payer le moins possible, frais compris.',
  },
  one_click_order: {
    title: 'Commande en un clic',
    description: 'Ton panier drive ou livraison est prêt : il ne reste qu’à valider chez l’enseigne.',
  },
  price_alerts: {
    title: 'Alertes baisse de prix',
    description: 'Une notification dès qu’un de tes produits habituels passe en promo.',
  },
  budget_tracking: {
    title: 'Suivi du budget',
    description: 'Tes dépenses par semaine et par mois, et tout ce que Cabas t’a fait économiser.',
  },
  pantry: {
    title: 'Placard anti-gaspi',
    description: 'Note ce que tu as déjà : on le retire de ta liste et on te propose des recettes pour l’utiliser.',
  },
};

/** Économie de l'abonnement annuel vs 12 mois, en % entier (≈ 33 %). */
export function yearlySavingsPercent(): number {
  const twelveMonths = PREMIUM_PRICING.monthlyCents * 12;
  return Math.round(((twelveMonths - PREMIUM_PRICING.yearlyCents) / twelveMonths) * 100);
}

/** Libellés de prix du paywall. */
export function pricingLabels(): { monthly: string; yearly: string; yearlyPerMonth: string; trial: string } {
  return {
    monthly: `${formatPrice(PREMIUM_PRICING.monthlyCents)}/mois`,
    yearly: `${formatPrice(PREMIUM_PRICING.yearlyCents)}/an`,
    yearlyPerMonth: `soit ${formatPrice(Math.round(PREMIUM_PRICING.yearlyCents / 12))}/mois`,
    trial: `${PREMIUM_PRICING.trialDays} jours d’essai gratuit`,
  };
}

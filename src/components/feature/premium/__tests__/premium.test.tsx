import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { FEATURE_COPY, PREMIUM_FEATURES, type SubscriptionState } from '@/core';
import type { NormalizedOfferings, NormalizedPackage } from '@/services/purchases';

import { FeatureList } from '../FeatureList';
import {
  defaultPackage,
  formatEndDate,
  localDayOf,
  offeredTrialDays,
  orderedFeatures,
  parseFeatureParam,
  paywallHeadline,
  planNameOf,
  planOptions,
  planOptionView,
  premiumHref,
  purchaseCtaLabel,
  purchaseLegalText,
  renewalSentence,
  subscriptionStatus,
} from '../paywall';
import { PlanPicker } from '../PlanPicker';

const NNBSP = ' ';
const DAY = 86_400_000;

const pkg = (over: Partial<NormalizedPackage> = {}): NormalizedPackage => ({
  id: 'annual',
  identifier: '$rc_annual',
  productId: 'cabas_premium_annual',
  priceString: `39,99${NNBSP}€`,
  priceCents: 3999,
  pricePerMonthString: `3,33${NNBSP}€`,
  period: 'year',
  trial: { days: 7, label: '7 jours d’essai gratuit' },
  ...over,
});

const offerings = (over: Partial<NormalizedOfferings> = {}): NormalizedOfferings => ({
  simulated: true,
  annual: pkg(),
  monthly: pkg({
    id: 'monthly',
    identifier: '$rc_monthly',
    productId: 'cabas_premium_monthly',
    priceString: `4,99${NNBSP}€`,
    priceCents: 499,
    pricePerMonthString: null,
    period: 'month',
  }),
  ...over,
});

const state = (over: Partial<SubscriptionState> = {}): SubscriptionState => ({
  entitlement: 'premium',
  isTrial: false,
  expiresAt: new Date(Date.now() + 10 * DAY).toISOString(),
  productId: 'cabas_premium_monthly',
  willRenew: true,
  ...over,
});

// ─── Fonctionnalité d'origine ────────────────────────────────────────────────

describe('paywall — fonctionnalité d’origine', () => {
  it('ne retient que les fonctionnalités Premium connues', () => {
    expect(parseFeatureParam('optimized_basket')).toBe('optimized_basket');
    expect(parseFeatureParam(['budget_tracking', 'x'])).toBe('budget_tracking');
    expect(parseFeatureParam('pantry')).toBeNull(); // incluse dans l'offre gratuite
    expect(parseFeatureParam('inconnue')).toBeNull();
    expect(parseFeatureParam(undefined)).toBeNull();
  });

  it('met la fonctionnalité d’origine en tête, sans doublon', () => {
    const list = orderedFeatures('price_alerts');
    expect(list[0]).toBe('price_alerts');
    expect(list).toHaveLength(PREMIUM_FEATURES.length);
    expect(new Set(list).size).toBe(list.length);
    expect(orderedFeatures(null)).toEqual([...PREMIUM_FEATURES]);
  });

  it('adapte l’accroche (titre court) et construit le lien', () => {
    expect(paywallHeadline(null).title).toBe('Tes courses, sans limite');
    const h = paywallHeadline('optimized_basket');
    expect(h.title).toBe('Paie tes courses moins cher');
    expect(h.title.split(' ').length).toBeLessThanOrEqual(5);
    expect(h.subtitle).toMatch(/7 jours pour essayer/);
    for (const f of PREMIUM_FEATURES) expect(paywallHeadline(f).title.split(' ').length).toBeLessThanOrEqual(5);
    expect(premiumHref()).toBe('/premium');
    expect(premiumHref('budget_tracking')).toBe('/premium?feature=budget_tracking');
  });
});

// ─── Offres ──────────────────────────────────────────────────────────────────

describe('paywall — offres', () => {
  it('affiche les prix localisés du store, « −33 % » et l’essai', () => {
    const [annual, monthly] = planOptions(offerings());
    expect(annual).toMatchObject({
      id: 'annual',
      title: 'Annuel',
      price: `39,99${NNBSP}€/an`,
      detail: `soit 3,33${NNBSP}€/mois`,
      badge: '−33 %',
      trial: '7 jours d’essai gratuit',
      trialDays: 7,
      fromStore: true,
    });
    expect(monthly).toMatchObject({ id: 'monthly', price: `4,99${NNBSP}€/mois`, detail: 'Sans engagement', badge: null });
  });

  it('se replie sur la grille tarifaire sans offres (et sans promettre d’essai)', () => {
    const v = planOptionView('annual', null);
    expect(v.price).toBe(`39,99${NNBSP}€/an`);
    expect(v.detail).toBe(`soit 3,33${NNBSP}€/mois`);
    expect(v.trial).toBeNull();
    expect(v.fromStore).toBe(false);
  });

  it('libellés du CTA et mentions (renouvellement automatique, résiliable)', () => {
    const [annual] = planOptions(offerings());
    expect(purchaseCtaLabel(annual)).toBe('Essayer 7 jours gratuits');
    expect(purchaseLegalText(annual)).toMatch(/^Gratuit pendant 7 jours, puis 39,99/);
    expect(purchaseLegalText(annual)).toMatch(/Renouvellement automatique, résiliable à tout moment/);
    const noTrial = planOptionView('monthly', pkg({ id: 'monthly', priceString: `4,99${NNBSP}€`, trial: null }));
    expect(purchaseCtaLabel(noTrial)).toBe(`Passer à Premium · 4,99${NNBSP}€/mois`);
    expect(purchaseLegalText(noTrial)).toMatch(/débité à la confirmation/);
  });

  it('présélectionne l’annuel, sinon le mensuel ; essai offert', () => {
    expect(defaultPackage(null)).toBe('annual');
    expect(defaultPackage(offerings({ annual: null }))).toBe('monthly');
    expect(offeredTrialDays(null)).toBe(7);
    expect(offeredTrialDays(offerings())).toBe(7);
    expect(offeredTrialDays(offerings({ annual: pkg({ trial: null }), monthly: null }))).toBeNull();
  });
});

// ─── Statut ──────────────────────────────────────────────────────────────────

describe('statut d’abonnement', () => {
  const now = Date.parse('2026-11-10T10:00:00');

  it('gratuit, et Premium expiré = gratuit', () => {
    expect(subscriptionStatus(state({ entitlement: 'free', expiresAt: null }), now).kind).toBe('free');
    expect(subscriptionStatus(state({ expiresAt: '2026-11-01T00:00:00Z' }), now)).toMatchObject({ kind: 'free', label: 'Gratuit' });
  });

  it('essai : date de fin, jours restants, phrase de suite', () => {
    const s = subscriptionStatus(state({ isTrial: true, expiresAt: '2026-11-17T10:00:00', productId: 'cabas_premium_annual' }), now);
    expect(s).toMatchObject({ kind: 'trial', label: 'Essai Premium', endDate: '2026-11-17', planName: 'Annuel', daysLeft: 7 });
    expect(s.detail).toBe('Essai gratuit jusqu’au mardi 17 novembre');
    expect(renewalSentence(s)).toBe('Ton abonnement annuel démarrera le mardi 17 novembre, sauf si tu l’annules avant.');
    expect(renewalSentence({ ...s, willRenew: false })).toMatch(/Ton essai se termine le mardi 17 novembre/);
  });

  it('Premium : renouvellement ou fin', () => {
    const s = subscriptionStatus(state({ expiresAt: '2026-12-10T10:00:00' }), now);
    expect(s).toMatchObject({ kind: 'premium', label: 'Premium', planName: 'Mensuel' });
    expect(s.detail).toBe('Se renouvelle le jeudi 10 décembre');
    expect(renewalSentence(s)).toBe('Renouvellement automatique le jeudi 10 décembre.');
    const ending = subscriptionStatus(state({ expiresAt: '2026-12-10T10:00:00', willRenew: false }), now);
    expect(ending.detail).toBe('Actif jusqu’au jeudi 10 décembre');
    expect(renewalSentence(subscriptionStatus(state({ entitlement: 'free' }), now))).toBeNull();
  });

  it('utilitaires de dates et d’offre', () => {
    expect(planNameOf('cabas_premium_annual')).toBe('Annuel');
    expect(planNameOf('rc_monthly_499')).toBe('Mensuel');
    expect(planNameOf(null)).toBeNull();
    expect(localDayOf('pas une date')).toBeNull();
    expect(formatEndDate('2026-11-17T10:00:00')).toBe('mardi 17 novembre');
  });
});

// ─── Composants ──────────────────────────────────────────────────────────────

describe('PlanPicker', () => {
  it('cartes « radio » accessibles, sélection et changement', async () => {
    const onChange = jest.fn();
    await render(<PlanPicker options={planOptions(offerings())} value="annual" onChange={onChange} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(radios[0]).toBeChecked();
    expect(radios[1]).not.toBeChecked();
    expect(radios[0].props.accessibilityLabel).toMatch(/Annuel, 39,99.*économie de 33 %/);
    expect(screen.getByText('−33 %')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('plan-picker-monthly'));
    expect(onChange).toHaveBeenCalledWith('monthly');
    await fireEvent.press(screen.getByTestId('plan-picker-annual'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('affiche des squelettes pendant le chargement', async () => {
    await render(<PlanPicker options={[]} value="annual" onChange={() => undefined} loading />);
    expect(screen.getByTestId('plan-picker-loading')).toBeTruthy();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });
});

describe('FeatureList', () => {
  it('liste les bénéfices et met en avant la fonctionnalité d’origine', async () => {
    await render(<FeatureList features={orderedFeatures('budget_tracking')} highlight="budget_tracking" />);
    for (const f of PREMIUM_FEATURES) expect(screen.getByText(FEATURE_COPY[f].title)).toBeTruthy();
    expect(screen.getByText('Ce que tu cherchais')).toBeTruthy();
  });

  it('mode « débloqué » : pas de mise en avant, libellé « Inclus »', async () => {
    await render(<FeatureList features={PREMIUM_FEATURES} highlight="budget_tracking" unlocked />);
    expect(screen.queryByText('Ce que tu cherchais')).toBeNull();
    expect(screen.getByTestId('feature-list-budget_tracking').props.accessibilityLabel).toMatch(/Inclus\.$/);
  });
});

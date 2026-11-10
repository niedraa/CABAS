import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import type { MealPlan, UserProfile } from '@/core';
import { DEFAULT_MEAL_SLOTS } from '@/core';
import { stores as catalogStores } from '@/data';
import { DEFAULT_DRAFT } from '@/stores';

import { subscriptionStatus } from '../../premium/paywall';
import { ProfileHeader } from '../ProfileHeader';
import { ProfileSectionEditor } from '../ProfileSectionEditor';
import {
  countReplacedMeals,
  displayNameOf,
  isSectionDirty,
  parseSectionParam,
  PROFILE_SECTIONS,
  sameValue,
  sectionHref,
  sectionMeta,
  sectionPatch,
  sectionSummary,
} from '../profileSections';
import { SettingsGroup, SettingsRow } from '../SettingsGroup';
import {
  appVersionLabel,
  formatHour,
  formatLongDate,
  permissionView,
  planningReminderSentence,
  REMINDER_WEEKDAYS,
  THEME_CHOICES,
} from '../settingsOptions';
import { SubscriptionCard } from '../SubscriptionCard';
import { ThemePicker } from '../ThemePicker';
import { WeekdayPicker } from '../WeekdayPicker';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'undetermined', canAskAgain: true })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  SchedulableTriggerInputTypes: { WEEKLY: 'weekly', DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {}, PURCHASES_ERROR_CODE: {} }));

const NNBSP = ' ';

const profile: UserProfile = {
  ...DEFAULT_DRAFT,
  id: 'user_1',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  displayName: 'Camille',
  household: { adults: 2, children: 1 },
  diets: ['vegetarien'],
  allergens: ['arachides', 'soja'],
  healthDataConsentAt: '2026-11-01T10:00:00.000Z',
  weeklyBudgetCents: 12000,
  maxCookTimeWeekdayMin: 30,
  maxCookTimeWeekendMin: 60,
  equipment: ['plaques', 'four'],
  favoriteCuisines: ['italienne'],
  preferredStoreIds: ['leclerc', 'carrefour'],
  mealSlots: DEFAULT_MEAL_SLOTS,
};

// ─── Sections du profil (logique pure) ───────────────────────────────────────

describe('sections du profil', () => {
  it('reprend les identifiants des étapes de l’onboarding', () => {
    expect(PROFILE_SECTIONS.map((s) => s.id)).toEqual(['foyer', 'regime', 'budget-temps', 'cuisine', 'magasins', 'creneaux']);
    expect(parseSectionParam('regime')).toBe('regime');
    expect(parseSectionParam(['magasins'])).toBe('magasins');
    expect(parseSectionParam('recap')).toBeNull();
    expect(sectionHref('budget-temps')).toBe('/parametres/profil/budget-temps');
    for (const s of PROFILE_SECTIONS) expect(s.screenTitle.split(' ').length).toBeLessThanOrEqual(5);
  });

  it('résume chaque section en une ligne', () => {
    expect(sectionSummary('foyer', profile).value).toBe('2 adultes, 1 enfant · 3 portions');
    expect(sectionSummary('regime', profile)).toEqual({ value: 'Végétarien', detail: 'Allergies : arachides et soja' });
    expect(sectionSummary('regime', { ...profile, diets: [], allergens: [] })).toEqual({
      value: 'Aucun régime particulier',
      detail: 'Aucune allergie déclarée',
    });
    expect(sectionSummary('budget-temps', profile)).toEqual({
      value: `120${NNBSP}€ par semaine`,
      detail: '30 min en semaine · 60+ min le week-end',
    });
    expect(sectionSummary('cuisine', profile).detail).toBe('Envie de : italienne');
    expect(sectionSummary('magasins', profile, catalogStores).value).toBe('E.Leclerc et Carrefour');
    expect(sectionSummary('magasins', { ...profile, preferredStoreIds: [] }, catalogStores).value).toBe('Aucun magasin');
    expect(sectionSummary('creneaux', profile).value).toBe(`${DEFAULT_MEAL_SLOTS.length} repas par semaine`);
  });

  it('ne modifie que les champs de la section', () => {
    const draft = { ...DEFAULT_DRAFT, displayName: 'Léa', allergens: ['lait' as const] };
    expect(sectionPatch('foyer', draft)).toEqual({ displayName: 'Léa', household: DEFAULT_DRAFT.household });
    expect(Object.keys(sectionPatch('regime', draft)).sort()).toEqual(['allergens', 'diets', 'dislikedIngredientIds', 'healthDataConsentAt']);
    expect(sectionMeta('magasins').fields).toEqual(['preferredStoreIds']);
  });

  it('détecte un changement (Enregistrer désactivé tant que rien ne bouge)', () => {
    const base = { ...profile } as unknown as typeof DEFAULT_DRAFT;
    expect(isSectionDirty('foyer', base, { ...base })).toBe(false);
    expect(isSectionDirty('foyer', base, { ...base, household: { adults: 2, children: 1 } })).toBe(false);
    expect(isSectionDirty('foyer', base, { ...base, household: { adults: 3, children: 1 } })).toBe(true);
    // Un changement dans une AUTRE section ne compte pas.
    expect(isSectionDirty('foyer', base, { ...base, weeklyBudgetCents: 5000 })).toBe(false);
    expect(isSectionDirty('creneaux', base, { ...base, mealSlots: [...base.mealSlots] })).toBe(false);
    expect(isSectionDirty('creneaux', base, { ...base, mealSlots: base.mealSlots.slice(1) })).toBe(true);
    expect(sameValue({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameValue([1], { 0: 1 })).toBe(false);
  });

  it('compte les plats remplacés par la revérification du planning', () => {
    const plan = (recipes: string[]): MealPlan => ({
      id: 'plan_1',
      weekStart: '2026-11-09',
      generatedAt: '2026-11-09T08:00:00Z',
      source: 'rules',
      meals: recipes.map((recipeId, i) => ({ id: `m${i}`, date: '2026-11-09', type: 'diner', recipeId, servings: 3 })),
    });
    const before = { '2026-11-09': plan(['a', 'b', 'c']) };
    expect(countReplacedMeals(before, before)).toBe(0);
    expect(countReplacedMeals(before, { '2026-11-09': plan(['a', 'x', 'y']) })).toBe(2);
    expect(countReplacedMeals({}, { '2026-11-09': plan(['a']) })).toBe(0);
  });

  it('prénom affiché ou rien', () => {
    expect(displayNameOf(profile)).toBe('Camille');
    expect(displayNameOf({ displayName: '   ' })).toBeNull();
    expect(displayNameOf(null)).toBeNull();
  });
});

// ─── Options des réglages ────────────────────────────────────────────────────

describe('options des réglages', () => {
  it('rappel de planification : jours et heures en français', () => {
    expect(REMINDER_WEEKDAYS.map((d) => d.short)).toEqual(['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di']);
    expect(formatHour(18)).toBe('18 h');
    expect(formatHour(99)).toBe('23 h');
    expect(planningReminderSentence({ planningReminderWeekday: 6, planningReminderHour: 18 })).toBe('Le dimanche à 18 h');
  });

  it('bandeau d’autorisation : jamais de demande implicite', () => {
    expect(permissionView(null).action).toBe('request');
    expect(permissionView('undetermined').action).toBe('request');
    expect(permissionView('denied')).toMatchObject({ tone: 'warning', action: 'settings' });
    expect(permissionView('granted')).toMatchObject({ tone: 'success', action: null });
    expect(permissionView('unavailable').action).toBeNull();
  });

  it('dates longues, version et thèmes', () => {
    expect(formatLongDate('2026-11-01T10:00:00')).toBe('1er novembre 2026');
    expect(formatLongDate(null)).toBeNull();
    expect(appVersionLabel('1.0.0', true)).toBe('Cabas 1.0.0 · mode démo');
    expect(appVersionLabel(undefined, false)).toBe('Cabas');
    expect(THEME_CHOICES.map((c) => c.value)).toEqual(['system', 'light', 'dark']);
  });
});

// ─── Composants ──────────────────────────────────────────────────────────────

describe('SubscriptionCard', () => {
  it('gratuit : invite à essayer Premium', async () => {
    const onUpgrade = jest.fn();
    const status = subscriptionStatus({ entitlement: 'free', isTrial: false, expiresAt: null, productId: null, willRenew: false });
    await render(<SubscriptionCard status={status} trialDays={7} onUpgrade={onUpgrade} onManage={jest.fn()} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Essayer 7 jours gratuits' }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('essai : date de fin, jours restants, ouvre la gestion', async () => {
    const onManage = jest.fn();
    const status = subscriptionStatus({
      entitlement: 'premium',
      isTrial: true,
      expiresAt: new Date(Date.now() + 5 * 86_400_000 - 60_000).toISOString(),
      productId: 'cabas_premium_annual',
      willRenew: true,
    });
    await render(<SubscriptionCard status={status} trialDays={null} onUpgrade={jest.fn()} onManage={onManage} />);
    expect(screen.getByText('Essai Premium')).toBeTruthy();
    expect(screen.getByText('Annuel')).toBeTruthy();
    expect(screen.getByTestId('subscription-card-detail').props.children).toMatch(/^Essai gratuit jusqu’au /);
    expect(screen.getByText('Encore 5 jours pour tout essayer')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('subscription-card'));
    expect(onManage).toHaveBeenCalledTimes(1);
  });
});

describe('ProfileHeader & SettingsGroup', () => {
  it('en-tête : prénom, foyer, ouvre l’édition', async () => {
    const onPress = jest.fn();
    await render(<ProfileHeader name="Camille" household={{ adults: 2, children: 1 }} badge={{ label: 'Premium', tone: 'premium' }} onPress={onPress} />);
    expect(screen.getByText('Camille')).toBeTruthy();
    expect(screen.getByText('Premium')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Camille. 2 adultes, 1 enfant · 3 portions. Modifier' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('sans prénom : « Ton foyer »', async () => {
    await render(<ProfileHeader name={null} household={{ adults: 1, children: 0 }} onPress={jest.fn()} />);
    expect(screen.getByText('Ton foyer')).toBeTruthy();
  });

  it('groupe de réglages : titre, lignes pressables, note', async () => {
    const onPress = jest.fn();
    await render(
      <SettingsGroup title="Réglages" note="Une petite note.">
        <SettingsRow title="Notifications" subtitle="Le dimanche à 18 h" chevron onPress={onPress} />
        {null}
        <SettingsRow title="Apparence" />
      </SettingsGroup>,
    );
    expect(screen.getByText('Réglages')).toBeTruthy();
    expect(screen.getByText('Une petite note.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Notifications, Le dimanche à 18 h' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('sélecteurs', () => {
  it('WeekdayPicker : 7 jours « radio », nom complet lu', async () => {
    const onChange = jest.fn();
    await render(<WeekdayPicker value={6} onChange={onChange} accessibilityLabel="Jour du rappel" />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(7);
    expect(screen.getByRole('radio', { name: 'Dimanche' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Mercredi' }));
    expect(onChange).toHaveBeenCalledWith(2);
    await fireEvent.press(screen.getByRole('radio', { name: 'Dimanche' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('ThemePicker : Auto / Clair / Sombre', async () => {
    const onChange = jest.fn();
    await render(<ThemePicker value="system" onChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'Auto, Suit ton téléphone' })).toBeChecked();
    await fireEvent.press(screen.getByTestId('theme-picker-dark'));
    expect(onChange).toHaveBeenCalledWith('dark');
  });
});

describe('ProfileSectionEditor', () => {
  it('foyer : prénom et compteurs', async () => {
    const onChange = jest.fn();
    await render(
      <ProfileSectionEditor
        section="foyer"
        draft={{ ...DEFAULT_DRAFT, displayName: 'Camille' }}
        onChange={onChange}
        ingredients={[]}
        stores={catalogStores}
        freeLimit={3}
      />,
    );
    await fireEvent.changeText(screen.getByTestId('edit-name'), 'Léa');
    expect(onChange).toHaveBeenCalledWith({ displayName: 'Léa' });
    await fireEvent.press(screen.getByRole('button', { name: 'Augmenter Adultes' }));
    expect(onChange).toHaveBeenLastCalledWith({ household: { adults: 3, children: 0 } });
  });

  it('régime : le consentement apparaît dès qu’une allergie est cochée', async () => {
    const onChange = jest.fn();
    const { rerender } = await render(
      <ProfileSectionEditor section="regime" draft={{ ...DEFAULT_DRAFT }} onChange={onChange} ingredients={[]} stores={[]} freeLimit={null} />,
      { wrapper: GestureHandlerRootView },
    );
    expect(screen.queryByTestId('diet-allergy-consent')).toBeNull();
    await fireEvent.press(screen.getByTestId('diet-allergy-allergens-lait'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ allergens: ['lait'] }));
    await rerender(
      <ProfileSectionEditor section="regime" draft={{ ...DEFAULT_DRAFT, allergens: ['lait'] }} onChange={onChange} ingredients={[]} stores={[]} freeLimit={null} />,
    );
    expect(screen.getByTestId('diet-allergy-consent')).toBeTruthy();
  });
});

import type { UserProfile } from '@/core';
import { DEFAULT_MEAL_SLOTS } from '@/core';

import { profileToRow, rowToProfile } from '../mappers';

const base: UserProfile = {
  id: 'u1',
  displayName: 'Camille',
  household: { adults: 2, children: 1 },
  diets: ['halal'],
  allergens: ['arachides'],
  dislikedIngredientIds: [],
  favoriteCuisines: [],
  weeklyBudgetCents: 12000,
  maxCookTimeWeekdayMin: 30,
  maxCookTimeWeekendMin: 60,
  equipment: ['four'],
  preferredStoreIds: ['leclerc'],
  mealSlots: DEFAULT_MEAL_SLOTS,
  healthDataConsentAt: '2026-11-01T10:00:00.000Z',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
};

describe('mappers profil', () => {
  it('aller-retour profil ⇄ ligne', () => {
    const row = profileToRow(base, '2026-11-01T10:00:00.000Z');
    expect(row).toMatchObject({ allergens: ['arachides'], diets: ['halal'], health_data_consent_at: base.healthDataConsentAt });
    const back = rowToProfile({ ...row, created_at: base.createdAt, updated_at: base.updatedAt });
    expect(back).toEqual(base);
  });

  it('sans consentement, allergies et régimes partent vides (contrainte de la base)', () => {
    const row = profileToRow({ ...base, healthDataConsentAt: null }, null);
    expect(row).toMatchObject({ allergens: [], diets: [], health_data_consent_at: null });
  });
});

/**
 * Éditeur d'une section du profil : réutilise les sections de l'onboarding
 * (`../profile`) en mode contrôlé sur un brouillon local. La section « Foyer »
 * ajoute le prénom.
 */
import React from 'react';
import { UserRound } from 'lucide-react-native';

import { Stack, TextField } from '@/components/ui';
import type { Ingredient, Store } from '@/core';
import type { ProfileDraft } from '@/stores';

import {
  BudgetTimeSection,
  DietAllergySection,
  EquipmentCuisineSection,
  HouseholdSection,
  MealSlotsSection,
  StoresSection,
} from '../profile';
import type { ProfileSectionId } from './profileSections';

export interface ProfileSectionEditorProps {
  section: ProfileSectionId;
  draft: Required<ProfileDraft>;
  onChange: (patch: ProfileDraft) => void;
  ingredients: readonly Ingredient[];
  stores: readonly Store[];
  /** Limite de repas de l'offre gratuite (null = Premium). */
  freeLimit: number | null;
  onPremiumPress?: () => void;
  onSearchResults?: () => void;
}

export function ProfileSectionEditor({
  section,
  draft,
  onChange,
  ingredients,
  stores,
  freeLimit,
  onPremiumPress,
  onSearchResults,
}: ProfileSectionEditorProps) {
  switch (section) {
    case 'foyer':
      return (
        <Stack gap="xxl">
          <TextField
            label="Ton prénom"
            helper="Facultatif : pour te saluer dans l’app."
            value={draft.displayName}
            onChangeText={(displayName) => onChange({ displayName })}
            placeholder="Camille"
            leftIcon={UserRound}
            autoCapitalize="words"
            autoComplete="given-name"
            maxLength={80}
            returnKeyType="done"
            clearable
            accessibilityLabel="Ton prénom"
            testID="edit-name"
          />
          <HouseholdSection value={draft.household} onChange={(household) => onChange({ household })} testID="household" />
        </Stack>
      );
    case 'regime':
      return (
        <DietAllergySection
          value={{
            diets: draft.diets,
            allergens: draft.allergens,
            dislikedIngredientIds: draft.dislikedIngredientIds,
            healthDataConsentAt: draft.healthDataConsentAt,
          }}
          onChange={(v) => onChange(v)}
          ingredients={ingredients}
          onSearchResults={onSearchResults}
        />
      );
    case 'budget-temps':
      return (
        <BudgetTimeSection
          value={{
            weeklyBudgetCents: draft.weeklyBudgetCents,
            maxCookTimeWeekdayMin: draft.maxCookTimeWeekdayMin,
            maxCookTimeWeekendMin: draft.maxCookTimeWeekendMin,
          }}
          onChange={(v) => onChange(v)}
          household={draft.household}
        />
      );
    case 'cuisine':
      return (
        <EquipmentCuisineSection
          value={{ equipment: draft.equipment, favoriteCuisines: draft.favoriteCuisines }}
          onChange={(v) => onChange(v)}
        />
      );
    case 'magasins':
      return <StoresSection value={draft.preferredStoreIds} onChange={(preferredStoreIds) => onChange({ preferredStoreIds })} stores={stores} />;
    case 'creneaux':
    default:
      return (
        <MealSlotsSection
          value={draft.mealSlots}
          onChange={(mealSlots) => onChange({ mealSlots })}
          freeLimit={freeLimit}
          onPremiumPress={onPremiumPress}
        />
      );
  }
}

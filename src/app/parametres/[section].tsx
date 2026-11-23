/**
 * Édition d'une section du profil depuis l'onglet Profil :
 * foyer · regime · budget · cuisine · magasins · repas.
 * Brouillon local (rien n'est enregistré tant qu'on ne valide pas), mêmes
 * composants et mêmes règles de validation que l'onboarding.
 */
import { router, useLocalSearchParams, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Check } from 'lucide-react-native';

import {
  BudgetTimeSection,
  DietAllergySection,
  EquipmentCuisineSection,
  HouseholdSection,
  MealSlotsSection,
  StoresSection,
} from '@/components/feature/profile';
import { Button, EmptyState, InfoBanner, Screen, useToast } from '@/components/ui';
import { FREE_TIER } from '@/core';
import { useEntitlement } from '@/hooks';
import { haptics } from '@/lib/haptics';
import { useCatalog } from '@/services/catalog';
import { draftFromProfile, useProfileStore, type ProfileDraft } from '@/stores';
import { useTheme } from '@/theme';

const PROFILE_SECTIONS = {
  foyer: { title: 'Ton foyer', subtitle: 'Cabas ajuste les portions et les quantités.' },
  regime: { title: 'Goûts & santé', subtitle: 'Régimes, allergies et aliments que tu n’aimes pas.' },
  budget: { title: 'Budget & temps', subtitle: 'Ton budget courses et ton temps en cuisine.' },
  cuisine: { title: 'Ta cuisine', subtitle: 'Tes ustensiles et tes cuisines préférées.' },
  magasins: { title: 'Tes magasins', subtitle: 'En France ou en Espagne, jusqu’à 5 enseignes.' },
  repas: { title: 'Tes repas', subtitle: 'Les repas que Cabas planifie chaque semaine.' },
} as const;
type ProfileSectionId = keyof typeof PROFILE_SECTIONS;

function isSection(s: string | undefined): s is ProfileSectionId {
  return !!s && s in PROFILE_SECTIONS;
}

export default function EditProfileSection() {
  const t = useTheme();
  const toast = useToast();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const profile = useProfileStore((s) => s.profile);
  const catalog = useCatalog();
  const entitlement = useEntitlement();
  const initial = useMemo(() => (profile ? draftFromProfile(profile) : null), [profile]);
  const [draft, setDraft] = useState<ProfileDraft | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/profil' as Href));

  if (!isSection(section) || !profile || !draft || !initial) {
    return (
      <Screen title="Profil" onBack={close} bottomInset="safe">
        <EmptyState title="Section introuvable" body="Retourne à ton profil pour choisir quoi modifier." action={{ label: 'Mon profil', onPress: close }} />
      </Screen>
    );
  }

  const d = { ...initial, ...draft };
  const update = (patch: ProfileDraft) => {
    setError(null);
    setDraft((cur) => ({ ...(cur ?? {}), ...patch }));
  };
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const save = () => {
    const res = useProfileStore.getState().updateProfile(draft);
    if (!res.ok) {
      haptics.error();
      setError(res.issues[0]?.message ?? 'Vérifie tes choix.');
      return;
    }
    haptics.success();
    toast.show({ title: 'Profil mis à jour', tone: 'success', duration: 2000 });
    close();
  };

  const meta = PROFILE_SECTIONS[section];
  let body: React.ReactNode = null;
  switch (section) {
    case 'foyer':
      body = <HouseholdSection value={d.household} onChange={(household) => update({ household })} />;
      break;
    case 'regime':
      body = (
        <DietAllergySection
          value={{ diets: d.diets, allergens: d.allergens, dislikedIngredientIds: d.dislikedIngredientIds, healthDataConsentAt: d.healthDataConsentAt }}
          onChange={update}
          ingredients={catalog.ingredients}
        />
      );
      break;
    case 'budget':
      body = (
        <BudgetTimeSection
          value={{ weeklyBudgetCents: d.weeklyBudgetCents, maxCookTimeWeekdayMin: d.maxCookTimeWeekdayMin, maxCookTimeWeekendMin: d.maxCookTimeWeekendMin }}
          onChange={update}
          household={d.household}
        />
      );
      break;
    case 'cuisine':
      body = <EquipmentCuisineSection value={{ equipment: d.equipment, favoriteCuisines: d.favoriteCuisines }} onChange={update} />;
      break;
    case 'magasins':
      body = <StoresSection value={d.preferredStoreIds} onChange={(preferredStoreIds) => update({ preferredStoreIds })} stores={catalog.stores} />;
      break;
    case 'repas':
      body = (
        <MealSlotsSection
          value={d.mealSlots}
          onChange={(mealSlots) => update({ mealSlots })}
          freeLimit={entitlement === 'premium' ? null : FREE_TIER.maxMealsPerWeek}
          onPremiumPress={() => router.push('/premium' as Href)}
        />
      );
      break;
  }

  return (
    <Screen
      title={meta.title}
      subtitle={meta.subtitle}
      onBack={close}
      bottomInset="safe"
      testID={`edit-${section}`}
      footer={<Button label="Enregistrer" leftIcon={Check} size="lg" fullWidth disabled={!dirty} onPress={save} testID="edit-save" />}
    >
      <View style={{ gap: t.spacing.lg }}>
        {error ? <InfoBanner tone="danger" message={error} /> : null}
        {body}
      </View>
    </Screen>
  );
}

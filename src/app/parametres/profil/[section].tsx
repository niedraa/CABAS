/**
 * Édition d'une section du profil après l'onboarding (`/parametres/profil/foyer`,
 * `regime`, `budget-temps`, `cuisine`, `magasins`, `creneaux`).
 *
 * Réutilise les sections de l'onboarding sur un brouillon local ; « Enregistrer »
 * reste désactivé tant que rien n'a changé, puis `updateProfile(patch)` valide
 * (consentement RGPD exigé pour allergies / régimes). Le planning se revérifie
 * seul : le toast dit combien de plats ont été remplacés.
 */
import { router, useLocalSearchParams, type Href } from 'expo-router';
import React, { useState } from 'react';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';

import { EmptyBasket } from '@/components/brand';
import {
  countReplacedMeals,
  isSectionDirty,
  parseSectionParam,
  ProfileSectionEditor,
  sectionMeta,
  sectionPatch,
} from '@/components/feature/account';
import { premiumHref } from '@/components/feature/premium';
import { Button, ConfirmDialog, EmptyState, InfoBanner, Screen, Stack, staggerEntering, useToast } from '@/components/ui';
import { FREE_TIER } from '@/core';
import { useSubscription } from '@/hooks';
import { haptics } from '@/lib/haptics';
import { useCatalog } from '@/services/catalog';
import { draftFromProfile, usePlanStore, useProfileStore, type ProfileDraft, type ProfileIssue } from '@/stores';
import { useTheme } from '@/theme';

export default function EditProfileSection() {
  const t = useTheme();
  const params = useLocalSearchParams<{ section?: string }>();
  const section = parseSectionParam(params.section);
  const profile = useProfileStore((s) => s.profile);
  const catalog = useCatalog();
  const sub = useSubscription();
  const toast = useToast();
  const [draft, setDraft] = useState<Required<ProfileDraft> | null>(() => (profile ? draftFromProfile(profile) : null));
  const [issues, setIssues] = useState<ProfileIssue[]>([]);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/profil' as Href));

  if (!section || !profile || !draft) {
    return (
      <Screen onBack={leave} testID="edit-section-missing">
        <EmptyState
          illustration={<EmptyBasket size={120} />}
          title="Section introuvable"
          body="Ton profil t’attend dans l’onglet Profil."
          action={{ label: 'Retour au profil', onPress: leave }}
        />
      </Screen>
    );
  }

  const meta = sectionMeta(section);
  const dirty = isSectionDirty(section, draftFromProfile(profile), draft);

  const update = (patch: ProfileDraft) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setIssues([]);
  };

  const back = () => {
    if (dirty) {
      haptics.warning();
      setConfirmLeave(true);
      return;
    }
    leave();
  };

  const save = () => {
    const before = usePlanStore.getState().plans;
    const res = useProfileStore.getState().updateProfile(sectionPatch(section, draft));
    if (!res.ok) {
      haptics.error();
      setIssues(res.issues);
      return;
    }
    const replaced = countReplacedMeals(before, usePlanStore.getState().plans);
    toast.show({
      title: 'Profil mis à jour',
      message:
        replaced > 0
          ? `${replaced} plat${replaced > 1 ? 's' : ''} remplacé${replaced > 1 ? 's' : ''} dans ta semaine pour respecter tes choix.`
          : meta.savedMessage,
      tone: 'success',
    });
    leave();
  };

  return (
    <>
      <Screen
        title={meta.screenTitle}
        subtitle={meta.subtitle}
        onBack={back}
        testID={`edit-section-${section}`}
        footer={
          <Stack gap="sm">
            {issues.length > 0 ? (
              <Animated.View
                entering={FadeInDown.springify().damping(t.motion.spring.damping).stiffness(t.motion.spring.stiffness)}
                exiting={FadeOut.duration(t.motion.duration.fast)}
              >
                <InfoBanner tone="warning" message={issues[0].message} />
              </Animated.View>
            ) : null}
            <Button
              label="Enregistrer"
              leftIcon={Check}
              size="lg"
              fullWidth
              disabled={!dirty}
              accessibilityHint={dirty ? undefined : 'Aucune modification à enregistrer'}
              onPress={save}
              testID="edit-save"
            />
          </Stack>
        }
      >
        <Animated.View entering={staggerEntering(0, t.motion.stagger, 60)}>
          <ProfileSectionEditor
            section={section}
            draft={draft}
            onChange={update}
            ingredients={catalog.ingredients}
            stores={catalog.stores}
            freeLimit={sub.isPremium ? null : FREE_TIER.maxMealsPerWeek}
            onPremiumPress={() => router.push(premiumHref('unlimited_planning') as Href)}
          />
        </Animated.View>
      </Screen>
      <ConfirmDialog
        visible={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false);
          leave();
        }}
        title="Quitter sans enregistrer ?"
        message="Tes modifications de cette section seront perdues."
        confirmLabel="Quitter sans enregistrer"
        cancelLabel="Continuer l’édition"
        destructive
        testID="edit-leave-confirm"
      />
    </>
  );
}

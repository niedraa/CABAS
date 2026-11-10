/**
 * Récapitulatif du profil (dernière étape de l'onboarding) : une ligne par
 * bloc, chacune modifiable d'un toucher.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { Badge, Card, PressableScale, StaggeredList, StoreBadgeStack, Text } from '@/components/ui';
import {
  ALLERGEN_LABELS,
  CUISINE_LABELS,
  DIET_LABELS,
  EQUIPMENT_LABELS,
  formatPrice,
  joinFr,
  type Store,
} from '@/core';
import type { ProfileDraft } from '@/stores';
import { useTheme } from '@/theme';

import { COOK_TIME_CHOICES, nearestCookTime } from '../profile/profileOptions';
import { householdSummary, type OnboardingStepId } from './steps';

export interface ProfileSummaryProps {
  draft: Required<ProfileDraft>;
  stores: readonly Store[];
  onEdit: (step: OnboardingStepId) => void;
}

function cookLabel(min: number): string {
  return COOK_TIME_CHOICES.find((c) => c.value === nearestCookTime(min))?.label ?? `${min} min`;
}

export function ProfileSummary({ draft, stores, onEdit }: ProfileSummaryProps) {
  const t = useTheme();
  const chosenStores = draft.preferredStoreIds.map((id) => stores.find((s) => s.id === id)).filter((s): s is Store => !!s);
  const diets = draft.diets.map((d) => DIET_LABELS[d]);
  const equipment = draft.equipment.map((e) => EQUIPMENT_LABELS[e]);
  const cuisines = draft.favoriteCuisines.map((c) => CUISINE_LABELS[c]);

  return (
    <Card variant="plain" padding="none" testID="profile-summary">
      <StaggeredList gap="none">
        <SummaryRow emoji="🏡" title="Foyer" step="foyer" onEdit={onEdit} value={householdSummary(draft.household)} />
        <SummaryRow
          emoji="🥗"
          title="Régimes & allergies"
          step="regime"
          onEdit={onEdit}
          value={diets.length ? joinFr(diets) : 'Aucun régime particulier'}
        >
          {draft.allergens.length > 0 ? (
            <View style={styles.badges}>
              {draft.allergens.map((a) => (
                <Badge key={a} label={ALLERGEN_LABELS[a]} tone="danger" size="sm" />
              ))}
            </View>
          ) : (
            <Text variant="footnote" color="textSecondary">
              Aucune allergie déclarée
            </Text>
          )}
        </SummaryRow>
        <SummaryRow
          emoji="💶"
          title="Budget & temps"
          step="budget-temps"
          onEdit={onEdit}
          value={`${formatPrice(draft.weeklyBudgetCents, { compact: true })} par semaine`}
        >
          <Text variant="footnote" color="textSecondary">
            {cookLabel(draft.maxCookTimeWeekdayMin)} en semaine · {cookLabel(draft.maxCookTimeWeekendMin)} le week-end
          </Text>
        </SummaryRow>
        <SummaryRow
          emoji="🍳"
          title="Cuisine"
          step="cuisine"
          onEdit={onEdit}
          value={equipment.length ? joinFr(equipment) : 'Sans ustensile'}
        >
          {cuisines.length ? (
            <Text variant="footnote" color="textSecondary" numberOfLines={2}>
              Envie de : {joinFr(cuisines).toLowerCase()}
            </Text>
          ) : null}
        </SummaryRow>
        <SummaryRow
          emoji="🛒"
          title="Magasins"
          step="magasins"
          onEdit={onEdit}
          value={chosenStores.length ? joinFr(chosenStores.map((s) => s.name.replace(/ Drive$/, ''))) : 'Aucun magasin'}
          right={chosenStores.length ? <StoreBadgeStack chains={chosenStores.map((s) => s.chain)} size="xs" max={5} /> : null}
        />
        <SummaryRow
          emoji="🗓️"
          title="Repas"
          step="creneaux"
          onEdit={onEdit}
          value={`${draft.mealSlots.length} repas par semaine`}
          last
        />
      </StaggeredList>
      <View style={[styles.hint, { borderTopColor: t.colors.border }]}>
        <Text variant="caption" color="textTertiary" align="center">
          Tu pourras tout modifier plus tard dans ton profil.
        </Text>
      </View>
    </Card>
  );
}

function SummaryRow({
  emoji,
  title,
  value,
  step,
  onEdit,
  right,
  children,
  last,
}: {
  emoji: string;
  title: string;
  value: string;
  step: OnboardingStepId;
  onEdit: (step: OnboardingStepId) => void;
  right?: React.ReactNode;
  children?: React.ReactNode;
  last?: boolean;
}) {
  const t = useTheme();
  return (
    <PressableScale
      onPress={() => onEdit(step)}
      accessibilityRole="button"
      accessibilityLabel={`${title} : ${value}. Modifier`}
      scaleTo={0.985}
      style={[
        styles.row,
        {
          paddingHorizontal: t.spacing.lg,
          paddingVertical: t.spacing.md,
          borderBottomColor: t.colors.border,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth * 2,
        },
      ]}
      testID={`summary-${step}`}
    >
      <View style={[styles.emojiBox, { backgroundColor: t.colors.backgroundAlt, borderRadius: t.radius.md }]}>
        <Text style={styles.emoji} accessibilityElementsHidden importantForAccessibility="no">
          {emoji}
        </Text>
      </View>
      <View style={styles.texts}>
        <Text variant="caption" color="textSecondary">
          {title}
        </Text>
        <Text variant="bodyMedium" numberOfLines={2}>
          {value}
        </Text>
        {children}
      </View>
      {right}
      <ChevronRight size={t.iconSize.md} color={t.colors.textTertiary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  emojiBox: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 20, lineHeight: 26 },
  texts: { flex: 1, gap: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  hint: { borderTopWidth: StyleSheet.hairlineWidth * 2, paddingVertical: 10 },
});

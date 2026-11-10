/**
 * Section « Régimes & allergies » : régimes (puces), 14 allergènes
 * réglementaires (puces tomate), ingrédients exclus (recherche dans le
 * catalogue) et CONSENTEMENT RGPD explicite aux données de santé, exigé dès
 * qu'un régime ou une allergie est déclaré.
 *
 * Composant contrôlé : `value` + `onChange`. Le catalogue d'ingrédients est
 * passé par l'écran (`ingredients`) : la section ne dépend d'aucun service.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { ChevronDown, ChevronUp, Lock, Plus, ShieldCheck, X } from 'lucide-react-native';

import {
  Card,
  Checkbox,
  Chip,
  ChipGroup,
  InfoBanner,
  PressableScale,
  Row,
  SearchField,
  SectionHeader,
  Stack,
  Text,
} from '@/components/ui';
import type { Allergen, Diet, Ingredient } from '@/core';
import { useTheme } from '@/theme';

import { ALLERGEN_CHOICES, DIET_CHOICES, needsHealthConsent, searchIngredients } from './profileOptions';

export interface DietAllergyValue {
  diets: Diet[];
  allergens: Allergen[];
  dislikedIngredientIds: string[];
  /** Horodatage ISO du consentement, ou null. */
  healthDataConsentAt: string | null;
}

export interface DietAllergySectionProps {
  value: DietAllergyValue;
  onChange: (value: DietAllergyValue) => void;
  /** Ingrédients du catalogue (recherche « je n'aime pas »). */
  ingredients: readonly Ingredient[];
  /** Appelé quand des résultats de recherche apparaissent (l'écran peut les amener en vue). */
  onSearchResults?: () => void;
  /** Horloge injectable (tests). */
  now?: () => string;
  testID?: string;
}

export const HEALTH_CONSENT_LABEL = 'J’accepte que Cabas utilise ces informations de santé pour filtrer mes repas';

export function DietAllergySection({
  value,
  onChange,
  ingredients,
  onSearchResults,
  now = () => new Date().toISOString(),
  testID = 'diet-allergy',
}: DietAllergySectionProps) {
  const t = useTheme();
  const [query, setQuery] = useState('');
  const [explain, setExplain] = useState(false);
  const consentNeeded = needsHealthConsent(value);
  const consented = !!value.healthDataConsentAt;

  const byId = useMemo(() => {
    const m = new Map<string, Ingredient>();
    for (const i of ingredients) m.set(i.id, i);
    return m;
  }, [ingredients]);
  const results = useMemo(
    () => searchIngredients(ingredients, query, value.dislikedIngredientIds),
    [ingredients, query, value.dislikedIngredientIds],
  );

  const hasResults = results.length > 0;
  useEffect(() => {
    if (hasResults) onSearchResults?.();
    // Seulement à l'apparition des résultats.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasResults]);

  const addDisliked = (id: string) => {
    onChange({ ...value, dislikedIngredientIds: [...value.dislikedIngredientIds, id] });
    setQuery('');
  };
  const removeDisliked = (id: string) =>
    onChange({ ...value, dislikedIngredientIds: value.dislikedIngredientIds.filter((x) => x !== id) });

  return (
    <Stack gap="xxl" testID={testID}>
      <Stack gap="md">
        <SectionHeader title="Régimes" subtitle="Ce que tu manges (ou pas) au quotidien." />
        <ChipGroup
          mode="multi"
          options={DIET_CHOICES}
          value={value.diets}
          onChange={(diets) => onChange({ ...value, diets })}
          accessibilityLabel="Régimes alimentaires"
          testID={`${testID}-diets`}
        />
      </Stack>

      <Stack gap="md">
        <SectionHeader title="Allergies" subtitle="Ces aliments ne te seront jamais proposés." />
        <ChipGroup
          mode="multi"
          tone="danger"
          options={ALLERGEN_CHOICES}
          value={value.allergens}
          onChange={(allergens) => onChange({ ...value, allergens })}
          accessibilityLabel="Allergies"
          testID={`${testID}-allergens`}
        />
      </Stack>

      {consentNeeded ? (
        <Animated.View
          entering={FadeInDown.springify().damping(t.motion.spring.damping).stiffness(t.motion.spring.stiffness)}
          exiting={FadeOut.duration(t.motion.duration.fast)}
          layout={LinearTransition.springify().damping(t.motion.spring.damping)}
        >
          <Card
            variant="outlined"
            padding="lg"
            style={{ borderColor: consented ? t.colors.success : t.colors.accent, borderWidth: 2 }}
          >
            <Stack gap="sm">
              <Row gap="sm">
                <Lock size={t.iconSize.sm} color={t.colors.accentText} strokeWidth={2.4} />
                <Text variant="overline" color="accentText">
                  Ton accord
                </Text>
              </Row>
              <Checkbox
                checked={consented}
                onChange={(checked) => onChange({ ...value, healthDataConsentAt: checked ? now() : null })}
                label={HEALTH_CONSENT_LABEL}
                testID={`${testID}-consent`}
              />
              <PressableScale
                onPress={() => setExplain((e) => !e)}
                accessibilityRole="button"
                accessibilityLabel={explain ? 'Masquer les explications' : 'Pourquoi et comment ?'}
                accessibilityState={{ expanded: explain }}
                haptic="select"
                hitSlop={t.layout.hitSlop}
                style={[styles.link, { minHeight: t.layout.minTouchTarget }]}
              >
                <Text variant="subhead" color="primary" style={styles.underline}>
                  Pourquoi et comment ?
                </Text>
                {explain ? (
                  <ChevronUp size={t.iconSize.sm} color={t.colors.primary} />
                ) : (
                  <ChevronDown size={t.iconSize.sm} color={t.colors.primary} />
                )}
              </PressableScale>
              {explain ? (
                <Animated.View entering={FadeIn.duration(t.motion.duration.base)} exiting={FadeOut.duration(t.motion.duration.fast)}>
                  <Stack gap="sm" style={[styles.explain, { backgroundColor: t.colors.backgroundAlt, borderRadius: t.radius.md }]}>
                    <Explain emoji="🎯" title="Pour quoi faire ?" body="Uniquement pour écarter les plats qui ne te conviennent pas. Jamais de pub, jamais revendu." />
                    <Explain emoji="🇪🇺" title="Où ?" body="Sur des serveurs en Europe, chiffrés. Rien ne part dans nos statistiques." />
                    <Explain emoji="🗑️" title="Et si je change d’avis ?" body="Tu modifies ou supprimes ces infos à tout moment dans ton profil." />
                  </Stack>
                </Animated.View>
              ) : null}
            </Stack>
          </Card>
        </Animated.View>
      ) : null}

      <Animated.View layout={LinearTransition.springify().damping(t.motion.spring.damping)}>
        <InfoBanner
          tone="success"
          icon={ShieldCheck}
          message="Les allergènes sont filtrés côté serveur, indépendamment de l’IA."
        />
      </Animated.View>

      <Animated.View layout={LinearTransition.springify().damping(t.motion.spring.damping)}>
        <Stack gap="md">
          <SectionHeader title="Je n’aime pas" subtitle="Optionnel : on les évitera dans tes menus." />
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Coriandre, champignons…"
            accessibilityLabel="Rechercher un ingrédient que tu n’aimes pas"
            returnKeyType="done"
            onSubmitEditing={() => {
              const first = results[0];
              if (first) addDisliked(first.id);
            }}
            testID={`${testID}-search`}
          />
          {results.length > 0 ? (
            <Animated.View entering={FadeIn.duration(t.motion.duration.fast)}>
              <Card variant="plain" padding="none" style={{ borderColor: t.colors.border, borderWidth: StyleSheet.hairlineWidth * 2 }}>
                {results.map((ing, i) => (
                  <PressableScale
                    key={ing.id}
                    onPress={() => addDisliked(ing.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Exclure ${ing.name}`}
                    haptic="select"
                    scaleTo={0.99}
                    style={[
                      styles.result,
                      {
                        paddingHorizontal: t.spacing.lg,
                        borderTopColor: t.colors.border,
                        borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth * 2,
                        minHeight: t.layout.minTouchTarget + 4,
                      },
                    ]}
                    testID={`${testID}-result-${ing.id}`}
                  >
                    <Text variant="bodyMedium" style={styles.flex} numberOfLines={1}>
                      {ing.name}
                    </Text>
                    <Plus size={t.iconSize.md} color={t.colors.primary} />
                  </PressableScale>
                ))}
              </Card>
            </Animated.View>
          ) : query.trim().length >= 2 ? (
            <Text variant="footnote" color="textSecondary">
              Aucun ingrédient ne correspond à « {query.trim()} ».
            </Text>
          ) : null}
          {value.dislikedIngredientIds.length > 0 ? (
            <View style={styles.chips}>
              {value.dislikedIngredientIds.map((id) => (
                <Animated.View
                  key={id}
                  entering={FadeIn.duration(t.motion.duration.base)}
                  exiting={FadeOut.duration(t.motion.duration.fast)}
                  layout={LinearTransition.springify().damping(t.motion.spring.damping)}
                >
                  <Chip
                    size="sm"
                    role="button"
                    label={byId.get(id)?.name ?? id}
                    icon={X}
                    onPress={() => removeDisliked(id)}
                    accessibilityHint="Retirer de la liste"
                    testID={`${testID}-disliked-${id}`}
                  />
                </Animated.View>
              ))}
            </View>
          ) : null}
        </Stack>
      </Animated.View>
    </Stack>
  );
}

function Explain({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <Row gap="sm" align="flex-start">
      <Text style={styles.explainEmoji} accessibilityElementsHidden importantForAccessibility="no">
        {emoji}
      </Text>
      <View style={styles.flex}>
        <Text variant="subhead">{title}</Text>
        <Text variant="footnote" color="textSecondary">
          {body}
        </Text>
      </View>
    </Row>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  underline: { textDecorationLine: 'underline' },
  explain: { padding: 14 },
  explainEmoji: { fontSize: 18, lineHeight: 22 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});

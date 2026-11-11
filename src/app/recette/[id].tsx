/**
 * Fiche recette : en-tête immersif (emoji sur pastel, parallaxe, barre qui se
 * replie), méta, portions qui recalculent les quantités en direct,
 * allergènes / régimes déduits des ingrédients, ingrédients à cocher, étapes,
 * et « Mode cuisine » pas à pas (étape et minuteurs gardés à la fermeture,
 * notification locale à l'échéance d'un minuteur).
 *
 * Paramètres : `id` (recette), `mealId` (facultatif : repas du planning dont
 * on règle les portions — la liste de courses suit).
 */
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { ChefHat, ChevronLeft, Clock, Flame, Gauge, Globe, Lock, Users, UtensilsCrossed } from 'lucide-react-native';

import { CircleDecor, EmptyBasket } from '@/components/brand';
import {
  allergenBadges,
  compatibleDiets,
  CookingMode,
  DIFFICULTY_LABELS,
  dietLabel,
  formatMinutes,
  IngredientChecklist,
  runningTimers,
  scaledIngredientLines,
  StepList,
  useCookingSession,
  type TimerAlerts,
} from '@/components/feature/recipe';
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  InfoBanner,
  pastelFor,
  SectionHeader,
  Stepper,
  Text,
  useSafeInsets,
} from '@/components/ui';
import { CUISINE_LABELS, householdServings, MEAL_TYPE_LABELS, formatDayLabel } from '@/core';
import { haptics } from '@/lib/haptics';
import { useCatalog } from '@/services/catalog';
import { cancelCookingTimerAlert, scheduleCookingTimerAlert } from '@/services/notifications';
import { useMeal, usePlanStore, useProfileStore } from '@/stores';
import { boxShadow, useTheme } from '@/theme';

const HERO_H = 300;

/**
 * Minuteurs du mode cuisine → notifications locales (sans effet sur le web).
 * Toucher la notification rouvre la recette (sinon `data.url` vaut « / »).
 * Un objet stable par recette : CookingMode peut s'en servir en dépendance.
 */
const timerAlertsByRecipe = new Map<string, TimerAlerts>();
function timerAlertsFor(recipeId: string): TimerAlerts {
  let alerts = timerAlertsByRecipe.get(recipeId);
  if (!alerts) {
    const url = `/recette/${encodeURIComponent(recipeId)}`;
    alerts = {
      schedule: (key, endsAt, content) => void scheduleCookingTimerAlert(key, new Date(endsAt), { ...content, url }),
      cancel: (key) => void cancelCookingTimerAlert(key),
    };
    timerAlertsByRecipe.set(recipeId, alerts);
  }
  return alerts;
}

export default function RecipeScreen() {
  const t = useTheme();
  const c = t.colors;
  const insets = useSafeInsets();
  const params = useLocalSearchParams<{ id?: string; mealId?: string }>();
  const catalog = useCatalog();
  const profile = useProfileStore((s) => s.profile);
  const found = useMeal(params.mealId);
  const meal = found && found.meal.recipeId === params.id ? found.meal : null;
  const recipe = params.id ? catalog.recipesById[params.id] : undefined;

  const defaultServings = meal?.servings ?? (profile ? householdServings(profile.household) : (recipe?.servings ?? 2));
  const [localServings, setLocalServings] = useState(defaultServings);
  const servings = meal ? meal.servings : localServings;
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  // `step` absent : le mode cuisine reprend l'étape de la session en cours.
  const [cooking, setCooking] = useState<{ open: boolean; step?: number }>({ open: false });
  const session = useCookingSession(recipe?.id);
  const resumable = !!session && (session.step > 0 || runningTimers(session) > 0);

  const lines = useMemo(
    () => (recipe ? scaledIngredientLines(recipe, servings, catalog.ingredientsById) : []),
    [recipe, servings, catalog],
  );
  const allergens = useMemo(
    () => (recipe ? allergenBadges(recipe, catalog.ingredientsById, profile?.allergens ?? []) : []),
    [recipe, catalog, profile],
  );
  const diets = useMemo(() => (recipe ? compatibleDiets(recipe, catalog.ingredientsById) : []), [recipe, catalog]);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });
  const heroH = HERO_H + insets.top;
  const emojiStyle = useAnimatedStyle(() => {
    const y = scrollY.get();
    return {
      transform: [
        { translateY: interpolate(y, [-200, 0, heroH], [-60, 0, heroH * 0.45], Extrapolation.CLAMP) },
        { scale: interpolate(y, [-200, 0, heroH], [1.35, 1, 0.8], Extrapolation.CLAMP) },
      ],
      opacity: interpolate(y, [0, heroH * 0.7], [1, 0], Extrapolation.CLAMP),
    };
  });
  const heroBgStyle = useAnimatedStyle(() => {
    const y = scrollY.get();
    return { transform: [{ translateY: y < 0 ? y : y * 0.3 }, { scale: y < 0 ? 1 + -y / heroH : 1 }] };
  });
  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [heroH - 140, heroH - 70], [0, 1], Extrapolation.CLAMP),
  }));
  const barTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [heroH - 90, heroH - 50], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.get(), [heroH - 90, heroH - 50], [8, 0], Extrapolation.CLAMP) }],
  }));

  const back = () => (router.canGoBack() ? router.back() : router.replace('/' as Href));

  if (!recipe) {
    return (
      <View style={[styles.root, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ padding: t.spacing.sm }}>
          <IconButton icon={ChevronLeft} accessibilityLabel="Retour" onPress={back} />
        </View>
        <EmptyState
          illustration={<EmptyBasket size={120} />}
          title="Recette introuvable"
          body="Elle a peut-être quitté le catalogue. Ta semaine, elle, t’attend."
          action={{ label: 'Retour à ma semaine', onPress: back }}
        />
      </View>
    );
  }

  const pastel = pastelFor(recipe.id);
  const heroBg = t.scheme === 'dark' ? pastel.dark : pastel.light;
  const conflicts = allergens.filter((a) => a.conflict);
  const setServings = (n: number) => {
    if (meal) usePlanStore.getState().setServings(meal.id, n);
    else setLocalServings(n);
  };
  const openCooking = (step?: number) => {
    haptics.impact();
    setCooking({ open: true, step });
  };
  const doneCount = lines.filter((l) => checked[l.key]).length;

  return (
    <View style={[styles.root, { backgroundColor: c.background }]} testID="recipe-screen">
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_right' }} />

      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: t.spacing.xxl }}>
        {/* En-tête immersif */}
        <View style={{ height: heroH }}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: heroBg, overflow: 'hidden' }, heroBgStyle]}>
            <CircleDecor tone="paper" placement="topRight" scale={0.8} />
          </Animated.View>
          <Animated.View style={[styles.heroEmoji, { paddingTop: insets.top }, emojiStyle]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text style={styles.emoji} allowFontScaling={false}>
              {recipe.emoji}
            </Text>
          </Animated.View>
        </View>

        {/* Contenu, en feuille posée sur l'en-tête */}
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: c.background,
              borderTopLeftRadius: t.radius.xl,
              borderTopRightRadius: t.radius.xl,
              paddingHorizontal: t.spacing.screen,
              paddingTop: t.spacing.xxl,
            },
          ]}
        >
          <View style={[styles.column, { maxWidth: t.layout.maxContentWidth, gap: t.spacing.xxl }]}>
            <View style={{ gap: t.spacing.sm }}>
              {meal ? (
                <Text variant="overline" color="accentText">
                  {formatDayLabel(meal.date, 'weekday')} · {MEAL_TYPE_LABELS[meal.type]}
                  {meal.locked ? ' · gardé' : ''}
                </Text>
              ) : (
                <Text variant="overline" color="textSecondary">
                  Cuisine {CUISINE_LABELS[recipe.cuisine].toLowerCase()}
                </Text>
              )}
              <Text variant="title1" accessibilityRole="header" testID="recipe-title">
                {recipe.title}
              </Text>
              <Text variant="callout" color="textSecondary">
                {recipe.description}
              </Text>
              <View style={[styles.chips, { marginTop: t.spacing.xs }]}>
                <Badge icon={Clock} label={`Prépa ${formatMinutes(recipe.prepTimeMin)}`} />
                {recipe.cookTimeMin > 0 ? <Badge icon={Flame} label={`Cuisson ${formatMinutes(recipe.cookTimeMin)}`} /> : null}
                <Badge icon={Gauge} label={DIFFICULTY_LABELS[recipe.difficulty]} />
                {recipe.kcalPerServing ? <Badge icon={UtensilsCrossed} label={`${recipe.kcalPerServing} kcal/pers.`} /> : null}
                <Badge icon={Globe} label={CUISINE_LABELS[recipe.cuisine]} />
              </View>
            </View>

            {/* Portions */}
            <View
              style={[
                styles.servings,
                { backgroundColor: c.surface, borderColor: c.border, borderRadius: t.radius.lg, padding: t.spacing.lg, boxShadow: boxShadow('sm', c.shadow) },
              ]}
            >
              <View style={[styles.servingsIcon, { backgroundColor: c.primarySoft, borderRadius: t.radius.sm }]}>
                <Users size={t.iconSize.md} color={t.scheme === 'dark' ? c.text : c.primary} />
              </View>
              <View style={styles.flex}>
                <Text variant="headline">Portions</Text>
                <Text variant="footnote" color="textSecondary">
                  {meal ? 'Ta liste de courses suit.' : 'Les quantités s’adaptent.'}
                </Text>
              </View>
              <Stepper value={servings} onChange={setServings} min={1} max={12} accessibilityLabel="Portions" testID="recipe-servings" />
            </View>

            {/* Allergènes & régimes */}
            <View style={{ gap: t.spacing.md }}>
              {conflicts.length > 0 ? (
                <InfoBanner
                  tone="danger"
                  title="Allergène déclaré"
                  message={`Ce plat contient : ${conflicts.map((a) => a.label.toLowerCase()).join(', ')}. Il ne devrait jamais t’être proposé.`}
                />
              ) : null}
              <View style={{ gap: t.spacing.sm }}>
                <Text variant="subhead" color="textSecondary">
                  Allergènes
                </Text>
                <View style={styles.chips} testID="recipe-allergens">
                  {allergens.length === 0 ? (
                    <Badge label="Aucun allergène majeur" tone="success" />
                  ) : (
                    allergens.map((a) => (
                      <Badge
                        key={a.allergen}
                        label={a.label}
                        tone={a.conflict ? 'danger' : 'neutral'}
                        variant={a.conflict ? 'solid' : 'soft'}
                        accessibilityLabel={a.conflict ? `${a.label}, déclaré dans ton profil` : a.label}
                      />
                    ))
                  )}
                </View>
              </View>
              {diets.length > 0 ? (
                <View style={{ gap: t.spacing.sm }}>
                  <Text variant="subhead" color="textSecondary">
                    Convient aux régimes
                  </Text>
                  <View style={styles.chips} testID="recipe-diets">
                    {diets.map((d) => (
                      <Badge key={d} label={dietLabel(d)} tone="success" />
                    ))}
                  </View>
                </View>
              ) : null}
            </View>

            {/* Ingrédients */}
            <View style={{ gap: t.spacing.sm }}>
              <SectionHeader
                title="Ingrédients"
                subtitle={doneCount > 0 ? `${doneCount} sur ${lines.length} prêts` : `Pour ${servings} portion${servings > 1 ? 's' : ''}`}
              />
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, borderRadius: t.radius.lg, paddingHorizontal: t.spacing.md, paddingVertical: t.spacing.xs }]}>
                <IngredientChecklist
                  lines={lines}
                  checked={checked}
                  onToggle={(key, v) => setChecked((s) => ({ ...s, [key]: v }))}
                  declaredAllergens={profile?.allergens}
                  testID="recipe-ingredients"
                />
              </View>
            </View>

            {/* Étapes */}
            <View style={{ gap: t.spacing.sm }}>
              <SectionHeader title="Préparation" subtitle={`${recipe.steps.length} étapes · ${formatMinutes(recipe.prepTimeMin + recipe.cookTimeMin)}`} />
              <StepList steps={recipe.steps} onOpenStep={openCooking} testID="recipe-steps" />
            </View>
          </View>
        </View>
      </Animated.ScrollView>

      {/* Barre supérieure : transparente sur l'en-tête, opaque en défilant */}
      <View style={[styles.topBar, { paddingTop: insets.top }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.background, borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth * 2 }, barStyle]} />
        <View style={[styles.barRow, { paddingHorizontal: t.spacing.sm }]}>
          <IconButton icon={ChevronLeft} variant="outlined" accessibilityLabel="Retour" onPress={back} testID="recipe-back" />
          <Animated.View style={[styles.barTitle, barTitleStyle]} pointerEvents="none">
            <Text variant="headline" numberOfLines={1}>
              {recipe.title}
            </Text>
          </Animated.View>
          {meal?.locked ? (
            // Simple indicateur (pas un bouton) : le verrou se règle depuis la carte du repas.
            <View
              accessible
              accessibilityRole="image"
              accessibilityLabel="Plat gardé dans ton planning"
              style={[styles.lockPill, { width: t.layout.minTouchTarget, height: t.layout.minTouchTarget, borderRadius: t.radius.pill, backgroundColor: c.accent }]}
              testID="recipe-locked"
            >
              <Lock size={t.iconSize.md} color={c.onAccent} />
            </View>
          ) : (
            <View style={styles.barSide} />
          )}
        </View>
      </View>

      {/* Pied collé */}
      <View
        style={[
          styles.footer,
          { backgroundColor: c.background, borderTopColor: c.border, paddingHorizontal: t.spacing.screen, paddingTop: t.spacing.md, paddingBottom: insets.bottom + t.spacing.md },
        ]}
      >
        <View style={[styles.column, { maxWidth: t.layout.maxContentWidth }]}>
          <Button
            label={resumable ? 'Reprendre la cuisine' : 'Mode cuisine'}
            leftIcon={ChefHat}
            size="lg"
            fullWidth
            onPress={() => openCooking()}
            testID="cooking-open"
          />
        </View>
      </View>

      <CookingMode
        visible={cooking.open}
        title={recipe.title}
        emoji={recipe.emoji}
        steps={recipe.steps}
        initialStep={cooking.step}
        sessionKey={recipe.id}
        timerAlerts={timerAlertsFor(recipe.id)}
        onClose={() => setCooking((s) => ({ ...s, open: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  column: { width: '100%', alignSelf: 'center' },
  heroEmoji: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 128, lineHeight: 150, textAlign: 'center' },
  sheet: { marginTop: -28 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  servings: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: StyleSheet.hairlineWidth * 2 },
  servingsIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: StyleSheet.hairlineWidth * 2 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  barRow: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 8 },
  barTitle: { flex: 1, alignItems: 'center' },
  barSide: { width: 44 },
  lockPill: { alignItems: 'center', justifyContent: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth * 2 },
});

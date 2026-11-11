/**
 * Remplacer un plat (feuille modale) : plat actuel en haut, recherche par
 * titre, alternatives SÛRES (planStore › getAlternatives : allergies, régimes,
 * ustensiles, type de repas vérifiés par le service). Toucher une alternative
 * → remplacement, vibration « succès », fermeture.
 */
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { Sparkles } from 'lucide-react-native';

import { EmptyBasket } from '@/components/brand';
import { AlternativeRow, alternativeReasons, filterAlternatives } from '@/components/feature/recipe';
import {
  Badge,
  EmptyState,
  RecipeThumb,
  SearchField,
  Sheet,
  staggerEntering,
  Text,
  useToast,
} from '@/components/ui';
import { foldText, formatDayLabel, MEAL_TYPE_LABELS, recipeTotalTime } from '@/core';
import { countLabel } from '@/lib/a11y';
import { haptics } from '@/lib/haptics';
import { useCatalog } from '@/services/catalog';
import { useMeal, usePlanStore, useProfileStore } from '@/stores';
import { useTheme } from '@/theme';

const IS_WEB = Platform.OS === 'web';
const SUGGESTED = 6;

export default function ReplaceMealScreen() {
  const t = useTheme();
  const c = t.colors;
  const toast = useToast();
  const { mealId } = useLocalSearchParams<{ mealId?: string }>();
  const found = useMeal(mealId);
  const catalog = useCatalog();
  const profile = useProfileStore((s) => s.profile);
  const [visible, setVisible] = useState(true);
  const [query, setQuery] = useState('');

  const meal = found?.meal ?? null;
  const current = meal ? catalog.recipesById[meal.recipeId] : undefined;
  // TOUTES les alternatives sûres du bon type, triées par score, calculées une fois à
  // l'ouverture (stables pendant la saisie) : la recherche doit trouver n'importe quel
  // plat possible, pas seulement les mieux classés.
  const [pool] = useState(() => (mealId ? usePlanStore.getState().getAlternatives(mealId, Number.MAX_SAFE_INTEGER) : []));

  const q = foldText(query.trim());
  const list = useMemo(() => filterAlternatives(pool, q, SUGGESTED), [pool, q]);

  const leaving = useRef(false);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/' as Href));
  /** Ferme la feuille (animation de sortie) puis la route. */
  const close = () => {
    if (leaving.current) return;
    leaving.current = true;
    if (!IS_WEB) {
      leave();
      return;
    }
    setVisible(false);
    setTimeout(leave, t.motion.duration.base + 40);
  };

  const pick = (recipeId: string) => {
    if (!meal) return;
    const res = usePlanStore.getState().swapMeal(meal.id, recipeId);
    if (!res.ok) {
      haptics.error();
      toast.show({ title: 'Impossible de remplacer', message: res.message, tone: 'danger' });
      return;
    }
    haptics.success();
    const r = catalog.recipesById[recipeId];
    toast.show({ title: 'Plat remplacé', message: r ? `${r.title} au menu.` : undefined, emoji: r?.emoji, tone: 'success' });
    close();
  };

  const title = 'Remplacer le plat';
  const subtitle = meal ? `${formatDayLabel(meal.date, 'weekday')} · ${MEAL_TYPE_LABELS[meal.type]} · ${countLabel(meal.servings, 'portion')}` : undefined;
  const content =
    !meal || !current ? (
      <EmptyState
        compact
        illustration={<EmptyBasket size={110} />}
        title="Ce repas n’est plus au menu"
        body="Il a peut-être été retiré ou remplacé entre-temps."
        action={{ label: 'Retour à ma semaine', onPress: close }}
      />
    ) : (
      <View style={{ gap: t.spacing.lg }}>
        <View style={[styles.current, { backgroundColor: c.backgroundAlt, borderRadius: t.radius.lg, padding: t.spacing.md }]}>
          <RecipeThumb emoji={current.emoji} seed={current.id} size="sm" />
          <View style={styles.flex}>
            <Text variant="overline" color="textSecondary">
              Actuellement
            </Text>
            <Text variant="bodyMedium" numberOfLines={1}>
              {current.title}
            </Text>
          </View>
          <Badge label={`${recipeTotalTime(current)} min`} size="sm" />
        </View>

        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Chercher un plat (curry, pâtes…)"
          accessibilityLabel="Chercher parmi les alternatives"
          testID="replace-search"
        />

        <View style={styles.headRow}>
          <Sparkles size={t.iconSize.sm} color={c.info} />
          <Text variant="subhead" color="textSecondary" style={styles.flex}>
            {q ? `${list.length} résultat${list.length > 1 ? 's' : ''}` : 'Idées choisies pour ton foyer, sans allergène déclaré'}
          </Text>
        </View>

        {list.length === 0 ? (
          <Animated.View entering={FadeIn}>
            <EmptyState
              compact
              title={q ? 'Aucun plat ne correspond' : 'Pas d’autre idée pour ce créneau'}
              body={q ? 'Essaie un autre mot : « poulet », « soupe », « rapide »…' : 'Tes critères sont stricts : c’est voulu, ta sécurité d’abord.'}
            />
          </Animated.View>
        ) : (
          <View style={{ gap: t.spacing.sm }}>
            {list.map((r, i) => (
              <Animated.View key={r.id} entering={staggerEntering(i)} layout={LinearTransition.springify().damping(t.motion.spring.damping)}>
                <AlternativeRow
                  recipe={r}
                  reasons={alternativeReasons(r, profile, current)}
                  onPress={() => pick(r.id)}
                  testID={`alt-${i}`}
                />
              </Animated.View>
            ))}
          </View>
        )}
      </View>
    );

  if (!IS_WEB) {
    // Natif : la route est déjà une feuille (formSheet, voir le layout racine).
    return (
      <ScrollView
        style={{ backgroundColor: c.surfaceElevated }}
        contentContainerStyle={{ padding: t.spacing.xl, paddingBottom: t.spacing.huge }}
        keyboardShouldPersistTaps="handled"
        testID="replace-sheet"
      >
        <View style={{ marginBottom: t.spacing.lg }}>
          <Text variant="title3" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="footnote" color="textSecondary">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {content}
      </ScrollView>
    );
  }

  // Web : fond transparent (l'écran précédent reste visible) + feuille du kit.
  return (
    <View style={styles.root} pointerEvents="box-none">
      <Stack.Screen options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
      <Sheet visible={visible} onClose={close} title={title} subtitle={subtitle} snapPoints={[0.88]} scrollable testID="replace-sheet">
        {content}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  flex: { flex: 1 },
  current: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});

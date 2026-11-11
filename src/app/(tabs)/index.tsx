/**
 * « Ma semaine » — étape 2 du parcours : Cabas propose les repas.
 *
 * En-tête (salut, semaine en cours / suivante, chiffres clés), bandeau des
 * jours collant, cartes repas midi / soir (glisser pour remplacer, verrou,
 * « Pourquoi ? », options), créneaux Premium en offre gratuite, état vide,
 * génération en squelettes, régénération « Nouvelles idées », puis carte
 * « Ma liste est prête » vers l'onglet Liste (étape 3).
 */
import { router, type Href } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  FadeIn,
  FadeInLeft,
  FadeInRight,
  LinearTransition,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Crown, Sparkles } from 'lucide-react-native';

import { Celebration, CookingPot, ProduceSet } from '@/components/brand';
import {
  AddSlotCard,
  computeWeekStats,
  DayStrip,
  GeneratingBanner,
  greetingFor,
  ListReadyCard,
  LockedSlotCard,
  MealCard,
  MealCardSkeleton,
  MealOptionsSheet,
  openSlotsOf,
  WeekStatsCard,
  type DayStripDay,
  type OpenSlot,
} from '@/components/feature/planning';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  InfoBanner,
  SegmentedControl,
  Skeleton,
  staggerEntering,
  Text,
  useSafeInsets,
  useToast,
} from '@/components/ui';
import type { PlannedMeal } from '@/core';
import { formatDayLabel, formatPrice, formatWeekRange, parseISODate, weekdayIndex, MONTH_SHORT } from '@/core';
import { useCurrentWeek, useHydrated, useSubscription } from '@/hooks';
import { haptics } from '@/lib/haptics';
import { listEstimateFor } from '@/services/basket';
import { useCatalog } from '@/services/catalog';
import {
  activeWeek,
  findMeal,
  isBasketStale,
  useBasketStore,
  useListStore,
  useMealsByDay,
  usePlanStore,
  useProfileStore,
  useWeekList,
  useWeekPlan,
  type DayMeals,
} from '@/stores';
import { useTheme } from '@/theme';

type WeekKey = 'current' | 'next';

export default function WeekScreen() {
  const t = useTheme();
  const c = t.colors;
  const insets = useSafeInsets();
  const toast = useToast();
  const reduced = useReducedMotion();
  const hydrated = useHydrated();

  const profile = useProfileStore((s) => s.profile);
  const week = useCurrentWeek();
  const ws = week.activeWeekStart;
  const plan = useWeekPlan(ws);
  const days = useMealsByDay(ws);
  // État de génération de CETTE semaine (une autre peut se générer en parallèle).
  const generating = usePlanStore((s) => s.generatingWeeks[ws] === true);
  const sub = useSubscription();
  const catalog = useCatalog();
  const list = useWeekList(ws);
  const basketTotal = useBasketStore((s) => (isBasketStale(s, list, ws) ? null : (s.plan?.totalCents ?? null)));

  const meals = useMemo(() => plan?.meals ?? [], [plan]);
  // Budget : panier calculé s'il est à jour, sinon liste chiffrée (meilleures offres), sinon estimation.
  // (Jamais chiffrée avec un produit contenant un allergène déclaré : comme le panier.)
  const allergens = profile?.allergens;
  const listEstimate = useMemo(
    () => (list && list.items.length > 0 ? listEstimateFor(list.items, allergens, catalog) : null),
    [list, allergens, catalog],
  );
  const stats = useMemo(
    () =>
      computeWeekStats(
        meals,
        catalog.recipesById,
        basketTotal !== null ? { cents: basketTotal, exact: true } : listEstimate !== null ? { cents: listEstimate, exact: false } : null,
      ),
    [meals, catalog, basketTotal, listEstimate],
  );
  // Jours passés exclus : pas de carte « Ajouter » / « Débloquer » pour hier.
  const openSlots = useMemo(() => openSlotsOf(profile, ws, meals, week.today), [profile, ws, meals, week.today]);
  const atFreeLimit = !sub.isPremium && meals.length >= sub.maxMealsPerWeek;
  const totalItems = list?.items.length ?? 0;
  const remainingItems = useMemo(() => (list?.items ?? []).filter((i) => !i.checked).length, [list]);

  // ── Semaine affichée : sens du glissement ─────────────────────────────────
  const [direction, setDirection] = useState<1 | -1>(1);
  const weekKey: WeekKey = week.isNextWeek ? 'next' : 'current';
  const switchWeek = (key: WeekKey) => {
    if (key === weekKey) return;
    setDirection(key === 'next' ? 1 : -1);
    // `days` décrit encore la semaine affichée (l'autre) : l'index d'aujourd'hui se calcule sans lui.
    setSelected(key === 'current' ? weekdayIndex(week.today) : 0);
    if (key === 'next') week.goToNextWeek();
    else week.goToCurrentWeek();
  };

  // ── Jour sélectionné + défilement au ressort ──────────────────────────────
  const [selected, setSelected] = useState(() => todayIndex(days, week.today));
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useSharedValue(0);
  const springY = useSharedValue(0);
  const autoScrolling = useSharedValue(false);
  const dayTops = useSharedValue<number[]>([]);
  const heldY = useSharedValue(-1);
  const layoutRef = useRef({ body: 0, strip: 0, content: 0, viewport: 0, days: [] as number[] });

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.set(e.contentOffset.y);
    },
    onBeginDrag: () => {
      autoScrolling.set(false);
    },
  });

  useAnimatedReaction(
    () => springY.get(),
    (y) => {
      if (autoScrolling.get()) scrollTo(scrollRef, 0, y, false);
    },
  );

  // Le jour actif suit le défilement manuel (pas celui déclenché par un toucher
  // sur le bandeau : on garde le jour choisi tant que l'utilisateur ne bouge pas).
  useAnimatedReaction(
    () => {
      if (autoScrolling.get() || scrollY.get() < 8) return -1;
      if (heldY.get() >= 0 && Math.abs(scrollY.get() - heldY.get()) < 24) return -1;
      const tops = dayTops.get();
      const y = scrollY.get() + 1;
      let idx = -1;
      for (let i = 0; i < tops.length; i++) if (tops[i] > 0 && tops[i] <= y + 80) idx = i;
      return idx;
    },
    (idx, prev) => {
      if (idx >= 0 && idx !== prev) scheduleOnRN(setSelected, idx);
    },
  );

  const publishTops = () => {
    const l = layoutRef.current;
    dayTops.set(l.days.map((y) => Math.max(1, l.body + y - l.strip)));
  };

  const scrollToDay = (i: number) => {
    setSelected(i);
    const l = layoutRef.current;
    const dayY = l.days[i];
    if (dayY === undefined) return;
    const max = Math.max(0, l.content - l.viewport);
    const target = Math.min(max, Math.max(0, l.body + dayY - l.strip - t.spacing.sm));
    heldY.set(target);
    if (reduced) {
      scrollRef.current?.scrollTo({ y: target, animated: false });
      return;
    }
    springY.set(scrollY.get());
    autoScrolling.set(true);
    springY.set(
      withSpring(target, { ...t.motion.springSheet, overshootClamping: true }, (finished) => {
        if (finished) autoScrolling.set(false);
      }),
    );
  };

  // ── Actions sur les repas ─────────────────────────────────────────────────
  const [menuMealId, setMenuMealId] = useState<string | null>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [celebrate, setCelebrate] = useState(0);
  const menuMeal = menuMealId ? (meals.find((m) => m.id === menuMealId) ?? null) : null;

  const openRecipe = (meal: PlannedMeal) =>
    router.push({ pathname: '/recette/[id]', params: { id: meal.recipeId, mealId: meal.id } } as unknown as Href);
  const openSwapSheet = (meal: PlannedMeal) =>
    router.push({ pathname: '/remplacer/[mealId]', params: { mealId: meal.id } } as unknown as Href);
  const goPremium = () => {
    haptics.tap();
    router.push('/premium' as Href);
  };

  const swapToBest = (meal: PlannedMeal) => {
    const store = usePlanStore.getState();
    const before = findMeal(store.plans, meal.id)?.meal;
    const alt = store.getAlternatives(meal.id, 1)[0];
    if (!alt || !before) {
      haptics.warning();
      toast.show({ title: 'Pas d’autre idée pour ce créneau', message: 'Essaie « Nouvelles idées » plus tard.', tone: 'neutral' });
      return;
    }
    const res = store.swapMeal(meal.id, alt.id);
    if (!res.ok) {
      haptics.error();
      toast.show({ title: 'Impossible de remplacer', message: res.message, tone: 'danger' });
      return;
    }
    haptics.success();
    toast.show({
      title: 'Plat remplacé',
      message: `${alt.title} au menu.`,
      emoji: alt.emoji,
      tone: 'accent',
      action: { label: 'Annuler', onPress: () => undoSwap(before, alt.id) },
    });
  };

  const undoSwap = (before: PlannedMeal, swappedTo: string) => {
    const store = usePlanStore.getState();
    const found = findMeal(store.plans, before.id);
    if (!found || found.meal.recipeId !== swappedTo) return;
    haptics.select();
    store.setPlan({ ...found.plan, meals: found.plan.meals.map((m) => (m.id === before.id ? { ...before, locked: m.locked, servings: m.servings } : m)) });
  };

  const generate = async (opts: { celebrate: boolean }) => {
    setConfirmRegen(false);
    haptics.impact();
    const res = await usePlanStore.getState().generate(ws, { keepLocked: true });
    if (!res.ok) {
      toast.show({ title: 'Oups', message: res.message, tone: 'danger' });
      return;
    }
    const fresh = useListStore.getState().lists[ws];
    const est = fresh ? listEstimateFor(fresh.items, useProfileStore.getState().profile?.allergens, catalog) : null;
    const s = computeWeekStats(res.plan.meals, catalog.recipesById, est !== null ? { cents: est, exact: false } : null);
    const message = `${s.meals} repas, ≈ ${formatPrice(Math.round(s.budgetCents / 100) * 100)} estimés.`;
    // L'utilisateur a changé de semaine entre-temps : pas de célébration ici, on nomme la semaine prête.
    if (res.plan.weekStart !== activeWeek()) {
      toast.show({ title: `Semaine du ${formatWeekRange(res.plan.weekStart)} prête`, message, tone: 'success' });
      return;
    }
    if (opts.celebrate) setCelebrate((n) => n + 1);
    toast.show({
      title: opts.celebrate ? 'Ta semaine est prête !' : 'Nouvelles idées au menu',
      message,
      tone: 'success',
    });
  };

  const addMeal = (slot: OpenSlot) => {
    const res = usePlanStore.getState().addMeal(slot);
    if (res.ok) haptics.success();
    else {
      haptics.warning();
      toast.show({ title: 'Pas possible', message: res.message, tone: 'neutral' });
    }
  };

  const goToList = () => {
    const store = usePlanStore.getState();
    if (plan && (!list || list.items.length === 0)) store.syncList(ws);
    router.navigate('/liste' as Href);
  };

  // ── Rendu ─────────────────────────────────────────────────────────────────
  const firstGen = !plan && !generating;
  const showStrip = !!plan || generating;
  const stripDays: DayStripDay[] = days.map((d) => ({
    date: d.date,
    meals: d.meals.length,
    locked: atFreeLimit ? openSlots.filter((s) => s.date === d.date).length : 0,
    isToday: d.isToday,
    isPast: d.isPast,
    label: d.label,
  }));
  const bodyEntering = (direction > 0 ? FadeInRight : FadeInLeft).springify().damping(t.motion.spring.damping).stiffness(t.motion.spring.stiffness);

  if (!hydrated) return <LoadingSkeleton topInset={insets.top} />;

  return (
    <View style={[styles.root, { backgroundColor: c.background }]} testID="week-screen">
      <View style={{ height: insets.top, backgroundColor: c.background }} />
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        stickyHeaderIndices={showStrip ? [1] : undefined}
        showsVerticalScrollIndicator={false}
        onLayout={(e) => {
          layoutRef.current.viewport = e.nativeEvent.layout.height;
        }}
        onContentSizeChange={(_, h) => {
          layoutRef.current.content = h;
        }}
        contentContainerStyle={{ paddingBottom: t.spacing.xxxl }}
      >
        {/* 0 · En-tête */}
        <View style={[styles.column, { paddingHorizontal: t.spacing.screen, maxWidth: t.layout.maxContentWidth }]}>
          <View style={[styles.header, { paddingTop: t.spacing.md }]}>
            <Text variant="overline" color="textSecondary">
              Semaine du {formatWeekRange(ws)}
            </Text>
            <Text variant="title1" accessibilityRole="header" testID="week-greeting">
              {greetingFor(profile?.displayName)}
            </Text>
          </View>
          <SegmentedControl<WeekKey>
            options={[
              { value: 'current', label: 'Cette semaine' },
              { value: 'next', label: 'La prochaine' },
            ]}
            value={weekKey}
            onChange={switchWeek}
            accessibilityLabel="Semaine affichée"
            style={{ marginTop: t.spacing.lg }}
            testID="week-switch"
          />
          {plan && plan.meals.length > 0 ? (
            <Animated.View key={`stats-${ws}`} entering={bodyEntering} style={{ marginTop: t.spacing.lg }}>
              <WeekStatsCard stats={stats} weeklyBudgetCents={profile?.weeklyBudgetCents} testID="week-stats" />
            </Animated.View>
          ) : null}
          {plan && atFreeLimit && openSlots.length > 0 ? (
            <InfoBanner
              tone="premium"
              icon={Crown}
              title="Débloque toute ta semaine"
              message={`Gratuit : ${sub.maxMealsPerWeek} repas par semaine. Avec Premium, Cabas planifie tes ${meals.length + openSlots.length} repas.`}
              action={{ label: 'Essayer 7 jours', onPress: goPremium }}
              style={{ marginTop: t.spacing.md }}
            />
          ) : null}
        </View>

        {/* 1 · Bandeau des jours (collant) */}
        {showStrip ? (
          <View
            onLayout={(e: LayoutChangeEvent) => {
              layoutRef.current.strip = e.nativeEvent.layout.height;
              publishTops();
            }}
            style={{ backgroundColor: c.background, paddingTop: t.spacing.md, paddingBottom: t.spacing.sm }}
          >
            <View style={[styles.column, { paddingHorizontal: t.spacing.screen - 4, maxWidth: t.layout.maxContentWidth }]}>
              <DayStrip days={stripDays} selectedIndex={selected} onSelect={scrollToDay} testID="day-strip" />
            </View>
          </View>
        ) : null}

        {/* 2 · Contenu */}
        <Animated.View
          key={`body-${ws}`}
          entering={bodyEntering}
          onLayout={(e) => {
            layoutRef.current.body = e.nativeEvent.layout.y;
            publishTops();
          }}
          style={[styles.column, { paddingHorizontal: t.spacing.screen, maxWidth: t.layout.maxContentWidth }]}
        >
          {firstGen ? (
            <EmptyState
              illustration={week.isNextWeek ? <ProduceSet size={150} /> : <CookingPot size={140} />}
              title={week.isNextWeek ? 'Prends de l’avance' : 'Ta semaine t’attend'}
              body={
                profile
                  ? 'Cabas te propose des repas adaptés à ton foyer, sans aucun allergène déclaré. En quelques secondes.'
                  : 'Crée ton profil : foyer, régimes, allergies et budget. Cabas s’occupe du reste.'
              }
              action={
                profile
                  ? { label: 'Générer ma semaine', leftIcon: Sparkles, onPress: () => void generate({ celebrate: true }) }
                  : { label: 'Créer mon profil', onPress: () => router.navigate('/profil' as Href) }
              }
            />
          ) : (
            <>
              {generating ? <GeneratingBanner testID="week-generating" /> : null}
              <View style={[styles.sectionRow, { marginTop: generating ? t.spacing.lg : t.spacing.sm }]}>
                <Text variant="title3" accessibilityRole="header">
                  Tes repas
                </Text>
                <Button
                  label="Nouvelles idées"
                  size="sm"
                  variant="tonal"
                  leftIcon={Sparkles}
                  disabled={generating || !profile}
                  onPress={() => {
                    haptics.warning();
                    setConfirmRegen(true);
                  }}
                  testID="regenerate"
                />
              </View>
              {days.map((d, i) => (
                <DaySection
                  key={d.date}
                  day={d}
                  index={i}
                  generating={generating}
                  openSlots={openSlots.filter((s) => s.date === d.date)}
                  atFreeLimit={atFreeLimit}
                  onLayoutY={(y) => {
                    layoutRef.current.days[i] = y;
                    publishTops();
                  }}
                  renderMeal={(m) => {
                    const recipe = catalog.recipesById[m.recipeId];
                    if (!recipe) return null;
                    return (
                      <MealCard
                        key={m.id}
                        meal={m}
                        recipe={recipe}
                        swipeEnabled={!generating}
                        onOpen={() => openRecipe(m)}
                        onToggleLock={() => usePlanStore.getState().toggleLock(m.id)}
                        onSwipeSwap={() => swapToBest(m)}
                        onOpenSwap={() => openSwapSheet(m)}
                        onOpenMenu={() => {
                          haptics.impact();
                          setMenuMealId(m.id);
                        }}
                        testID={`meal-${d.weekday}-${m.type}`}
                      />
                    );
                  }}
                  onLockedPress={goPremium}
                  onAddPress={addMeal}
                />
              ))}
              {plan && !generating && meals.length > 0 ? (
                <Animated.View entering={FadeIn.delay(200)} style={{ marginTop: t.spacing.xxl }}>
                  <ListReadyCard items={remainingItems} total={totalItems} onPress={goToList} testID="list-ready" />
                </Animated.View>
              ) : null}
            </>
          )}
        </Animated.View>
      </Animated.ScrollView>

      {celebrate > 0 ? (
        <View pointerEvents="none" style={styles.celebrate}>
          <Celebration size={220} playKey={celebrate} accessibilityLabel="Ta semaine est prête" />
        </View>
      ) : null}

      <MealOptionsSheet
        visible={!!menuMeal}
        meal={menuMeal}
        recipe={menuMeal ? (catalog.recipesById[menuMeal.recipeId] ?? null) : null}
        onClose={() => setMenuMealId(null)}
        onServingsChange={(n) => menuMeal && usePlanStore.getState().setServings(menuMeal.id, n)}
        onToggleLock={() => menuMeal && usePlanStore.getState().toggleLock(menuMeal.id)}
        onSwap={() => {
          const m = menuMeal;
          setMenuMealId(null);
          if (m) openSwapSheet(m);
        }}
        onOpenRecipe={() => {
          const m = menuMeal;
          setMenuMealId(null);
          if (m) openRecipe(m);
        }}
        onRemove={() => {
          const m = menuMeal;
          setMenuMealId(null);
          if (!m) return;
          const before = findMeal(usePlanStore.getState().plans, m.id);
          usePlanStore.getState().removeMeal(m.id);
          toast.show({
            title: 'Repas retiré',
            tone: 'neutral',
            action: before ? { label: 'Annuler', onPress: () => usePlanStore.getState().setPlan(before.plan) } : undefined,
          });
        }}
      />

      <ConfirmDialog
        visible={confirmRegen}
        onClose={() => setConfirmRegen(false)}
        onConfirm={() => void generate({ celebrate: false })}
        title="De nouvelles idées ?"
        message={
          meals.some((m) => m.locked)
            ? 'Cabas remplace les plats non verrouillés. Tes plats verrouillés restent en place.'
            : 'Cabas remplace tous les plats de la semaine. Astuce : verrouille ceux que tu veux garder.'
        }
        confirmLabel="Nouvelles idées"
        testID="regen-confirm"
      />
    </View>
  );
}

// ─── Sous-composants ─────────────────────────────────────────────────────────

function todayIndex(days: readonly DayMeals[], today: string): number {
  const i = days.findIndex((d) => d.date === today);
  return i >= 0 ? i : 0;
}

interface DaySectionProps {
  day: DayMeals;
  index: number;
  generating: boolean;
  openSlots: OpenSlot[];
  atFreeLimit: boolean;
  onLayoutY: (y: number) => void;
  renderMeal: (meal: PlannedMeal) => React.ReactNode;
  onLockedPress: () => void;
  onAddPress: (slot: OpenSlot) => void;
}

function DaySection({ day, index, generating, openSlots, atFreeLimit, onLayoutY, renderMeal, onLockedPress, onAddPress }: DaySectionProps) {
  const t = useTheme();
  const d = parseISODate(day.date);
  const short = `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
  const hasContent = day.meals.length > 0 || openSlots.length > 0;
  return (
    <View
      onLayout={(e) => onLayoutY(e.nativeEvent.layout.y)}
      style={{ marginTop: t.spacing.xl }}
      testID={`day-${index}`}
      accessibilityLabel={formatDayLabel(day.date, 'long')}
    >
      <View style={[styles.dayHeader, { marginBottom: t.spacing.sm }]}>
        <Text variant="headline" color={day.isPast ? 'textSecondary' : 'text'} accessibilityRole="header">
          {day.weekdayLabel}
        </Text>
        <Text variant="footnote" color="textSecondary">
          {short}
        </Text>
        {day.isToday ? <Badge label="Aujourd’hui" tone="accent" size="sm" /> : null}
      </View>
      <View style={{ gap: t.spacing.sm }}>
        {generating ? (
          <>
            <MealCardSkeleton />
            {index % 3 === 2 ? <MealCardSkeleton /> : null}
          </>
        ) : (
          <>
            {day.meals.map((m, k) => (
              <Animated.View
                key={m.id}
                entering={staggerEntering(index * 2 + k)}
                layout={LinearTransition.springify().damping(t.motion.spring.damping)}
              >
                {renderMeal(m)}
              </Animated.View>
            ))}
            {openSlots.map((s) => (
              <Animated.View key={`${s.date}-${s.type}`} entering={staggerEntering(index * 2 + 1)} layout={LinearTransition}>
                {atFreeLimit ? (
                  <LockedSlotCard type={s.type} onPress={onLockedPress} testID={`locked-${index}-${s.type}`} />
                ) : (
                  <AddSlotCard type={s.type} onPress={() => onAddPress(s)} testID={`add-${index}-${s.type}`} />
                )}
              </Animated.View>
            ))}
            {!hasContent ? (
              <Text variant="footnote" color="textTertiary">
                Pas de repas prévu ce jour-là.
              </Text>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

function LoadingSkeleton({ topInset }: { topInset: number }) {
  const t = useTheme();
  return (
    <View
      style={[styles.root, { backgroundColor: t.colors.background, paddingTop: topInset + t.spacing.md, paddingHorizontal: t.spacing.screen }]}
      accessibilityLabel="Chargement de ta semaine"
    >
      <View style={[styles.column, { maxWidth: t.layout.maxContentWidth, gap: t.spacing.md }]}>
        <Skeleton width={120} height={12} />
        <Skeleton width={200} height={30} />
        <Skeleton height={46} radius={t.radius.pill} />
        <Skeleton height={110} radius={t.radius.xl} />
        <Skeleton height={68} radius={t.radius.lg} />
        <MealCardSkeleton />
        <MealCardSkeleton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  column: { width: '100%', alignSelf: 'center' },
  header: { gap: 2 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  celebrate: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});

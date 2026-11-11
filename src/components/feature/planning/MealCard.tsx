/**
 * Carte d'un repas planifié (« Midi » / « Soir »).
 *
 * - toucher la carte → fiche recette ;
 * - GLISSER VERS LA GAUCHE au-delà du seuil → remplacement instantané par la
 *   meilleure alternative (`onSwipeSwap`) : la carte revient au ressort et son
 *   contenu se retourne (flip) sur le nouveau plat ;
 * - icône « remplacer » → feuille des alternatives (`onOpenSwap`) ;
 * - cadenas → verrouille le plat (la régénération le garde) ;
 * - « Pourquoi ? » → déplie la raison de la suggestion ;
 * - « … » ou appui long → options (portions, retirer…).
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Clock, Ellipsis, Lock, LockOpen, Shuffle, Sparkles, Users } from 'lucide-react-native';

import { Badge, IconButton, PressableScale, RecipeThumb, Text } from '@/components/ui';
import type { PlannedMeal, Recipe } from '@/core';
import { MEAL_TYPE_LABELS, recipeTotalTime } from '@/core';
import { countLabel } from '@/lib/a11y';
import { haptics } from '@/lib/haptics';
import { boxShadow, useTheme } from '@/theme';

import { dampenSwipe, shouldSwapOnRelease, swipeProgress, SWIPE_ACTIVATION_PX } from './swipe';

export interface MealCardProps {
  meal: PlannedMeal;
  recipe: Recipe;
  onOpen: () => void;
  onToggleLock: () => void;
  /** Glissé au-delà du seuil : remplacer tout de suite. */
  onSwipeSwap: () => void;
  /** Icône « remplacer » : choisir parmi les alternatives. */
  onOpenSwap: () => void;
  /** « … » ou appui long : options du repas. */
  onOpenMenu: () => void;
  /** Désactive le glisser (génération en cours…). */
  swipeEnabled?: boolean;
  testID?: string;
}

export function MealCard({
  meal,
  recipe,
  onOpen,
  onToggleLock,
  onSwipeSwap,
  onOpenSwap,
  onOpenMenu,
  swipeEnabled = true,
  testID,
}: MealCardProps) {
  const t = useTheme();
  const c = t.colors;
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [showReason, setShowReason] = useState(false);
  // Après un glisser, le relâchement ne doit pas ouvrir la recette.
  const draggedAt = useRef(0);

  const translateX = useSharedValue(0);
  const flip = useSharedValue(0);
  const armed = useSharedValue(0);

  // Nouveau plat : la carte se retourne (sauf au premier rendu).
  const prevRecipe = useRef(recipe.id);
  useEffect(() => {
    if (prevRecipe.current === recipe.id) return;
    prevRecipe.current = recipe.id;
    if (reduced) return;
    flip.set(withSequence(withTiming(1, { duration: 0 }), withSpring(0, t.motion.springBouncy)));
  }, [recipe.id, reduced, flip, t.motion.springBouncy]);

  const markDragged = () => {
    draggedAt.current = Date.now();
  };
  const onArm = () => haptics.select();
  const spring = t.motion.spring;
  const snappy = t.motion.springSnappy;

  const pan = usePanGesture({
    enabled: swipeEnabled,
    activeOffsetX: [-SWIPE_ACTIVATION_PX, SWIPE_ACTIVATION_PX],
    failOffsetY: [-10, 10],
    onActivate: () => {
      'worklet';
      scheduleOnRN(markDragged);
    },
    onUpdate: (e) => {
      'worklet';
      translateX.set(dampenSwipe(e.translationX, width));
      const p = swipeProgress(e.translationX, width);
      if (p >= 1 && armed.get() === 0) {
        armed.set(1);
        scheduleOnRN(onArm);
      } else if (p < 1 && armed.get() === 1) {
        armed.set(0);
      }
    },
    onDeactivate: (e) => {
      'worklet';
      const swap = shouldSwapOnRelease(e.translationX, e.velocityX, width);
      armed.set(0);
      translateX.set(withSpring(0, swap ? snappy : spring));
      if (swap) scheduleOnRN(onSwipeSwap);
      scheduleOnRN(markDragged);
    },
  });

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.get() }] }));
  const flipStyle = useAnimatedStyle(() => ({
    opacity: interpolate(flip.get(), [0, 0.6, 1], [1, 0.4, 0], Extrapolation.CLAMP),
    transform: [{ perspective: 800 }, { rotateX: `${flip.get() * 75}deg` }, { scale: 1 - flip.get() * 0.06 }],
  }));
  const bgStyle = useAnimatedStyle(() => {
    const p = swipeProgress(translateX.get(), width);
    return { opacity: interpolate(p, [0, 0.15, 1], [0, 0.85, 1], Extrapolation.CLAMP) };
  });
  const actionStyle = useAnimatedStyle(() => {
    const p = swipeProgress(translateX.get(), width);
    return {
      transform: [
        { scale: withSpring(armed.get() ? 1.12 : interpolate(p, [0, 1], [0.7, 1], Extrapolation.CLAMP), snappy) },
        { rotate: `${interpolate(p, [0, 1], [-90, 0], Extrapolation.CLAMP)}deg` },
      ],
    };
  });

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const open = () => {
    if (Date.now() - draggedAt.current < 350) return;
    onOpen();
  };

  const total = recipeTotalTime(recipe);
  const typeLabel = MEAL_TYPE_LABELS[meal.type];
  const locked = !!meal.locked;
  const radius = t.radius.lg;

  return (
    <View onLayout={onLayout} testID={testID} style={styles.wrap}>
      {/* Arrière-plan révélé par le glisser */}
      <Animated.View
        pointerEvents="none"
        style={[styles.actionBg, { backgroundColor: c.accent, borderRadius: radius, paddingRight: t.spacing.xl }, bgStyle]}
      >
        <Animated.View style={actionStyle}>
          <Shuffle size={t.iconSize.lg} color={c.onAccent} strokeWidth={2.4} />
        </Animated.View>
        <Text variant="headline" style={{ color: c.onAccent }}>
          Remplacer
        </Text>
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={cardStyle}>
          <View
            style={[
              styles.card,
              {
                backgroundColor: c.surface,
                borderRadius: radius,
                borderColor: locked ? c.accent : c.border,
                boxShadow: boxShadow('sm', c.shadow),
                padding: t.spacing.md,
              },
            ]}
          >
            <Animated.View style={flipStyle}>
              <View style={styles.top}>
                <PressableScale
                  onPress={open}
                  onLongPress={onOpenMenu}
                  delayLongPress={380}
                  scaleTo={0.98}
                  accessibilityLabel={`${typeLabel} : ${recipe.title}, ${countLabel(total, 'minute')}, ${countLabel(meal.servings, 'portion')}${locked ? ', verrouillé' : ''}`}
                  accessibilityHint="Ouvre la recette. Glisse vers la gauche pour remplacer le plat."
                  accessibilityActions={[
                    { name: 'activate', label: 'Ouvrir la recette' },
                    { name: 'swap', label: 'Remplacer par une autre idée' },
                    { name: 'longpress', label: 'Options du repas' },
                  ]}
                  onAccessibilityAction={(e) => {
                    if (e.nativeEvent.actionName === 'swap') onSwipeSwap();
                    else if (e.nativeEvent.actionName === 'longpress') onOpenMenu();
                    else onOpen();
                  }}
                  testID={testID ? `${testID}-open` : undefined}
                  style={styles.main}
                >
                  <RecipeThumb emoji={recipe.emoji} seed={recipe.id} size="lg" />
                  <View style={styles.body}>
                    <Text variant="overline" color={meal.type === 'dejeuner' ? 'accentText' : 'textSecondary'}>
                      {typeLabel}
                    </Text>
                    <Text variant="headline" numberOfLines={2} style={styles.title}>
                      {recipe.title}
                    </Text>
                    <View style={styles.badges}>
                      <Badge size="sm" icon={Clock} label={`${total} min`} accessibilityLabel={`${total} minutes`} />
                      <Badge size="sm" icon={Users} label={`${meal.servings} pers.`} accessibilityLabel={countLabel(meal.servings, 'portion')} />
                    </View>
                  </View>
                </PressableScale>
                <View style={styles.side}>
                  <IconButton
                    icon={locked ? Lock : LockOpen}
                    size="sm"
                    variant={locked ? 'accent' : 'plain'}
                    color={locked ? undefined : c.textTertiary}
                    haptic="select"
                    accessibilityLabel={locked ? 'Déverrouiller ce plat' : 'Verrouiller ce plat'}
                    accessibilityHint="Un plat verrouillé est gardé quand tu demandes de nouvelles idées."
                    accessibilityState={{ checked: locked }}
                    onPress={onToggleLock}
                    testID={testID ? `${testID}-lock` : undefined}
                  />
                  <IconButton
                    icon={Ellipsis}
                    size="sm"
                    color={c.textSecondary}
                    accessibilityLabel={`Options : ${recipe.title}`}
                    onPress={onOpenMenu}
                    testID={testID ? `${testID}-menu` : undefined}
                  />
                </View>
              </View>

              <View style={[styles.footer, { marginTop: t.spacing.sm }]}>
                {meal.reason ? (
                  <PressableScale
                    haptic="select"
                    onPress={() => setShowReason((v) => !v)}
                    accessibilityLabel="Pourquoi ce plat ?"
                    accessibilityState={{ expanded: showReason }}
                    hitSlop={8}
                    style={[styles.why, { backgroundColor: c.infoSoft, borderRadius: t.radius.pill }]}
                    testID={testID ? `${testID}-why` : undefined}
                  >
                    <Sparkles size={t.iconSize.xs} color={c.info} strokeWidth={2.4} />
                    <Text variant="caption" style={{ color: c.info }}>
                      Pourquoi ?
                    </Text>
                  </PressableScale>
                ) : (
                  <View />
                )}
                <PressableScale
                  onPress={onOpenSwap}
                  accessibilityLabel={`Remplacer ${recipe.title}`}
                  hitSlop={8}
                  style={[styles.swap, { backgroundColor: c.primarySoft, borderRadius: t.radius.pill }]}
                  testID={testID ? `${testID}-swap` : undefined}
                >
                  <Shuffle size={t.iconSize.xs} color={t.scheme === 'dark' ? c.text : c.primary} strokeWidth={2.4} />
                  <Text variant="caption" style={{ color: t.scheme === 'dark' ? c.text : c.primary }}>
                    Changer
                  </Text>
                </PressableScale>
              </View>

              {showReason && meal.reason ? (
                <Animated.View
                  entering={FadeIn.duration(t.motion.duration.base)}
                  exiting={FadeOut.duration(t.motion.duration.fast)}
                  layout={LinearTransition.springify().damping(t.motion.spring.damping)}
                  style={[styles.reason, { backgroundColor: c.infoSoft, borderRadius: t.radius.md }]}
                >
                  <Text variant="footnote" style={{ color: c.text }} accessibilityLiveRegion="polite">
                    {meal.reason}
                  </Text>
                </Animated.View>
              ) : null}
            </Animated.View>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  actionBg: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  card: { borderWidth: StyleSheet.hairlineWidth * 2 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72 },
  body: { flex: 1, gap: 3 },
  title: { marginBottom: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  side: { alignItems: 'center', gap: 2, marginRight: -4, marginTop: -4 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  why: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 32 },
  swap: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 32 },
  reason: { marginTop: 10, paddingHorizontal: 12, paddingVertical: 10 },
});

/**
 * Mode cuisine : plein écran, une étape à la fois, gros texte.
 *
 * - glisser à gauche / à droite, boutons « Précédente » / « Suivante »,
 *   pastilles de progression touchables ;
 * - minuteur par étape (anneau `ProgressRing` qui se remplit) : il continue
 *   de tourner quand on passe à l'étape suivante ; à l'échéance, vibration
 *   « succès » + bandeau façon notification ;
 * - l'écran reste allumé (expo-keep-awake) tant que le mode est ouvert ;
 * - dernière étape → « C'est prêt ! » et petite célébration.
 */
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeInUp,
  FadeOutUp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { BellRing, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Timer, X } from 'lucide-react-native';

import { Celebration } from '@/components/brand';
import { Button, IconButton, PressableScale, ProgressRing, Text, useSafeInsets } from '@/components/ui';
import type { RecipeStep } from '@/core';
import { announce } from '@/lib/a11y';
import { haptics } from '@/lib/haptics';
import { boxShadow, useTheme } from '@/theme';

import { formatCountdown, formatCountdownA11y, useCountdown } from './timer';

export interface CookingModeProps {
  visible: boolean;
  title: string;
  emoji?: string;
  steps: readonly RecipeStep[];
  initialStep?: number;
  onClose: () => void;
  testID?: string;
}

const KEEP_AWAKE_TAG = 'cabas-cooking-mode';

/** Index borné à [0, count] (count = page « C'est prêt »). */
export function clampStep(index: number, count: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(count, Math.round(index)));
}

export function CookingMode({ visible, ...rest }: CookingModeProps) {
  if (!visible) return null;
  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={rest.onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.flex}>
        <CookingModeContent {...rest} />
      </GestureHandlerRootView>
    </Modal>
  );
}

type ContentProps = Omit<CookingModeProps, 'visible'>;

export function CookingModeContent({ title, emoji, steps, initialStep = 0, onClose, testID = 'cooking-mode' }: ContentProps) {
  const t = useTheme();
  const c = t.colors;
  const insets = useSafeInsets();
  const reduced = useReducedMotion();
  const { width: winW } = useWindowDimensions();
  const count = steps.length;
  const [index, setIndex] = useState(() => clampStep(initialStep, Math.max(0, count - 1)));
  const [pageW, setPageW] = useState(Math.min(winW, t.layout.maxContentWidth));
  const [notice, setNotice] = useState<{ id: number; step: number } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finished = index >= count;

  // Écran allumé pendant toute la session de cuisine.
  useEffect(() => {
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      try {
        void Promise.resolve(deactivateKeepAwake(KEEP_AWAKE_TAG)).catch(() => undefined);
      } catch {
        // Indisponible (web sans Wake Lock) : sans conséquence.
      }
    };
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  const translateX = useSharedValue(-index * pageW);
  const dragStart = useSharedValue(0);

  const goTo = useCallback(
    (next: number) => {
      const target = clampStep(next, count);
      setIndex(target);
      if (target === count) haptics.success();
      else haptics.select();
      announce(target === count ? 'C’est prêt, bon appétit !' : `Étape ${target + 1} sur ${count}`);
    },
    [count],
  );

  useEffect(() => {
    translateX.set(reduced ? -index * pageW : withSpring(-index * pageW, t.motion.springSheet));
  }, [index, pageW, reduced, translateX, t.motion.springSheet]);

  const onTimerDone = useCallback((step: number) => {
    haptics.success();
    announce(`Minuteur terminé pour l’étape ${step + 1}`);
    setNotice({ id: Date.now(), step });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 6000);
  }, []);

  const springSheet = t.motion.springSheet;
  const pan = usePanGesture({
    activeOffsetX: [-16, 16],
    failOffsetY: [-14, 14],
    onActivate: () => {
      'worklet';
      dragStart.set(translateX.get());
    },
    onUpdate: (e) => {
      'worklet';
      translateX.set(dragStart.get() + e.translationX);
    },
    onDeactivate: (e) => {
      'worklet';
      const threshold = pageW * 0.22;
      let next = index;
      if (e.translationX < -threshold || e.velocityX < -700) next = Math.min(count, index + 1);
      else if (e.translationX > threshold || e.velocityX > 700) next = Math.max(0, index - 1);
      if (next !== index) scheduleOnRN(goTo, next);
      else translateX.set(withSpring(-index * pageW, springSheet));
    },
  });
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.get() }] }));

  return (
    <View testID={testID} style={[styles.flex, { backgroundColor: c.background, paddingTop: insets.top }]}>
      {/* En-tête */}
      <View style={[styles.header, { paddingHorizontal: t.spacing.sm }]}>
        <IconButton icon={X} accessibilityLabel="Quitter le mode cuisine" onPress={onClose} testID={`${testID}-close`} />
        <View style={styles.headerTitle}>
          <Text variant="overline" color="textSecondary" numberOfLines={1}>
            Mode cuisine
          </Text>
          <Text variant="headline" numberOfLines={1}>
            {emoji ? `${emoji} ` : ''}
            {title}
          </Text>
        </View>
        <View style={styles.headerSide} />
      </View>

      {/* Pastilles de progression */}
      <View style={[styles.dots, { paddingHorizontal: t.spacing.screen }]} accessibilityRole="tablist" accessibilityLabel="Étapes">
        {steps.map((_, i) => (
          <PressableScale
            key={i}
            accessibilityRole="tab"
            accessibilityLabel={`Aller à l’étape ${i + 1}`}
            accessibilityState={{ selected: i === index }}
            haptic="none"
            scaleTo={0.8}
            onPress={() => goTo(i)}
            style={styles.dotHit}
            testID={`${testID}-dot-${i}`}
          >
            <View
              style={[
                styles.dot,
                {
                  backgroundColor: i < index || finished ? c.success : i === index ? c.accent : c.backgroundAlt,
                  borderRadius: t.radius.pill,
                },
              ]}
            />
          </PressableScale>
        ))}
      </View>

      {/* Pages */}
      <View style={styles.pager} onLayout={(e) => setPageW(e.nativeEvent.layout.width)}>
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.row, { width: pageW * (count + 1) }, rowStyle]}>
            {steps.map((s, i) => (
              <StepPage
                key={i}
                step={s}
                index={i}
                count={count}
                width={pageW}
                active={i === index}
                onTimerDone={onTimerDone}
                testID={`${testID}-step-${i}`}
              />
            ))}
            <View style={[styles.page, styles.done, { width: pageW, paddingHorizontal: t.spacing.screen }]}>
              {finished ? (
                <Animated.View entering={FadeIn.duration(t.motion.duration.base)} style={styles.doneInner}>
                  <Celebration size={200} playKey="done" haptic={false} accessibilityLabel="C’est prêt">
                    <Text style={{ fontSize: 72, lineHeight: 84 }}>{emoji ?? '🍽️'}</Text>
                  </Celebration>
                  <Text variant="title1" align="center" accessibilityRole="header">
                    C’est prêt !
                  </Text>
                  <Text variant="callout" color="textSecondary" align="center">
                    Bon appétit. Pense à cocher ce qu’il te reste pour la liste de la semaine prochaine.
                  </Text>
                </Animated.View>
              ) : null}
            </View>
          </Animated.View>
        </GestureDetector>
      </View>

      {/* Navigation */}
      <View
        style={[
          styles.footer,
          { paddingHorizontal: t.spacing.screen, paddingBottom: insets.bottom + t.spacing.lg, paddingTop: t.spacing.md, gap: t.spacing.sm },
        ]}
      >
        {finished ? (
          <Button label="Terminer" size="lg" fullWidth onPress={onClose} testID={`${testID}-finish`} />
        ) : (
          <>
            <Button
              label="Précédente"
              variant="tonal"
              size="lg"
              leftIcon={ChevronLeft}
              disabled={index === 0}
              onPress={() => goTo(index - 1)}
              accessibilityLabel="Étape précédente"
              style={styles.flex}
              testID={`${testID}-prev`}
            />
            <Button
              label={index === count - 1 ? 'C’est prêt' : 'Suivante'}
              size="lg"
              rightIcon={ChevronRight}
              onPress={() => goTo(index + 1)}
              accessibilityLabel={index === count - 1 ? 'Terminer la recette' : 'Étape suivante'}
              style={styles.flex}
              testID={`${testID}-next`}
            />
          </>
        )}
      </View>

      {/* Bandeau « minuteur terminé » (façon notification) */}
      {notice ? (
        <Animated.View
          key={notice.id}
          entering={FadeInUp.springify().damping(t.motion.springToast.damping).stiffness(t.motion.springToast.stiffness)}
          exiting={FadeOutUp.duration(t.motion.duration.fast)}
          style={[styles.notice, { top: insets.top + t.spacing.sm, left: t.spacing.lg, right: t.spacing.lg }]}
        >
          <PressableScale
            accessibilityRole="alert"
            accessibilityLabel={`Minuteur terminé : étape ${notice.step + 1}. Toucher pour y aller.`}
            onPress={() => {
              goTo(notice.step);
              setNotice(null);
            }}
            style={[
              styles.noticeCard,
              { backgroundColor: c.hero, borderRadius: t.radius.lg, padding: t.spacing.md, boxShadow: boxShadow('lg', c.shadow) },
            ]}
            testID={`${testID}-notice`}
          >
            <View style={[styles.noticeIcon, { backgroundColor: c.accent, borderRadius: t.radius.sm }]}>
              <BellRing size={t.iconSize.md} color={c.onAccent} strokeWidth={2.4} />
            </View>
            <View style={styles.flex}>
              <Text variant="headline" style={{ color: c.heroText }}>
                Minuteur terminé
              </Text>
              <Text variant="footnote" style={{ color: c.heroText, opacity: 0.85 }} numberOfLines={2}>
                Étape {notice.step + 1} : {steps[notice.step]?.text}
              </Text>
            </View>
          </PressableScale>
        </Animated.View>
      ) : null}
    </View>
  );
}

// ─── Une étape ───────────────────────────────────────────────────────────────

interface StepPageProps {
  step: RecipeStep;
  index: number;
  count: number;
  width: number;
  active: boolean;
  onTimerDone: (index: number) => void;
  testID?: string;
}

function StepPage({ step, index, count, width, active, onTimerDone, testID }: StepPageProps) {
  const t = useTheme();
  return (
    <View
      style={[styles.page, { width, paddingHorizontal: t.spacing.screen }]}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      testID={testID}
    >
      <Text variant="overline" color="accentText">
        Étape {index + 1} sur {count}
      </Text>
      <Text
        style={[
          t.typography.title2,
          { fontFamily: t.typography.bodyMedium.fontFamily, color: t.colors.text, marginTop: t.spacing.sm },
        ]}
        maxFontSizeMultiplier={1.4}
        accessibilityRole="header"
      >
        {step.text}
      </Text>
      {step.timerMin ? (
        <StepTimer minutes={step.timerMin} onDone={() => onTimerDone(index)} testID={testID ? `${testID}-timer` : undefined} />
      ) : null}
    </View>
  );
}

function StepTimer({ minutes, onDone, testID }: { minutes: number; onDone: () => void; testID?: string }) {
  const t = useTheme();
  const c = t.colors;
  const timer = useCountdown(minutes * 60, onDone);
  const { status } = timer.state;
  const running = status === 'running';
  const done = status === 'done';
  return (
    <View style={[styles.timer, { backgroundColor: c.surface, borderColor: c.border, borderRadius: t.radius.xl, marginTop: t.spacing.xxl }]} testID={testID}>
      <ProgressRing
        progress={timer.progress}
        size={132}
        strokeWidth={10}
        tone={done ? 'success' : 'accent'}
        accessibilityLabel={done ? 'Minuteur terminé' : `Temps restant : ${formatCountdownA11y(timer.remainingMs)}`}
      >
        <Text variant="title2" tabular testID={testID ? `${testID}-value` : undefined}>
          {done ? '0:00' : formatCountdown(timer.remainingMs)}
        </Text>
        <Text variant="caption" color={done ? 'success' : 'textSecondary'}>
          {done ? 'Terminé' : running ? 'en cours' : status === 'paused' ? 'en pause' : `${minutes} min`}
        </Text>
      </ProgressRing>
      <View style={styles.timerActions}>
        <Button
          label={running ? 'Pause' : done ? 'Relancer' : status === 'paused' ? 'Reprendre' : 'Lancer le minuteur'}
          leftIcon={running ? Pause : done ? RotateCcw : status === 'idle' ? Timer : Play}
          variant={running ? 'tonal' : 'secondary'}
          onPress={() => {
            if (running) {
              haptics.select();
              timer.pause();
            } else {
              haptics.impact();
              timer.start();
            }
          }}
          testID={testID ? `${testID}-toggle` : undefined}
        />
        {status === 'paused' || (running && timer.progress > 0) ? (
          <Animated.View entering={FadeIn}>
            <IconButton icon={RotateCcw} variant="outlined" accessibilityLabel="Remettre le minuteur à zéro" onPress={timer.reset} />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', height: 56 },
  headerTitle: { flex: 1, alignItems: 'center' },
  headerSide: { width: 44 },
  dots: { flexDirection: 'row', gap: 4, paddingVertical: 4 },
  dotHit: { flex: 1, height: 24, justifyContent: 'center' },
  dot: { height: 6 },
  pager: { flex: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', flex: 1 },
  page: { paddingTop: 24 },
  done: { justifyContent: 'center' },
  doneInner: { alignItems: 'center', gap: 12 },
  footer: { flexDirection: 'row' },
  timer: { alignItems: 'center', paddingVertical: 20, gap: 16, borderWidth: StyleSheet.hairlineWidth * 2 },
  timerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  notice: { position: 'absolute' },
  noticeCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  noticeIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});

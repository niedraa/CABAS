/**
 * Plein écran immersif de la génération du planning (fin d'onboarding) :
 *  - « generating » : panier qui se remplit + messages qui défilent ;
 *  - « done »       : célébration, nombre de repas, durée mesurée (discrète) ;
 *  - « error »      : message bienveillant + Réessayer / Continuer.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { ArrowRight, RotateCcw, Sparkles } from 'lucide-react-native';

import { Celebration, CircleDecor, CookingPot } from '@/components/brand';
import { Button, Stack, Text, useSafeInsets } from '@/components/ui';
import { useTheme } from '@/theme';

import { BasketFilling } from './BasketFilling';
import { formatDuration, GENERATION_MESSAGES } from './steps';

export type GenerationPhase = 'generating' | 'done' | 'error';

export interface PlanGenerationViewProps {
  phase: GenerationPhase;
  mealsCount?: number;
  /** Durée réelle de la génération (ms). */
  durationMs?: number | null;
  /** Repas limités par l'offre gratuite (texte d'aide). */
  limitedTo?: number | null;
  /** Premier jour planifié quand ce n'est pas la semaine en cours (« lundi 16 novembre »). */
  startsOn?: string | null;
  errorMessage?: string | null;
  onRetry?: () => void;
  onSkip?: () => void;
  onContinue?: () => void;
}

const MESSAGE_EVERY_MS = 1100;

export function PlanGenerationView({
  phase,
  mealsCount = 0,
  durationMs,
  limitedTo,
  startsOn,
  errorMessage,
  onRetry,
  onSkip,
  onContinue,
}: PlanGenerationViewProps) {
  const t = useTheme();
  const insets = useSafeInsets();
  const [msg, setMsg] = useState(0);

  useEffect(() => {
    if (phase !== 'generating') return;
    const id = setInterval(() => setMsg((m) => (m + 1) % GENERATION_MESSAGES.length), MESSAGE_EVERY_MS);
    return () => clearInterval(id);
  }, [phase]);

  return (
    <Animated.View
      entering={FadeIn.duration(t.motion.duration.base)}
      style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: t.colors.background, paddingTop: insets.top, paddingBottom: insets.bottom + t.spacing.lg, zIndex: t.zIndex.sheet }]}
      testID="plan-generation"
    >
      <CircleDecor tone="paper" placement="topRight" scale={0.9} />
      <View style={[styles.center, { paddingHorizontal: t.spacing.screen }]}>
        {phase === 'generating' ? (
          <Stack gap="xxl" align="center" style={styles.full}>
            <BasketFilling size={220} testID="basket-filling" />
            <Stack gap="sm" align="center" style={styles.full}>
              <Text variant="title2" align="center" accessibilityRole="header">
                Je prépare ta semaine
              </Text>
              <View style={styles.msgBox} accessibilityLiveRegion="polite">
                <Animated.View
                  key={msg}
                  entering={FadeInDown.springify().damping(t.motion.spring.damping).stiffness(t.motion.spring.stiffness)}
                  exiting={FadeOutUp.duration(t.motion.duration.fast)}
                >
                  <Text variant="callout" color="textSecondary" align="center" testID="generation-message">
                    {GENERATION_MESSAGES[msg]}
                  </Text>
                </Animated.View>
              </View>
            </Stack>
          </Stack>
        ) : null}

        {phase === 'done' ? (
          <Stack gap="xl" align="center" style={styles.full}>
            <Celebration size={220} accessibilityLabel="Ta semaine est prête" />
            <Animated.View entering={FadeInDown.delay(120).springify().damping(t.motion.spring.damping)} style={styles.full}>
              <Stack gap="sm" align="center">
                <Text variant="title1" align="center" accessibilityRole="header">
                  Ta semaine est prête !
                </Text>
                <Text variant="callout" color="textSecondary" align="center" testID="generation-summary">
                  {mealsCount} repas planifié{mealsCount > 1 ? 's' : ''}, pensé{mealsCount > 1 ? 's' : ''} pour ton foyer.
                  {startsOn ? ` On démarre ${startsOn}.` : ''}
                  {limitedTo ? ' Premium planifie toute ta semaine, quand tu veux.' : ''}
                </Text>
                {durationMs != null ? (
                  <Text variant="caption" color="textTertiary" align="center" testID="generation-duration">
                    Planning prêt en {formatDuration(durationMs)}
                  </Text>
                ) : null}
              </Stack>
            </Animated.View>
          </Stack>
        ) : null}

        {phase === 'error' ? (
          <Stack gap="xl" align="center" style={styles.full}>
            <CookingPot size={160} />
            <Stack gap="sm" align="center">
              <Text variant="title2" align="center" accessibilityRole="header">
                Petit souci en cuisine
              </Text>
              <Text variant="callout" color="textSecondary" align="center">
                {errorMessage ?? 'On n’a pas réussi à préparer ta semaine. Réessaie dans un instant.'}
              </Text>
              <Text variant="footnote" color="textSecondary" align="center">
                Ton profil est bien enregistré.
              </Text>
            </Stack>
          </Stack>
        ) : null}
      </View>

      <View style={[styles.actions, { paddingHorizontal: t.spacing.screen, gap: t.spacing.sm, maxWidth: t.layout.maxContentWidth }]}>
        {phase === 'done' && onContinue ? (
          <Animated.View entering={FadeIn.delay(300).duration(t.motion.duration.base)}>
            <Button label="Voir ma semaine" size="lg" fullWidth rightIcon={ArrowRight} onPress={onContinue} testID="generation-continue" />
          </Animated.View>
        ) : null}
        {phase === 'error' ? (
          <>
            {onRetry ? <Button label="Réessayer" size="lg" fullWidth leftIcon={RotateCcw} onPress={onRetry} testID="generation-retry" /> : null}
            {onSkip ? <Button label="Continuer sans planning" variant="ghost" fullWidth onPress={onSkip} /> : null}
          </>
        ) : null}
        {phase === 'generating' ? (
          <Stack direction="row" gap="xs" align="center" justify="center" style={styles.note}>
            <Sparkles size={t.iconSize.xs} color={t.colors.textTertiary} />
            <Text variant="caption" color="textTertiary">
              Aucun plat avec un allergène déclaré, jamais.
            </Text>
          </Stack>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  full: { alignSelf: 'stretch' },
  msgBox: { minHeight: 44, justifyContent: 'center', alignSelf: 'stretch' },
  actions: { width: '100%', alignSelf: 'center', minHeight: 56, justifyContent: 'flex-end' },
  note: { minHeight: 44 },
});

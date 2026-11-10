/**
 * Squelette d'un écran d'étape de l'onboarding : grand titre (`title1`),
 * sous-titre court, contenu défilant (sous l'en-tête persistant du layout),
 * CTA collé en bas au-dessus de la zone sûre, clavier pris en compte.
 *
 * `useStepFlow(id)` : brouillon du profil, règle de passage et navigation
 * (étape suivante, ou retour au récapitulatif en mode `?edit=1`).
 */
import React, { useCallback } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowRight, Check } from 'lucide-react-native';

import { Button, staggerEntering, Text, useSafeInsets, type IconLike } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { useProfileStore, type ProfileDraft } from '@/stores';
import { useTheme } from '@/theme';

import { useOnboardingTopInset } from './OnboardingHeader';
import { saveResumeStep } from './resume';
import { canContinue, fullDraft, nextStepPath, type OnboardingStepId, type StepGate } from './steps';

export interface OnboardingStepProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  cta: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
    icon?: IconLike;
    accessibilityHint?: string;
  };
  /** Petite phrase au-dessus du CTA (raison du blocage, astuce). */
  footerHint?: string | null;
  footerHintTone?: 'neutral' | 'warning';
  /** Action secondaire discrète sous le CTA. */
  secondary?: { label: string; onPress: () => void };
  /** Élément au-dessus du titre (illustration). */
  header?: React.ReactNode;
  /** Accès au défilement (ex. amener des résultats de recherche à l'écran). */
  scrollRef?: React.Ref<ScrollViewInstance>;
  testID?: string;
}

export function OnboardingStep({
  title,
  subtitle,
  children,
  cta,
  footerHint,
  footerHintTone = 'neutral',
  secondary,
  header,
  scrollRef,
  testID,
}: OnboardingStepProps) {
  const t = useTheme();
  const insets = useSafeInsets();
  const top = useOnboardingTopInset();

  return (
    <View style={[styles.root, { backgroundColor: t.colors.background }]} testID={testID}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          style={styles.root}
          contentContainerStyle={{ paddingTop: top + t.spacing.md, paddingBottom: t.spacing.xxxl, paddingHorizontal: t.spacing.screen }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.column, { maxWidth: t.layout.maxContentWidth }]}>
            {header ? <Animated.View entering={staggerEntering(0)}>{header}</Animated.View> : null}
            <Animated.View entering={staggerEntering(header ? 1 : 0)}>
              <Text variant="title1" accessibilityRole="header" maxFontSizeMultiplier={1.4}>
                {title}
              </Text>
            </Animated.View>
            {subtitle ? (
              <Animated.View entering={staggerEntering(header ? 2 : 1)}>
                <Text variant="callout" color="textSecondary" style={{ marginTop: t.spacing.sm }}>
                  {subtitle}
                </Text>
              </Animated.View>
            ) : null}
            <Animated.View entering={staggerEntering(header ? 3 : 2)} style={{ marginTop: t.spacing.xxl }}>
              {children}
            </Animated.View>
          </View>
        </ScrollView>

        <View
          style={[
            styles.footer,
            {
              backgroundColor: t.colors.background,
              borderTopColor: t.colors.border,
              paddingHorizontal: t.spacing.screen,
              paddingTop: t.spacing.md,
              paddingBottom: insets.bottom + t.spacing.md,
            },
          ]}
        >
          <View style={[styles.column, { maxWidth: t.layout.maxContentWidth, gap: t.spacing.sm }]}>
            {footerHint ? (
              <Animated.View key={footerHint} entering={FadeIn.duration(t.motion.duration.base)} exiting={FadeOut.duration(t.motion.duration.fast)}>
                <Text
                  variant="footnote"
                  align="center"
                  color={footerHintTone === 'warning' ? 'accentText' : 'textSecondary'}
                  accessibilityLiveRegion="polite"
                  testID="onboarding-footer-hint"
                >
                  {footerHint}
                </Text>
              </Animated.View>
            ) : null}
            <Button
              label={cta.label}
              size="lg"
              fullWidth
              rightIcon={cta.icon ?? ArrowRight}
              onPress={cta.onPress}
              disabled={cta.disabled}
              loading={cta.loading}
              accessibilityHint={cta.accessibilityHint}
              testID="onboarding-cta"
            />
            {secondary ? <Button label={secondary.label} variant="ghost" fullWidth onPress={secondary.onPress} /> : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

export interface StepFlow {
  draft: Required<ProfileDraft>;
  update: (patch: ProfileDraft) => void;
  gate: StepGate;
  isEdit: boolean;
  ctaLabel: string;
  ctaIcon: IconLike;
  /** Valide l'étape et passe à la suivante (ou revient au récapitulatif). */
  next: () => void;
}

export function useStepFlow(id: OnboardingStepId): StepFlow {
  const params = useLocalSearchParams<{ edit?: string }>();
  const isEdit = params.edit === '1';
  const rawDraft = useProfileStore((s) => s.draft);
  const updateDraft = useProfileStore((s) => s.updateDraft);
  const draft = fullDraft(rawDraft);
  const gate = canContinue(id, rawDraft);

  const next = useCallback(() => {
    if (!gate.ok) {
      haptics.warning();
      return;
    }
    if (isEdit && router.canGoBack()) {
      router.back();
      return;
    }
    const path = nextStepPath(id);
    if (!path) return;
    const nextId = path.slice(1) as OnboardingStepId;
    void saveResumeStep(nextId);
    router.push(path);
  }, [gate.ok, id, isEdit]);

  return {
    draft,
    update: updateDraft,
    gate,
    isEdit,
    ctaLabel: isEdit ? 'Enregistrer' : 'Continuer',
    ctaIcon: isEdit ? Check : ArrowRight,
    next,
  };
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  column: { width: '100%', alignSelf: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth * 2 },
});

/**
 * Bienvenue — moment de marque : héros forêt plein écran, cercles doux,
 * logo, promesse « Tes courses, de A à Z. », trois bénéfices qui arrivent en
 * cascade au ressort, CTA moutarde « C'est parti ».
 */
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowRight, RotateCcw, ShieldCheck } from 'lucide-react-native';

import { CabasLogo, CircleDecor } from '@/components/brand';
import {
  draftHasProgress,
  ONBOARDING_STEPS,
  readResumeStep,
  saveResumeStep,
  stepIndex,
  type OnboardingStepId,
} from '@/components/feature/onboarding';
import { Button, PressableScale, staggerEntering, Text, useSafeInsets } from '@/components/ui';
import { useProfileStore } from '@/stores';
import { useTheme, withAlpha } from '@/theme';

const BENEFITS = [
  { emoji: '🗓️', title: 'Tes repas planifiés', body: 'Midi et soir, selon tes goûts, ton temps et ton budget.' },
  { emoji: '🧺', title: 'Ta liste se fait seule', body: 'Rangée par rayon, au bon format, même hors-ligne.' },
  { emoji: '💶', title: 'Les meilleurs prix', body: 'Cabas compare tes enseignes et prépare ta commande.' },
] as const;

export default function Bienvenue() {
  const t = useTheme();
  const insets = useSafeInsets();
  const [focused, setFocused] = useState(true);
  const [resume, setResume] = useState<OnboardingStepId | null>(null);
  const draft = useProfileStore((s) => s.draft);
  const startOnboarding = useProfileStore((s) => s.startOnboarding);

  // Barre d'état claire uniquement quand cet écran est visible.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    let alive = true;
    void readResumeStep().then((step) => {
      if (alive && step && stepIndex(step) > 1 && draftHasProgress(draft)) setResume(step);
    });
    return () => {
      alive = false;
    };
    // Lu une seule fois à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = () => {
    startOnboarding();
    void saveResumeStep('foyer');
    router.push('/foyer');
  };

  const resumeStep = resume ? ONBOARDING_STEPS[stepIndex(resume)] : null;
  const soft = withAlpha(t.colors.heroText, 0.1);

  return (
    <View style={[styles.root, { backgroundColor: t.colors.hero }]} testID="onboarding-bienvenue">
      {focused ? <StatusBar style="light" /> : null}
      <CircleDecor tone="hero" placement="topRight" scale={1.15} />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + t.spacing.xxl, paddingHorizontal: t.spacing.screen, paddingBottom: t.spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={[styles.column, styles.spread, { maxWidth: t.layout.maxContentWidth }]}>
          <Animated.View entering={FadeIn.duration(t.motion.duration.slow)}>
            <CabasLogo size={52} variant="reversed" withWordmark />
          </Animated.View>

          <View style={{ paddingTop: t.spacing.huge }}>
            <Animated.View entering={staggerEntering(1, 90, 120)}>
              <Text variant="hero" color="heroText" accessibilityRole="header" maxFontSizeMultiplier={1.3}>
                Tes courses,{'\n'}
                <Text variant="hero" color="accent" maxFontSizeMultiplier={1.3}>
                  de A à Z.
                </Text>
              </Text>
            </Animated.View>
            <Animated.View entering={staggerEntering(2, 90, 120)}>
              <Text variant="callout" color="heroText" style={[styles.lead, { marginTop: t.spacing.md }]}>
                Dis-nous comment tu manges : Cabas s’occupe des menus, de la liste et des prix.
              </Text>
            </Animated.View>

            <View style={{ marginTop: t.spacing.xxxl, gap: t.spacing.md }}>
              {BENEFITS.map((b, i) => (
                <Animated.View
                  key={b.title}
                  entering={FadeInDown.delay(360 + i * 110)
                    .springify()
                    .damping(t.motion.springBouncy.damping + 2)
                    .stiffness(t.motion.springBouncy.stiffness)}
                  style={[styles.benefit, { backgroundColor: soft, borderRadius: t.radius.lg, padding: t.spacing.md, gap: t.spacing.md }]}
                  accessible
                  accessibilityLabel={`${b.title}. ${b.body}`}
                >
                  <View style={[styles.benefitIcon, { backgroundColor: t.colors.accent, borderRadius: t.radius.md }]}>
                    <Text style={styles.benefitEmoji} accessibilityElementsHidden importantForAccessibility="no">
                      {b.emoji}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text variant="headline" color="heroText">
                      {b.title}
                    </Text>
                    <Text variant="footnote" color="heroText" style={styles.muted}>
                      {b.body}
                    </Text>
                  </View>
                </Animated.View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      <Animated.View
        entering={FadeInDown.delay(720).springify().damping(t.motion.spring.damping)}
        style={[styles.footer, { paddingHorizontal: t.spacing.screen, paddingBottom: insets.bottom + t.spacing.md, gap: t.spacing.sm }]}
      >
        <View style={[styles.column, { maxWidth: t.layout.maxContentWidth, gap: t.spacing.sm }]}>
          {resumeStep ? (
            <Button
              label={`Reprendre · ${resumeStep.label}`}
              leftIcon={RotateCcw}
              size="lg"
              fullWidth
              onPress={() => {
                startOnboarding();
                router.push(resumeStep.path);
              }}
              testID="onboarding-resume"
            />
          ) : null}
          {resumeStep ? (
            <PressableScale
              onPress={start}
              accessibilityRole="button"
              accessibilityLabel="Recommencer depuis le début"
              style={[styles.link, { minHeight: t.layout.minTouchTarget }]}
            >
              <Text variant="bodyMedium" color="heroText" style={styles.underline}>
                Recommencer depuis le début
              </Text>
            </PressableScale>
          ) : (
            <Button label="C’est parti" rightIcon={ArrowRight} size="lg" fullWidth onPress={start} testID="onboarding-start" />
          )}
          <View style={[styles.note, { gap: t.spacing.xs }]}>
            <ShieldCheck size={t.iconSize.xs} color={t.colors.heroText} style={styles.muted} />
            <Text variant="caption" color="heroText" style={styles.muted}>
              Données hébergées en Europe
            </Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  column: { width: '100%', alignSelf: 'center' },
  spread: { flexGrow: 1, justifyContent: 'space-between' },
  lead: { opacity: 0.86, maxWidth: 340 },
  benefit: { flexDirection: 'row', alignItems: 'center' },
  benefitIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  benefitEmoji: { fontSize: 24, lineHeight: 30 },
  muted: { opacity: 0.78 },
  footer: { paddingTop: 12 },
  link: { alignItems: 'center', justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
  note: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 24 },
});

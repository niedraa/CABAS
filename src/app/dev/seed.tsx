/**
 * Outil de développement : `/dev/seed?variant=fresh|onboarded|premium[&stay=1]`.
 * Remplit l'app avec un état de démonstration (voir src/lib/devSeed.ts) puis
 * renvoie à l'accueil — ou, avec `stay=1`, affiche un récapitulatif.
 * Redirige vers `/` si les outils de dev sont désactivés.
 */
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { CabasLogo } from '@/components/brand';
import { Button, Card, InfoBanner, KeyValueRow, Screen, SkeletonText, Stack, Text } from '@/components/ui';
import { formatPrice } from '@/core';
import { parseSeedVariant, seedDemoState, type SeedSummary, type SeedVariant } from '@/lib/devSeed';
import { devToolsEnabled } from '@/lib/env';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';

const VARIANT_LABEL: Record<SeedVariant, string> = {
  fresh: 'Premier lancement',
  onboarded: 'Profil de Camille (gratuit)',
  premium: 'Profil de Camille (Premium)',
};

type Phase = { kind: 'running' } | { kind: 'done'; summary: SeedSummary } | { kind: 'error'; message: string };

function SeedScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ variant?: string; stay?: string }>();
  const variant = parseSeedVariant(params.variant);
  const stay = params.stay === '1' || params.stay === 'true';
  const [phase, setPhase] = useState<Phase>({ kind: 'running' });
  // Incrémenté par « Réessayer » : relance l'effet.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    seedDemoState(variant).then(
      (summary) => {
        if (!alive) return;
        haptics.success();
        if (stay) setPhase({ kind: 'done', summary });
        else router.replace('/');
      },
      (err: unknown) => {
        if (!alive) return;
        haptics.error();
        setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      },
    );
    return () => {
      alive = false;
    };
  }, [variant, stay, attempt]);

  const title =
    phase.kind === 'running' ? 'Je prépare ta démo…' : phase.kind === 'done' ? 'Ta démo est prête' : 'La démo n’a pas pu se préparer';

  return (
    <Screen padded scroll={false} testID="dev-seed">
      <View style={[styles.center, { gap: t.spacing.xxl }]}>
        <CabasLogo size={64} withWordmark />
        <Stack gap="xs" align="center">
          <Text variant="overline" color="textSecondary" align="center">
            Outils de développement
          </Text>
          <Text variant="title2" align="center" accessibilityRole="header">
            {title}
          </Text>
          <Text variant="callout" color="textSecondary" align="center">
            {VARIANT_LABEL[variant]}
          </Text>
        </Stack>

        {phase.kind === 'running' ? (
          <View style={styles.full} accessible accessibilityRole="progressbar" accessibilityLabel="Préparation de la démo en cours">
            <SkeletonText lines={3} />
          </View>
        ) : null}

        {phase.kind === 'error' ? (
          <Animated.View entering={FadeIn.duration(t.motion.duration.base)} style={styles.full}>
            <Stack gap="lg">
              <InfoBanner tone="danger" title="Oups" message={phase.message} />
              <Button
                label="Réessayer"
                accessibilityLabel="Relancer la préparation de la démo"
                fullWidth
                onPress={() => {
                  setPhase({ kind: 'running' });
                  setAttempt((n) => n + 1);
                }}
              />
            </Stack>
          </Animated.View>
        ) : null}

        {phase.kind === 'done' ? (
          <Animated.View entering={FadeInDown.springify().damping(t.motion.spring.damping)} style={styles.full}>
            <Stack gap="lg">
              <Card padding="lg">
                <Stack gap="sm">
                  <KeyValueRow label="Abonnement" value={phase.summary.premium ? 'Premium (essai)' : 'Gratuit'} />
                  <KeyValueRow label="Repas planifiés" value={String(phase.summary.meals)} />
                  <KeyValueRow label="Articles sur la liste" value={String(phase.summary.listItems)} />
                  <KeyValueRow label="Au placard" value={String(phase.summary.pantryItems)} />
                  <KeyValueRow label="Dépenses passées" value={String(phase.summary.spendingEntries)} />
                  <KeyValueRow
                    label="Panier"
                    value={phase.summary.basketTotalCents === null ? '—' : formatPrice(phase.summary.basketTotalCents)}
                    emphasis
                  />
                </Stack>
              </Card>
              <Button
                label="Ouvrir Cabas"
                accessibilityLabel="Ouvrir l’application avec la démo"
                fullWidth
                onPress={() => router.replace('/')}
              />
            </Stack>
          </Animated.View>
        ) : null}
      </View>
    </Screen>
  );
}

export default function DevSeedRoute() {
  if (!devToolsEnabled) return <Redirect href="/" />;
  return <SeedScreen />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  full: { alignSelf: 'stretch' },
});

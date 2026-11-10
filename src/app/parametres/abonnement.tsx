/**
 * Réglages › Abonnement : statut (gratuit / essai / Premium), offre, date de
 * fin ou de renouvellement, gérer l'abonnement (page du store), restaurer les
 * achats, mentions. En mode démo, l'abonnement simulé peut être arrêté.
 */
import { router, type Href } from 'expo-router';
import React, { useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { CircleOff, Crown, ExternalLink, RotateCcw } from 'lucide-react-native';

import { formatLongDate, SettingsGroup, SettingsRow } from '@/components/feature/account';
import { FEATURE_ICONS, offeredTrialDays, premiumHref, renewalSentence, subscriptionStatus } from '@/components/feature/premium';
import { Badge, Button, Card, ConfirmDialog, Screen, staggerEntering, Text, useToast } from '@/components/ui';
import { FEATURE_COPY, PREMIUM_FEATURES } from '@/core';
import { isDemoMode } from '@/lib/env';
import { getPurchases } from '@/services/purchases';
import { effectiveEntitlement, useSubscriptionStore } from '@/stores';
import { useTheme, withAlpha } from '@/theme';

const STORE_SUBSCRIPTIONS_URL: Partial<Record<typeof Platform.OS, string>> = {
  ios: 'https://apps.apple.com/account/subscriptions',
  android: 'https://play.google.com/store/account/subscriptions',
};

export default function SubscriptionSettings() {
  const t = useTheme();
  const c = t.colors;
  const toast = useToast();
  const state = useSubscriptionStore((s) => s.state);
  const storeStatus = useSubscriptionStore((s) => s.status);
  const lastCheckedAt = useSubscriptionStore((s) => s.lastCheckedAt);
  const offerings = useSubscriptionStore((s) => s.offerings);
  const [confirmStop, setConfirmStop] = useState(false);
  const status = subscriptionStatus(state);
  const renewal = renewalSentence(status);
  const simulated = getPurchases().isSimulated();
  const restoring = storeStatus === 'restoring';
  const trialDays = offeredTrialDays(offerings);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/profil' as Href));

  const manage = async () => {
    if (simulated) {
      toast.show({ title: 'Abonnement simulé', message: 'En mode démo, rien à gérer côté store.', tone: 'neutral' });
      return;
    }
    const url = (await getPurchases().getManagementUrl()) ?? STORE_SUBSCRIPTIONS_URL[Platform.OS] ?? null;
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      toast.show({ title: 'Impossible d’ouvrir le store', message: 'Ouvre les réglages d’abonnement de ton téléphone.', tone: 'danger' });
    }
  };

  const restore = async () => {
    const res = await useSubscriptionStore.getState().restore();
    if (res.status === 'success') {
      if (effectiveEntitlement(res.state) === 'premium') toast.show({ title: 'Abonnement restauré', message: 'Premium est actif sur cet appareil.', tone: 'success' });
      else toast.show({ title: 'Aucun abonnement trouvé', message: 'Aucun achat Premium n’est lié à ce compte.', tone: 'neutral' });
    } else if (res.status === 'error') {
      toast.show({ title: 'Restauration impossible', message: res.message, tone: 'danger' });
    }
  };

  const stopSimulated = async () => {
    setConfirmStop(false);
    await getPurchases().simulated?.expire();
    await useSubscriptionStore.getState().refresh();
    toast.show({ title: 'Retour à l’offre gratuite', message: 'L’abonnement simulé est arrêté.', tone: 'neutral' });
  };

  const checked = formatLongDate(lastCheckedAt);

  return (
    <Screen title="Abonnement" onBack={back} testID="settings-abonnement-screen">
      <View style={{ gap: t.spacing.xxl }}>
        <Animated.View entering={staggerEntering(0)}>
          <Card variant="hero" padding="xl" radius="xl" testID="subscription-status">
            <View style={{ gap: t.spacing.md }}>
              <View style={[styles.row, { gap: t.spacing.md }]}>
                <View style={[styles.crown, { backgroundColor: status.kind === 'free' ? withAlpha(c.heroText, 0.14) : c.accent }]}>
                  <Crown size={t.iconSize.lg} color={status.kind === 'free' ? c.heroText : c.onAccent} strokeWidth={2.2} />
                </View>
                <View style={styles.flex}>
                  <View style={[styles.row, { gap: t.spacing.sm }]}>
                    <Text variant="overline" color="accent">
                      Ton offre
                    </Text>
                    {status.planName ? <Badge label={status.planName} tone="premium" variant="solid" size="sm" /> : null}
                  </View>
                  <Text variant="title2" color="heroText" accessibilityRole="header" testID="subscription-status-label">
                    {status.label}
                  </Text>
                </View>
              </View>
              <Text variant="callout" color="heroText" style={styles.muted}>
                {status.detail}
              </Text>
              {renewal ? (
                <Text variant="footnote" color="heroText" style={styles.muted}>
                  {renewal}
                </Text>
              ) : null}
            </View>
          </Card>
        </Animated.View>

        {status.kind === 'free' ? (
          <Animated.View entering={staggerEntering(1)} style={{ gap: t.spacing.md }}>
            <Card variant="plain" padding="lg">
              <View style={{ gap: t.spacing.md }}>
                <Text variant="title3" accessibilityRole="header">
                  Avec Premium
                </Text>
                {PREMIUM_FEATURES.map((f) => {
                  const Icon = FEATURE_ICONS[f];
                  return (
                    <View key={f} style={[styles.row, { gap: t.spacing.md }]}>
                      <View style={[styles.featureIcon, { backgroundColor: c.accentSoft, borderRadius: t.radius.sm }]}>
                        <Icon size={t.iconSize.sm} color={c.accentText} strokeWidth={2.4} />
                      </View>
                      <Text variant="bodyMedium" style={styles.flex}>
                        {FEATURE_COPY[f].title}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </Card>
            <Button
              label={trialDays ? `Essayer ${trialDays} jours gratuits` : 'Découvrir Premium'}
              size="lg"
              fullWidth
              onPress={() => router.push(premiumHref() as Href)}
              testID="subscription-upgrade"
            />
          </Animated.View>
        ) : null}

        <Animated.View entering={staggerEntering(2)}>
          <SettingsGroup
            title="Gérer"
            note={checked ? `Statut vérifié le ${checked}.` : undefined}
          >
            {status.kind !== 'free' ? (
              <SettingsRow
                icon={ExternalLink}
                title="Gérer mon abonnement"
                subtitle={Platform.OS === 'android' ? 'Sur Google Play' : Platform.OS === 'ios' ? 'Dans l’App Store' : 'Changer d’offre ou résilier'}
                chevron
                onPress={() => void manage()}
                testID="subscription-manage"
              />
            ) : null}
            <SettingsRow
              icon={RotateCcw}
              title={restoring ? 'Restauration…' : 'Restaurer mes achats'}
              subtitle="Nouveau téléphone ? Récupère ton abonnement."
              disabled={restoring}
              onPress={() => void restore()}
              testID="subscription-restore"
            />
            {simulated && isDemoMode && status.kind !== 'free' ? (
              <SettingsRow
                icon={CircleOff}
                title="Arrêter l’abonnement simulé"
                subtitle="Mode démo : revenir à l’offre gratuite."
                destructive
                onPress={() => setConfirmStop(true)}
                testID="subscription-stop-simulated"
              />
            ) : null}
          </SettingsGroup>
        </Animated.View>

        <Animated.View entering={staggerEntering(3)}>
          <Text variant="footnote" color="textSecondary" style={{ marginHorizontal: t.spacing.xs }}>
            L’abonnement se renouvelle automatiquement à la fin de chaque période. Tu peux le résilier à tout moment depuis
            les réglages de ton store, au plus tard 24 h avant le renouvellement.
            {simulated ? ' Mode démo : aucun paiement réel, l’abonnement est simulé.' : ''}
          </Text>
        </Animated.View>
      </View>

      <ConfirmDialog
        visible={confirmStop}
        onClose={() => setConfirmStop(false)}
        onConfirm={() => void stopSimulated()}
        title="Arrêter l’abonnement simulé ?"
        message="Tu repasses à l’offre gratuite. Tu pourras relancer un abonnement depuis le paywall."
        confirmLabel="Arrêter"
        destructive
      />
    </Screen>
  );
}

const CROWN = 52;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  muted: { opacity: 0.85 },
  crown: { width: CROWN, height: CROWN, borderRadius: CROWN / 2, alignItems: 'center', justifyContent: 'center' },
  featureIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});

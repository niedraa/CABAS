/**
 * Carte d'abonnement de l'onglet Profil (bandeau forêt) :
 * - gratuit : invitation à essayer Premium (CTA moutarde) ;
 * - essai / Premium : statut, date de fin, jours d'essai restants ; toute la
 *   carte ouvre « Abonnement ».
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ChevronRight, Crown } from 'lucide-react-native';

import { Badge, Button, Card, ProgressBar, Text } from '@/components/ui';
import { PREMIUM_PRICING } from '@/core';
import { useTheme, withAlpha } from '@/theme';

import type { SubscriptionStatusView } from '../premium/paywall';

export interface SubscriptionCardProps {
  status: SubscriptionStatusView;
  /** Jours d'essai offerts (gratuit), ou null si l'essai a déjà servi. */
  trialDays: number | null;
  onUpgrade: () => void;
  onManage: () => void;
  testID?: string;
}

export function SubscriptionCard({ status, trialDays, onUpgrade, onManage, testID = 'subscription-card' }: SubscriptionCardProps) {
  const t = useTheme();
  const c = t.colors;

  if (status.kind === 'free') {
    return (
      <Card variant="hero" padding="xl" radius="xl" testID={testID}>
        <View style={{ gap: t.spacing.sm }}>
          <Badge label="Premium" tone="premium" variant="solid" size="sm" icon={Crown} />
          <Text variant="title3" color="heroText" accessibilityRole="header">
            Toute ta semaine, sans limite
          </Text>
          <Text variant="footnote" color="heroText" style={styles.muted}>
            Planning illimité, panier le moins cher, alertes prix et suivi du budget.
          </Text>
          <Button
            label={trialDays ? `Essayer ${trialDays} jours gratuits` : 'Découvrir Premium'}
            size="md"
            onPress={onUpgrade}
            style={{ marginTop: t.spacing.sm }}
            testID={`${testID}-upgrade`}
          />
        </View>
      </Card>
    );
  }

  const trial = status.kind === 'trial';
  const days = status.daysLeft ?? 0;
  return (
    <Card
      variant="hero"
      padding="xl"
      radius="xl"
      onPress={onManage}
      accessibilityRole="button"
      accessibilityLabel={`${status.label}. ${status.detail}. Gérer mon abonnement`}
      testID={testID}
    >
      <View style={{ gap: t.spacing.md }}>
        <View style={[styles.row, { gap: t.spacing.md }]}>
          <View style={[styles.crown, { backgroundColor: c.accent }]}>
            <Crown size={t.iconSize.md} color={c.onAccent} strokeWidth={2.4} />
          </View>
          <View style={styles.flex}>
            <View style={[styles.row, { gap: t.spacing.sm }]}>
              <Text variant="headline" color="heroText">
                {status.label}
              </Text>
              {status.planName ? (
                <View style={[styles.pill, { backgroundColor: withAlpha(c.heroText, 0.14), borderRadius: t.radius.pill }]}>
                  <Text variant="caption" color="heroText">
                    {status.planName}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text variant="footnote" color="heroText" style={styles.muted} testID={`${testID}-detail`}>
              {status.detail}
            </Text>
          </View>
          <ChevronRight size={t.iconSize.md} color={c.heroText} />
        </View>
        {trial && status.daysLeft !== null ? (
          <View style={{ gap: t.spacing.xs }}>
            <ProgressBar
              progress={days / PREMIUM_PRICING.trialDays}
              tone="accent"
              height={8}
              style={{ backgroundColor: withAlpha(c.heroText, 0.14) }}
              accessibilityLabel={`${days} jour${days > 1 ? 's' : ''} d’essai restant${days > 1 ? 's' : ''}`}
            />
            <Text variant="caption" color="accent">
              {days > 1 ? `Encore ${days} jours pour tout essayer` : days === 1 ? 'Dernier jour d’essai' : 'Ton essai se termine aujourd’hui'}
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const CROWN = 44;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  muted: { opacity: 0.82 },
  crown: { width: CROWN, height: CROWN, borderRadius: CROWN / 2, alignItems: 'center', justifyContent: 'center' },
  pill: { paddingHorizontal: 8, paddingVertical: 2 },
});

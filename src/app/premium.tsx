/**
 * Premium (modale) : bénéfices, choix annuel / mensuel, essai gratuit,
 * achat, restauration. En démo / web : magasin simulé (essai de 7 jours).
 * Abonné : état de l'abonnement et lien de gestion.
 */
import { router, type Href } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BarChart3, Bell, CalendarDays, Check, Crown, Scale, ShoppingBag, Sparkles } from 'lucide-react-native';

import { Celebration, CircleDecor } from '@/components/brand';
import { Badge, Button, Card, InfoBanner, PressableScale, Screen, Text, useToast, type IconLike } from '@/components/ui';
import { FEATURE_COPY, PREMIUM_FEATURES, pricingLabels, yearlySavingsPercent, type Feature } from '@/core';
import { useSubscription } from '@/hooks';
import { haptics } from '@/lib/haptics';
import { track } from '@/services/analytics';
import { useSubscriptionStore } from '@/stores';
import type { PackageId } from '@/services/purchases';
import { useTheme } from '@/theme';

const FEATURE_ICONS: Record<Feature, IconLike> = {
  unlimited_planning: CalendarDays,
  optimized_basket: Scale,
  one_click_order: ShoppingBag,
  price_alerts: Bell,
  budget_tracking: BarChart3,
  advanced_personalization: Sparkles,
  pantry: Check,
};

function formatDateFr(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
}

export default function PremiumScreen() {
  const t = useTheme();
  const c = t.colors;
  const toast = useToast();
  const sub = useSubscription();
  const offerings = useSubscriptionStore((s) => s.offerings);
  const status = useSubscriptionStore((s) => s.status);
  const [pkg, setPkg] = useState<PackageId>('annual');
  const [celebrate, setCelebrate] = useState(0);
  const labels = pricingLabels();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/' as Href));

  useEffect(() => {
    track('paywall_viewed', { premium: sub.isPremium });
    void useSubscriptionStore.getState().refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const annual = offerings?.annual;
  const monthly = offerings?.monthly;
  const trial = (pkg === 'annual' ? annual?.trial : monthly?.trial) ?? null;

  const buy = async () => {
    haptics.impact();
    const res = await useSubscriptionStore.getState().purchase(pkg);
    if (res.status === 'success') {
      haptics.success();
      setCelebrate((n) => n + 1);
      toast.show({ title: 'Bienvenue dans Premium !', message: 'Toute ta semaine est débloquée.', emoji: '👑', tone: 'success' });
      setTimeout(close, 1200);
    } else if (res.status === 'error') {
      haptics.error();
      toast.show({ title: 'Achat impossible', message: res.message, tone: 'danger' });
    }
  };
  const restore = async () => {
    const res = await useSubscriptionStore.getState().restore();
    if (res.status === 'success') {
      const premium = res.state.entitlement === 'premium';
      toast.show({ title: premium ? 'Abonnement restauré' : 'Aucun abonnement trouvé', tone: premium ? 'success' : 'neutral' });
    } else if (res.status === 'error') {
      toast.show({ title: 'Restauration impossible', message: res.message, tone: 'danger' });
    }
  };

  const hero = (
    <View style={[styles.hero, { backgroundColor: c.hero, paddingHorizontal: t.spacing.screen, paddingVertical: t.spacing.xxl }]}>
      <CircleDecor tone="hero" placement="topRight" />
      <View style={[styles.crown, { backgroundColor: c.accent, borderRadius: t.radius.pill }]}>
        <Crown size={t.iconSize.xl} color={c.onAccent} />
      </View>
      <Text variant="title1" color="heroText" align="center" style={{ marginTop: t.spacing.md }}>
        Cabas Premium
      </Text>
      <Text variant="callout" color="heroText" align="center" style={{ marginTop: t.spacing.xs }}>
        Toute ta semaine planifiée et le panier le moins cher, sans y penser.
      </Text>
    </View>
  );

  return (
    <Screen
      onBack={close}
      backIcon="close"
      hero={hero}
      bottomInset="safe"
      testID="premium-screen"
      footer={
        sub.isPremium ? (
          <Button label="Continuer" size="lg" fullWidth onPress={close} testID="premium-close" />
        ) : (
          <View style={{ gap: t.spacing.xs }}>
            <Button
              label={trial ? `Essayer ${trial.days} jours gratuits` : 'S’abonner'}
              leftIcon={Crown}
              size="lg"
              fullWidth
              loading={status === 'purchasing'}
              disabled={status !== 'idle'}
              onPress={() => void buy()}
              testID="premium-buy"
            />
            <Text variant="caption" color="textSecondary" align="center">
              {trial
                ? `Puis ${pkg === 'annual' ? (annual?.priceString ?? labels.yearly.replace('/an', '')) + ' par an' : (monthly?.priceString ?? labels.monthly.replace('/mois', '')) + ' par mois'}. Sans engagement, annulable à tout moment.`
                : 'Sans engagement, annulable à tout moment.'}
            </Text>
          </View>
        )
      }
    >
      <View style={{ gap: t.spacing.xl, paddingTop: t.spacing.lg }}>
        {sub.isPremium ? (
          <InfoBanner
            tone="success"
            title={sub.isTrial ? 'Ton essai Premium est actif' : 'Tu es Premium'}
            message={
              sub.expiresAt
                ? sub.willRenew
                  ? `Renouvellement automatique le ${formatDateFr(sub.expiresAt)}.`
                  : `Valable jusqu’au ${formatDateFr(sub.expiresAt)}.`
                : 'Merci de soutenir Cabas !'
            }
          />
        ) : null}

        <View style={{ gap: t.spacing.md }}>
          {PREMIUM_FEATURES.map((f) => {
            const Icon = FEATURE_ICONS[f] as React.ComponentType<{ size: number; color: string }>;
            return (
              <View key={f} style={styles.feature}>
                <View style={[styles.featureIcon, { backgroundColor: c.accentSoft, borderRadius: t.radius.md }]}>
                  <Icon size={t.iconSize.md} color={c.accentText} />
                </View>
                <View style={styles.flex}>
                  <Text variant="headline">{FEATURE_COPY[f].title}</Text>
                  <Text variant="footnote" color="textSecondary">
                    {FEATURE_COPY[f].description}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {!sub.isPremium ? (
          <View style={{ gap: t.spacing.sm }} accessibilityRole="radiogroup">
            <PlanOption
              selected={pkg === 'annual'}
              onPress={() => setPkg('annual')}
              title="Annuel"
              price={annual?.priceString ? `${annual.priceString}/an` : labels.yearly}
              detail={annual?.pricePerMonthString ? `soit ${annual.pricePerMonthString}/mois` : labels.yearlyPerMonth}
              badge={`−${yearlySavingsPercent()} %`}
              testID="plan-annual"
            />
            <PlanOption
              selected={pkg === 'monthly'}
              onPress={() => setPkg('monthly')}
              title="Mensuel"
              price={monthly?.priceString ? `${monthly.priceString}/mois` : labels.monthly}
              detail="Sans engagement"
              testID="plan-monthly"
            />
            <Button label="Restaurer mes achats" variant="ghost" size="sm" onPress={() => void restore()} disabled={status !== 'idle'} testID="premium-restore" />
            {offerings?.simulated ? (
              <Text variant="caption" color="textTertiary" align="center">
                Mode démo : l’achat est simulé, aucun paiement n’est effectué.
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {celebrate > 0 ? (
        <View pointerEvents="none" style={styles.celebrate}>
          <Celebration size={220} playKey={celebrate} accessibilityLabel="Bienvenue dans Premium" />
        </View>
      ) : null}
    </Screen>
  );
}

function PlanOption({
  selected,
  onPress,
  title,
  price,
  detail,
  badge,
  testID,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  price: string;
  detail: string;
  badge?: string;
  testID?: string;
}) {
  const t = useTheme();
  const c = t.colors;
  return (
    <PressableScale
      onPress={() => {
        haptics.select();
        onPress();
      }}
      haptic="none"
      scaleTo={0.98}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${title}, ${price}, ${detail}`}
      testID={testID}
    >
      <Card
        variant="plain"
        padding="lg"
        radius="lg"
        style={{ borderWidth: 2, borderColor: selected ? c.accent : c.border, backgroundColor: selected ? c.accentSoft : c.surface }}
      >
        <View style={styles.planRow}>
          <View style={[styles.radio, { borderColor: selected ? c.accentText : c.borderStrong }]}>
            {selected ? <View style={[styles.radioDot, { backgroundColor: c.accentText }]} /> : null}
          </View>
          <View style={styles.flex}>
            <Text variant="headline">{title}</Text>
            <Text variant="footnote" color="textSecondary">
              {detail}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            {badge ? <Badge label={badge} tone="danger" variant="solid" size="sm" /> : null}
            <Text variant="price" tabular>
              {price}
            </Text>
          </View>
        </View>
      </Card>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', overflow: 'hidden' },
  crown: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  featureIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 2 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  celebrate: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});

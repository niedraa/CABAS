/**
 * Paywall Premium (modale) : héros forêt et moutarde, bénéfices
 * (`PREMIUM_FEATURES` + `FEATURE_COPY`, la fonctionnalité d'origine en tête),
 * offres annuelle / mensuelle (prix localisés du store, « −33 % », essai
 * 7 jours), achat, restauration, états chargement / erreur / annulation,
 * mentions, puis état « Tu es Premium » (célébration).
 *
 * Sur iOS, `presentation: 'modal'` ouvre une vraie feuille native (pageSheet) :
 * elle passe au-dessus du viewport de toasts racine et commence déjà sous la
 * barre d'état. L'écran monte donc ses propres toasts et annule la marge haute
 * (comme le native-stack pour l'en-tête de ses modales).
 *
 * Paramètre facultatif : `?feature=optimized_basket` (voir `premiumHref()`).
 */
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { ArrowRight, ShieldCheck, X } from 'lucide-react-native';

import { Celebration, CircleDecor } from '@/components/brand';
import {
  defaultPackage,
  FeatureList,
  hasStoreOffers,
  offeredTrialDays,
  orderedFeatures,
  parseFeatureParam,
  paywallHeadline,
  planOptions,
  PlanPicker,
  PremiumHero,
  purchaseCtaLabel,
  purchaseLegalText,
  renewalSentence,
  subscriptionStatus,
} from '@/components/feature/premium';
import {
  Button,
  IconButton,
  InfoBanner,
  PressableScale,
  staggerEntering,
  Text,
  ToastProvider,
  useSafeInsets,
  useToast,
} from '@/components/ui';
import { PREMIUM_FEATURES, PREMIUM_PRICING } from '@/core';
import { useSubscription } from '@/hooks';
import { isDemoMode } from '@/lib/env';
import { haptics } from '@/lib/haptics';
import { track } from '@/services/analytics';
import type { PackageId } from '@/services/purchases';
import { effectiveEntitlement, useSubscriptionStore } from '@/stores';
import { useTheme, withAlpha } from '@/theme';

export default function PremiumRoute() {
  const insets = useSafeInsets();
  // iOS : la feuille modale commence sous la barre d'état (marge haute nulle).
  const sheetInsets = useMemo(() => (Platform.OS === 'ios' ? { ...insets, top: 0 } : insets), [insets]);
  return (
    <SafeAreaInsetsContext.Provider value={sheetInsets}>
      {/* Toasts dessinés DANS la modale : le viewport racine reste dessous sur iOS. */}
      <ToastProvider>
        <PremiumScreen />
      </ToastProvider>
    </SafeAreaInsetsContext.Provider>
  );
}

function PremiumScreen() {
  const t = useTheme();
  const c = t.colors;
  const insets = useSafeInsets();
  const toast = useToast();
  const params = useLocalSearchParams<{ feature?: string }>();
  const feature = parseFeatureParam(params.feature);
  const sub = useSubscription();

  const subState = useSubscriptionStore((s) => s.state);
  const offerings = useSubscriptionStore((s) => s.offerings);
  const storeStatus = useSubscriptionStore((s) => s.status);
  const [loaded, setLoaded] = useState(!!offerings);
  const [pkg, setPkg] = useState<PackageId>(() => defaultPackage(offerings));
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(0);
  const [celebrating, setCelebrating] = useState(false);
  const [focused, setFocused] = useState(true);

  // Barre d'état claire tant que la modale forêt est visible.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    track('paywall_viewed', { feature: feature ?? 'none', premium: sub.isPremium });
    let alive = true;
    void useSubscriptionStore
      .getState()
      .refresh()
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
    // Une seule fois à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seules les offres que le store propose vraiment : si le choix (ou le défaut
  // « annuel ») n'existe pas, la sélection retombe sur une offre affichée.
  const options = useMemo(() => planOptions(offerings), [offerings]);
  const selected = options.find((o) => o.id === pkg) ?? options[0];
  const storeHasOffers = hasStoreOffers(offerings);
  const loadingOffers = !storeHasOffers && (!loaded || storeStatus === 'loading');
  const offersUnavailable = !storeHasOffers && !loadingOffers;
  const purchasing = storeStatus === 'purchasing';
  const restoring = storeStatus === 'restoring';
  const busy = purchasing || restoring;
  const simulated = isDemoMode || !!offerings?.simulated;

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)' as Href);
  };

  const retryOffers = () => {
    setLoaded(false);
    void useSubscriptionStore
      .getState()
      .refresh()
      .finally(() => setLoaded(true));
  };

  const buy = async () => {
    setPurchaseError(null);
    const res = await useSubscriptionStore.getState().purchase(selected.id);
    if (res.status === 'success') {
      if (effectiveEntitlement(res.state) !== 'premium') {
        haptics.warning();
        setPurchaseError('L’achat est passé, mais Premium n’est pas encore actif. Essaie « Restaurer mes achats ».');
        return;
      }
      setCelebrate((n) => n + 1);
      setCelebrating(true);
      toast.show({
        title: res.state.isTrial ? 'Ton essai commence !' : 'Bienvenue dans Premium !',
        message: res.state.isTrial
          ? `Tout Cabas est à toi pendant ${selected.trialDays ?? PREMIUM_PRICING.trialDays} jours.`
          : 'Tout Cabas est à toi.',
        tone: 'success',
      });
      return;
    }
    if (res.status === 'cancelled') {
      toast.show({ title: 'Achat annulé', message: 'Rien n’a été débité.', tone: 'neutral' });
      return;
    }
    haptics.error();
    setPurchaseError(res.message);
  };

  const restore = async () => {
    setPurchaseError(null);
    const res = await useSubscriptionStore.getState().restore();
    if (res.status === 'success') {
      if (effectiveEntitlement(res.state) === 'premium') {
        setCelebrate((n) => n + 1);
        setCelebrating(true);
        toast.show({ title: 'Abonnement restauré', message: 'Content de te revoir dans Premium.', tone: 'success' });
      } else {
        toast.show({ title: 'Aucun abonnement trouvé', message: 'Aucun achat Premium n’est lié à ce compte.', tone: 'neutral' });
      }
      return;
    }
    if (res.status === 'error') toast.show({ title: 'Restauration impossible', message: res.message, tone: 'danger' });
  };

  // L'essai n'est promis que s'il est vraiment offert (même source que le CTA).
  const headline = paywallHeadline(feature, selected.fromStore ? selected.trialDays : offeredTrialDays(offerings));
  const status = subscriptionStatus(subState);
  const renewal = renewalSentence(status);

  return (
    <View style={[styles.root, { backgroundColor: c.hero }]} testID="premium-screen">
      {focused ? <StatusBar style="light" /> : null}

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + t.spacing.xl,
          paddingHorizontal: t.spacing.screen,
          paddingBottom: t.spacing.xxl,
        }}
        showsVerticalScrollIndicator={false}
        testID="premium-scroll"
      >
        {/* Les cercles défilent avec le héros (ils ne passent pas sous les cartes). */}
        <View style={styles.decor} pointerEvents="none">
          <CircleDecor tone="hero" placement="topRight" scale={1.1} />
        </View>
        <View style={[styles.column, { maxWidth: t.layout.maxContentWidth }]}>
          {sub.isPremium ? (
            <>
              <PremiumHero
                eyebrow={status.label}
                title={status.kind === 'trial' ? 'Ton essai est lancé' : 'Tu es Premium'}
                subtitle={`${status.detail}. Profite de tout Cabas, sans limite.`}
                emoji="🎉"
              />
              {renewal ? (
                <Animated.View
                  entering={staggerEntering(4, t.motion.stagger, t.motion.duration.instant)}
                  style={[styles.statusCard, { marginTop: t.spacing.xl, padding: t.spacing.lg, gap: t.spacing.md, borderRadius: t.radius.lg, backgroundColor: withAlpha(c.heroText, 0.1) }]}
                  testID="premium-status"
                >
                  <ShieldCheck size={t.iconSize.md} color={c.accent} />
                  <Text variant="footnote" color="heroText" style={[styles.flex, styles.muted]}>
                    {renewal}
                  </Text>
                </Animated.View>
              ) : null}
              <Text variant="title3" color="heroText" accessibilityRole="header" style={{ marginTop: t.spacing.xxl, marginBottom: t.spacing.md }}>
                Tout est débloqué
              </Text>
              <FeatureList features={PREMIUM_FEATURES} unlocked startIndex={5} />
            </>
          ) : (
            <>
              <PremiumHero title={headline.title} subtitle={headline.subtitle} />
              <View style={{ marginTop: t.spacing.xxl }}>
                <FeatureList features={orderedFeatures(feature)} highlight={feature} startIndex={4} />
              </View>
              <Animated.View entering={staggerEntering(10)} style={{ marginTop: t.spacing.xxl, gap: t.spacing.md }}>
                <Text variant="title3" color="heroText" accessibilityRole="header">
                  Choisis ton offre
                </Text>
                <PlanPicker options={options} value={selected.id} onChange={setPkg} loading={loadingOffers} disabled={busy || offersUnavailable} />
                {offersUnavailable ? (
                  <InfoBanner
                    tone="warning"
                    title="Les offres ne se chargent pas"
                    message="Vérifie ta connexion : on réessaie dès que tu veux."
                    action={{ label: 'Réessayer', onPress: retryOffers }}
                  />
                ) : null}
                {purchaseError ? (
                  <Animated.View entering={FadeInDown.springify().damping(t.motion.spring.damping)}>
                    <InfoBanner tone="danger" title="L’achat n’a pas abouti" message={purchaseError} onClose={() => setPurchaseError(null)} />
                  </Animated.View>
                ) : null}
              </Animated.View>
              <Text variant="caption" color="heroText" align="center" style={[styles.muted, { marginTop: t.spacing.xl }]}>
                {simulated ? 'Mode démo : aucun paiement réel, l’abonnement est simulé.' : 'Paiement sécurisé par l’App Store ou Google Play.'}
              </Text>
            </>
          )}
        </View>
      </ScrollView>

      {/* Pied collé : CTA, mentions, restauration. */}
      <Animated.View
        entering={FadeIn.delay(t.motion.duration.base).duration(t.motion.duration.base)}
        style={[
          styles.footer,
          {
            paddingHorizontal: t.spacing.screen,
            paddingTop: t.spacing.md,
            paddingBottom: insets.bottom + t.spacing.md,
            backgroundColor: c.hero,
            borderTopColor: withAlpha(c.heroText, 0.12),
          },
        ]}
      >
        <View style={[styles.column, { maxWidth: t.layout.maxContentWidth, gap: t.spacing.sm }]}>
          {sub.isPremium ? (
            <>
              <Button label="C’est parti" rightIcon={ArrowRight} size="lg" fullWidth onPress={close} testID="premium-done" />
              <HeroLink
                label="Gérer mon abonnement"
                onPress={() => router.replace('/parametres/abonnement' as Href)}
                testID="premium-manage"
              />
            </>
          ) : (
            <>
              <Button
                label={purchaseCtaLabel(selected)}
                size="lg"
                fullWidth
                loading={purchasing}
                disabled={loadingOffers || offersUnavailable || restoring}
                onPress={() => void buy()}
                testID="premium-cta"
              />
              <Text variant="caption" color="heroText" align="center" style={styles.muted} testID="premium-legal">
                {purchaseLegalText(selected)}
              </Text>
              <HeroLink
                label={restoring ? 'Restauration…' : 'Restaurer mes achats'}
                onPress={() => void restore()}
                disabled={busy}
                testID="premium-restore"
              />
            </>
          )}
        </View>
      </Animated.View>

      <View style={[styles.close, { top: insets.top + t.spacing.sm, right: t.spacing.sm }]}>
        <IconButton icon={X} variant="hero" accessibilityLabel="Fermer" onPress={close} testID="premium-close" />
      </View>

      {celebrating ? (
        <Animated.View pointerEvents="none" exiting={FadeOut.duration(t.motion.duration.base)} style={styles.celebrate}>
          <Celebration
            size={240}
            playKey={celebrate}
            haptic={false}
            onDone={() => setTimeout(() => setCelebrating(false), t.motion.duration.slow)}
            accessibilityLabel="Bienvenue dans Premium"
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Lien texte sur fond forêt (le bouton « ghost » du kit est vert sur vert). */
function HeroLink({ label, onPress, disabled, testID }: { label: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  const t = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.link, { minHeight: t.layout.minTouchTarget, opacity: disabled ? t.opacity.disabled : 1 }]}
      testID={testID}
    >
      <Text variant="subhead" color="heroText" style={styles.underline}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  flex: { flex: 1 },
  column: { width: '100%', alignSelf: 'center' },
  muted: { opacity: 0.78 },
  statusCard: { flexDirection: 'row', alignItems: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth * 2 },
  link: { alignItems: 'center', justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
  close: { position: 'absolute' },
  decor: { position: 'absolute', top: 0, left: 0, right: 0, height: 420 },
  celebrate: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});

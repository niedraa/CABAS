/**
 * Onglet « Profil » : en-tête (avatar, prénom, foyer), carte d'abonnement
 * (gratuit → essayer Premium ; essai / Premium → date de fin), sections du
 * profil éditables, raccourcis Placard et Budget, réglages, version de l'app
 * et mention « mode démo ».
 */
import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Bell, Crown, Palette, ShieldCheck } from 'lucide-react-native';

import { CabasLogo, EmptyBasket } from '@/components/brand';
import {
  appVersionLabel,
  displayNameOf,
  planningReminderSentence,
  PROFILE_SECTIONS,
  ProfileHeader,
  ProfileSectionRow,
  sectionHref,
  sectionSummary,
  SettingsGroup,
  SettingsRow,
  ShortcutTile,
  SubscriptionCard,
  THEME_CHOICES,
  type ProfileSectionId,
} from '@/components/feature/account';
import { budgetShortcutSubtitle } from '@/components/feature/budget';
import { offeredTrialDays, premiumHref, subscriptionStatus } from '@/components/feature/premium';
import { Card, EmptyState, Screen, staggerEntering, StoreBadgeStack, Text } from '@/components/ui';
import type { Store } from '@/core';
import { useSubscription } from '@/hooks';
import { isDemoMode } from '@/lib/env';
import { haptics } from '@/lib/haptics';
import { useCatalog } from '@/services/catalog';
import { useBudgetStatus, useExpiringSoon, usePantryStore, useProfileStore, useSettingsStore, useSubscriptionStore } from '@/stores';
import { useTheme } from '@/theme';

export default function ProfileTab() {
  const t = useTheme();
  const profile = useProfileStore((s) => s.profile);
  const subState = useSubscriptionStore((s) => s.state);
  const offerings = useSubscriptionStore((s) => s.offerings);
  const sub = useSubscription();
  const catalog = useCatalog();
  const budget = useBudgetStatus();
  const pantryCount = usePantryStore((s) => s.items.length);
  const expiring = useExpiringSoon(3).length;
  const themePreference = useSettingsStore((s) => s.themePreference);
  const notif = useSettingsStore((s) => s.notificationPrefs);

  const go = (href: string) => {
    haptics.tap();
    router.push(href as Href);
  };

  if (!profile) {
    return (
      <Screen title="Profil" bottomInset="tabBar" testID="profile-screen">
        <EmptyState
          illustration={<EmptyBasket size={130} />}
          title="Pas encore de profil"
          body="Dis-nous qui passe à table : Cabas s’occupe du reste."
          action={{ label: 'Créer mon profil', onPress: () => router.replace('/bienvenue' as Href) }}
        />
      </Screen>
    );
  }

  const status = subscriptionStatus(subState);
  const trialDays = offeredTrialDays(offerings);
  const chosenStores = profile.preferredStoreIds
    .map((id) => catalog.storesById[id])
    .filter((s): s is Store => !!s);
  const themeLabel = THEME_CHOICES.find((c) => c.value === themePreference)?.label ?? 'Auto';
  const notifLabel = notif.planningReminder ? `Rappel : ${planningReminderSentence(notif).toLowerCase()}` : 'Rappel de planification désactivé';
  const pantrySubtitle =
    pantryCount === 0
      ? 'Note ce que tu as déjà à la maison'
      : `${pantryCount} article${pantryCount > 1 ? 's' : ''}${expiring > 0 ? ` · ${expiring} à utiliser vite` : ' au placard'}`;

  return (
    <Screen title="Profil" bottomInset="tabBar" testID="profile-screen">
      <View style={{ gap: t.spacing.xxl }}>
        <Animated.View entering={staggerEntering(0)}>
          <ProfileHeader
            name={displayNameOf(profile)}
            household={profile.household}
            badge={sub.isPremium ? { label: status.kind === 'trial' ? 'Essai' : 'Premium', tone: 'premium' } : null}
            onPress={() => go(sectionHref('foyer'))}
          />
        </Animated.View>

        <Animated.View entering={staggerEntering(1)}>
          <SubscriptionCard
            status={status}
            trialDays={trialDays}
            onUpgrade={() => go(premiumHref())}
            onManage={() => go('/parametres/abonnement')}
          />
        </Animated.View>

        <Animated.View entering={staggerEntering(2)} style={{ gap: t.spacing.sm }}>
          <Text variant="overline" color="textSecondary" accessibilityRole="header" style={{ marginLeft: t.spacing.xs }}>
            Ton profil
          </Text>
          <Card variant="plain" padding="none" style={[styles.outlined, { borderColor: t.colors.border }]}>
            {PROFILE_SECTIONS.map((s, i) => {
              const sum = sectionSummary(s.id, profile, catalog.stores);
              return (
                <View key={s.id} style={i > 0 ? [styles.separator, { borderTopColor: t.colors.border }] : undefined}>
                  <ProfileSectionRow
                    emoji={s.emoji}
                    title={s.title}
                    value={sum.value}
                    detail={sum.detail}
                    right={
                      s.id === 'magasins' && chosenStores.length > 0 ? (
                        <StoreBadgeStack chains={chosenStores.map((st) => st.chain)} size="xs" max={4} />
                      ) : null
                    }
                    onPress={() => go(sectionHref(s.id as ProfileSectionId))}
                    testID={`profile-section-${s.id}`}
                  />
                </View>
              );
            })}
          </Card>
        </Animated.View>

        <Animated.View entering={staggerEntering(3)} style={{ gap: t.spacing.sm }}>
          <Text variant="overline" color="textSecondary" accessibilityRole="header" style={{ marginLeft: t.spacing.xs }}>
            Raccourcis
          </Text>
          <View style={[styles.tiles, { gap: t.spacing.md }]}>
            <ShortcutTile emoji="🫙" title="Placard" subtitle={pantrySubtitle} onPress={() => go('/placard')} testID="shortcut-placard" />
            <ShortcutTile
              emoji="💶"
              tone="accent"
              title="Budget"
              subtitle={budgetShortcutSubtitle(budget, sub.canUse('budget_tracking'))}
              premium={!sub.canUse('budget_tracking')}
              onPress={() => go('/budget')}
              testID="shortcut-budget"
            />
          </View>
        </Animated.View>

        <Animated.View entering={staggerEntering(4)}>
          <SettingsGroup title="Réglages">
            <SettingsRow icon={Bell} title="Notifications" subtitle={notifLabel} chevron onPress={() => go('/parametres/notifications')} testID="settings-notifications" />
            <SettingsRow icon={Palette} title="Apparence" subtitle={`Thème : ${themeLabel.toLowerCase()}`} chevron onPress={() => go('/parametres/apparence')} testID="settings-apparence" />
            <SettingsRow icon={Crown} title="Abonnement" subtitle={status.kind === 'free' ? 'Offre gratuite' : status.detail} chevron onPress={() => go('/parametres/abonnement')} testID="settings-abonnement" />
            <SettingsRow
              icon={ShieldCheck}
              title="Compte & données"
              subtitle="Confidentialité, export, suppression"
              chevron
              onPress={() => go('/parametres/compte')}
              testID="settings-compte"
            />
          </SettingsGroup>
        </Animated.View>

        <Animated.View entering={staggerEntering(5)} style={[styles.footer, { gap: t.spacing.sm, paddingTop: t.spacing.sm }]}>
          <CabasLogo size={28} withWordmark />
          <Text variant="caption" color="textSecondary" align="center" testID="app-version">
            {appVersionLabel(Constants.expoConfig?.version, isDemoMode)}
          </Text>
          {isDemoMode ? (
            <Text variant="footnote" color="textSecondary" align="center" style={styles.demo}>
              Mode démo : tes données restent sur cet appareil, l’abonnement est simulé.
            </Text>
          ) : null}
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  outlined: { borderWidth: StyleSheet.hairlineWidth * 2 },
  separator: { borderTopWidth: StyleSheet.hairlineWidth * 2 },
  tiles: { flexDirection: 'row' },
  footer: { alignItems: 'center' },
  demo: { maxWidth: 320 },
});

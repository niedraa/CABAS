/**
 * « Profil » — le foyer, ses préférences et les réglages.
 *
 * - En-tête : prénom (modifiable), foyer, offre (gratuit / Premium) ;
 * - Mon foyer : foyer, goûts & santé, budget & temps, cuisine, magasins
 *   (France / Espagne), repas → `parametres/[section]` ;
 * - Mes outils : placard anti-gaspi, suivi du budget ;
 * - Réglages : notifications, apparence, retours haptiques, mesure d'audience,
 *   compte & données (RGPD) ;
 * - À propos.
 */
import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Archive,
  BarChart3,
  Bell,
  Crown,
  HeartPulse,
  Home,
  Moon,
  Pencil,
  ShieldCheck,
  ShoppingBasket,
  Smartphone,
  Store as StoreIcon,
  Sun,
  UtensilsCrossed,
  Vibrate,
  Wallet,
  CalendarDays,
} from 'lucide-react-native';

import { CabasLogo } from '@/components/brand';
import { householdSummary } from '@/components/feature/onboarding';
import { COOK_TIME_CHOICES, mealsPerWeekLabel, nearestCookTime } from '@/components/feature/profile';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Dialog,
  ListRow,
  Screen,
  SectionHeader,
  SegmentedControl,
  StoreBadgeStack,
  Switch,
  Text,
  TextField,
  useToast,
} from '@/components/ui';
import { COUNTRY_FLAGS, formatPrice, joinFr, storeDisplayName, type Store } from '@/core';
import { useSubscription } from '@/hooks';
import { isDemoMode } from '@/lib/env';
import { useCatalog } from '@/services/catalog';
import {
  useBudgetStatus,
  usePantryStore,
  useProfileStore,
  useSettingsStore,
  useTotalSavings,
  type ThemePreference,
} from '@/stores';
import { useTheme } from '@/theme';

function cookLabel(min: number): string {
  return COOK_TIME_CHOICES.find((c) => c.value === nearestCookTime(min))?.label ?? `${min} min`;
}

export default function ProfileScreen() {
  const t = useTheme();
  const toast = useToast();
  const catalog = useCatalog();
  const sub = useSubscription();
  const profile = useProfileStore((s) => s.profile);
  const settings = useSettingsStore();
  const pantryCount = usePantryStore((s) => s.items.length);
  const budget = useBudgetStatus();
  const savings = useTotalSavings();
  const [nameOpen, setNameOpen] = useState(false);
  const [name, setName] = useState(profile?.displayName ?? '');

  if (!profile) return null;

  const stores = profile.preferredStoreIds.map((id) => catalog.storesById[id]).filter((s): s is Store => !!s);
  const countries = Array.from(new Set(stores.map((s) => s.country)));
  const open = (section: string) => router.push({ pathname: '/parametres/[section]', params: { section } } as unknown as Href);
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const saveName = () => {
    const res = useProfileStore.getState().updateProfile({ displayName: name });
    if (!res.ok) {
      toast.show({ title: 'Oups', message: res.issues[0]?.message, tone: 'danger' });
      return;
    }
    setNameOpen(false);
    toast.show({ title: name.trim() ? `Enchanté, ${name.trim()} !` : 'Prénom retiré', tone: 'success', duration: 1800 });
  };

  return (
    <Screen title="Profil" bottomInset="tabBar" testID="profile-screen">
      <View style={{ gap: t.spacing.xl }}>
        {/* En-tête */}
        <Card variant="hero" padding="lg" radius="xl" testID="profile-hero">
          <View style={styles.heroRow}>
            <Avatar name={profile.displayName || 'Mon foyer'} emoji={profile.displayName ? undefined : '🏡'} size={56} />
            <View style={styles.flex}>
              <Text variant="title2" color="heroText" numberOfLines={1}>
                {profile.displayName || 'Mon foyer'}
              </Text>
              <Text variant="footnote" color="heroText">
                {householdSummary(profile.household)}
              </Text>
              <View style={[styles.inline, { marginTop: t.spacing.xs }]}>
                <Badge
                  label={sub.isPremium ? (sub.isTrial ? 'Premium · essai' : 'Premium') : 'Offre gratuite'}
                  tone={sub.isPremium ? 'premium' : 'neutral'}
                  variant="solid"
                  icon={sub.isPremium ? Crown : undefined}
                  size="sm"
                />
              </View>
            </View>
            <Button
              label="Prénom"
              size="sm"
              variant="tonal"
              leftIcon={Pencil}
              accessibilityLabel="Modifier mon prénom"
              onPress={() => {
                setName(profile.displayName);
                setNameOpen(true);
              }}
              testID="profile-edit-name"
            />
          </View>
        </Card>

        {!sub.isPremium ? (
          <Card variant="accent" padding="lg" radius="xl" onPress={() => router.push('/premium' as Href)} accessibilityLabel="Découvrir Premium" testID="profile-premium">
            <View style={styles.heroRow}>
              <Crown size={t.iconSize.xl} color={t.colors.onAccent} />
              <View style={styles.flex}>
                <Text variant="headline" color="onAccent">
                  Passe à Premium
                </Text>
                <Text variant="footnote" color="onAccent">
                  Toute ta semaine planifiée, le panier le moins cher, alertes prix. 7 jours offerts.
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

        {/* Mon foyer */}
        <View>
          <SectionHeader title="Mon foyer" />
          <Card variant="plain" padding="none" radius="lg">
            <ListRow icon={Home} title="Foyer" subtitle={householdSummary(profile.household)} chevron onPress={() => open('foyer')} testID="row-foyer" />
            <ListRow
              icon={HeartPulse}
              title="Goûts & santé"
              subtitle={
                profile.allergens.length + profile.diets.length + profile.dislikedIngredientIds.length === 0
                  ? 'Aucune restriction'
                  : joinFr(
                      [
                        profile.diets.length ? `${profile.diets.length} régime${profile.diets.length > 1 ? 's' : ''}` : '',
                        profile.allergens.length ? `${profile.allergens.length} allergie${profile.allergens.length > 1 ? 's' : ''}` : '',
                        profile.dislikedIngredientIds.length ? `${profile.dislikedIngredientIds.length} aliment${profile.dislikedIngredientIds.length > 1 ? 's' : ''} évité${profile.dislikedIngredientIds.length > 1 ? 's' : ''}` : '',
                      ].filter(Boolean),
                    )
              }
              chevron
              onPress={() => open('regime')}
              testID="row-regime"
            />
            <ListRow
              icon={Wallet}
              title="Budget & temps"
              subtitle={`${formatPrice(profile.weeklyBudgetCents, { compact: true })}/semaine · ${cookLabel(profile.maxCookTimeWeekdayMin)} en semaine`}
              chevron
              onPress={() => open('budget')}
              testID="row-budget"
            />
            <ListRow
              icon={UtensilsCrossed}
              title="Ta cuisine"
              subtitle={`${profile.equipment.length} ustensile${profile.equipment.length > 1 ? 's' : ''}${profile.favoriteCuisines.length ? ` · ${profile.favoriteCuisines.length} cuisine${profile.favoriteCuisines.length > 1 ? 's' : ''} préférée${profile.favoriteCuisines.length > 1 ? 's' : ''}` : ''}`}
              chevron
              onPress={() => open('cuisine')}
              testID="row-cuisine"
            />
            <ListRow
              icon={StoreIcon}
              title={`Magasins ${countries.map((c) => COUNTRY_FLAGS[c]).join(' ')}`}
              subtitle={stores.map(storeDisplayName).join(', ') || 'Aucun magasin'}
              right={<StoreBadgeStack chains={stores.map((s) => s.chain)} size="xs" max={4} />}
              chevron
              onPress={() => open('magasins')}
              testID="row-magasins"
            />
            <ListRow
              icon={CalendarDays}
              title="Repas planifiés"
              subtitle={mealsPerWeekLabel(profile.mealSlots.length)}
              chevron
              onPress={() => open('repas')}
              testID="row-repas"
            />
          </Card>
        </View>

        {/* Outils */}
        <View>
          <SectionHeader title="Mes outils" />
          <Card variant="plain" padding="none" radius="lg">
            <ListRow
              icon={Archive}
              title="Placard anti-gaspi"
              subtitle={pantryCount > 0 ? `${pantryCount} article${pantryCount > 1 ? 's' : ''} à la maison` : 'Note ce que tu as déjà'}
              chevron
              onPress={() => router.push('/placard' as Href)}
              testID="row-placard"
            />
            <ListRow
              icon={BarChart3}
              title="Suivi du budget"
              subtitle={`${formatPrice(budget.spentCents)} dépensés cette semaine${savings > 0 ? ` · ${formatPrice(savings)} économisés` : ''}`}
              right={sub.isPremium ? undefined : <Badge label="Premium" tone="premium" size="sm" icon={Crown} />}
              chevron
              onPress={() => router.push('/budget' as Href)}
              testID="row-budget-tracking"
            />
          </Card>
        </View>

        {/* Réglages */}
        <View>
          <SectionHeader title="Réglages" />
          <Card variant="plain" padding="none" radius="lg">
            <ListRow icon={Bell} title="Notifications" subtitle="Rappels de planning, de commande, baisses de prix" chevron onPress={() => router.push('/parametres/notifications' as Href)} testID="row-notifications" />
            <ListRow icon={Crown} title="Abonnement" subtitle={sub.isPremium ? (sub.isTrial ? 'Essai Premium en cours' : 'Premium actif') : 'Offre gratuite'} chevron onPress={() => router.push('/premium' as Href)} testID="row-subscription" />
            <ListRow
              icon={Vibrate}
              title="Retours haptiques"
              subtitle="Petites vibrations sur les gestes importants"
              right={<Switch value={settings.hapticsEnabled} onValueChange={settings.setHapticsEnabled} accessibilityLabel="Retours haptiques" testID="switch-haptics" />}
            />
            <ListRow
              icon={ShieldCheck}
              title="Mesure d’audience"
              subtitle="Anonyme, jamais de donnée de santé. Désactivée par défaut."
              right={<Switch value={settings.analyticsConsent} onValueChange={settings.setAnalyticsConsent} accessibilityLabel="Mesure d’audience anonyme" testID="switch-analytics" />}
            />
            <ListRow icon={ShoppingBasket} title="Compte & données" subtitle="Exporter ou supprimer tes données (RGPD)" chevron onPress={() => router.push('/parametres/compte' as Href)} testID="row-account" />
          </Card>
          <View style={{ marginTop: t.spacing.lg, gap: t.spacing.sm }}>
            <Text variant="subhead">Apparence</Text>
            <SegmentedControl<ThemePreference>
              options={[
                { value: 'system', label: 'Auto', icon: Smartphone },
                { value: 'light', label: 'Clair', icon: Sun },
                { value: 'dark', label: 'Sombre', icon: Moon },
              ]}
              value={settings.themePreference}
              onChange={settings.setThemePreference}
              size="sm"
              accessibilityLabel="Thème de l’application"
              testID="theme-switch"
            />
          </View>
        </View>

        {/* À propos */}
        <View style={[styles.about, { gap: t.spacing.xs, paddingVertical: t.spacing.lg }]}>
          <CabasLogo size={28} />
          <Text variant="footnote" color="textSecondary" align="center">
            Cabas {version} · Tes courses, de A à Z.
          </Text>
          <Text variant="caption" color="textTertiary" align="center">
            {isDemoMode ? 'Mode démo : prix indicatifs, données sur ton appareil.' : 'Données hébergées en Europe.'}
          </Text>
        </View>
      </View>

      <Dialog
        visible={nameOpen}
        onClose={() => setNameOpen(false)}
        title="Comment t’appelles-tu ?"
        message="Juste pour te saluer. Laisse vide si tu préfères."
        actions={
          <>
            <Button label="Enregistrer" fullWidth onPress={saveName} testID="name-save" />
            <Button label="Annuler" variant="ghost" fullWidth onPress={() => setNameOpen(false)} />
          </>
        }
      >
        <TextField value={name} onChangeText={setName} placeholder="Ton prénom" maxLength={40} autoFocus returnKeyType="done" onSubmitEditing={saveName} testID="name-input" />
      </Dialog>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  inline: { flexDirection: 'row', gap: 6 },
  about: { alignItems: 'center' },
});

/**
 * Réglages › Notifications : autorisation demandée par un geste explicite
 * (jamais au lancement), rappel de planification (jour + heure), rappel de
 * commande, baisses de prix (Premium). Chaque changement reprogramme les
 * rappels (`updateNotificationPrefs`).
 */
import { router, type Href } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { BellRing, CalendarClock, Crown, ShoppingCart, TrendingDown } from 'lucide-react-native';

import {
  formatHour,
  permissionView,
  planningReminderSentence,
  REMINDER_HOUR_RANGE,
  SettingsGroup,
  SettingsRow,
  WeekdayPicker,
} from '@/components/feature/account';
import { premiumHref } from '@/components/feature/premium';
import { Button, Card, InfoBanner, Row, Screen, Stack, staggerEntering, Stepper, Switch, Text, useToast } from '@/components/ui';
import type { NotificationPreferences } from '@/core';
import { useSubscription } from '@/hooks';
import { getPermissionStatus, type PermissionStatus } from '@/services/notifications';
import { useSettingsStore } from '@/stores';
import { useTheme } from '@/theme';

export default function NotificationSettings() {
  const t = useTheme();
  const toast = useToast();
  const sub = useSubscription();
  const prefs = useSettingsStore((s) => s.notificationPrefs);
  const known = useSettingsStore((s) => s.notificationPermission);
  const [permission, setPermission] = useState<PermissionStatus | null>(known);
  const [requesting, setRequesting] = useState(false);

  // Statut réel (l'utilisateur a pu changer d'avis dans les réglages du téléphone).
  useEffect(() => {
    let alive = true;
    void getPermissionStatus().then((s) => alive && setPermission(s));
    return () => {
      alive = false;
    };
  }, []);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/profil' as Href));
  const update = (patch: Partial<NotificationPreferences>) => void useSettingsStore.getState().updateNotificationPrefs(patch);
  const view = permissionView(permission);
  const canPriceAlerts = sub.canUse('price_alerts');

  const request = async () => {
    setRequesting(true);
    const status = await useSettingsStore.getState().requestNotificationPermission();
    setRequesting(false);
    setPermission(status);
    if (status === 'granted') toast.show({ title: 'C’est noté !', message: 'Cabas te préviendra au bon moment.', tone: 'success' });
    else if (status === 'denied') toast.show({ title: 'Notifications refusées', message: 'Tu pourras changer d’avis dans les réglages du téléphone.', tone: 'neutral' });
  };

  const openSystemSettings = () => {
    if (Platform.OS === 'web') return;
    void Linking.openSettings().catch(() => undefined);
  };

  return (
    <Screen title="Notifications" subtitle="Des rappels utiles, au bon moment. Jamais de pub." onBack={back} testID="settings-notifications-screen">
      <View style={{ gap: t.spacing.xxl }}>
        <Animated.View entering={staggerEntering(0)}>
          {view.action ? (
            <Card variant={view.tone === 'tip' ? 'accent' : 'plain'} padding="lg" testID="notif-permission">
              <Stack gap="md">
                <Row gap="md" align="flex-start">
                  <View style={[styles.icon, { backgroundColor: t.colors.surface, borderRadius: t.radius.md }]}>
                    <BellRing size={t.iconSize.md} color={t.colors.accentText} />
                  </View>
                  <View style={styles.flex}>
                    <Text variant="headline">{view.title}</Text>
                    <Text variant="footnote" color="textSecondary">
                      {view.message}
                    </Text>
                  </View>
                </Row>
                {view.action === 'request' ? (
                  <Button label="Autoriser les notifications" leftIcon={BellRing} loading={requesting} onPress={() => void request()} testID="notif-request" />
                ) : Platform.OS !== 'web' ? (
                  <Button label="Ouvrir les réglages" variant="tonal" onPress={openSystemSettings} testID="notif-open-settings" />
                ) : null}
              </Stack>
            </Card>
          ) : (
            <InfoBanner tone={view.tone === 'success' ? 'success' : 'neutral'} title={view.title} message={view.message} />
          )}
        </Animated.View>

        <Animated.View entering={staggerEntering(1)}>
          <SettingsGroup title="Planification" note="Un seul rappel par semaine, le jour de ton choix.">
            <View>
              <SettingsRow
                icon={CalendarClock}
                title="Rappel de planification"
                subtitle={prefs.planningReminder ? planningReminderSentence(prefs) : 'Désactivé'}
                right={
                  <Switch
                    value={prefs.planningReminder}
                    onValueChange={(planningReminder) => update({ planningReminder })}
                    accessibilityLabel="Rappel de planification"
                    testID="notif-planning"
                  />
                }
              />
              {prefs.planningReminder ? (
                <Animated.View
                  entering={FadeIn.duration(t.motion.duration.base)}
                  exiting={FadeOut.duration(t.motion.duration.fast)}
                  layout={LinearTransition.springify().damping(t.motion.spring.damping)}
                  style={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.lg, gap: t.spacing.lg }}
                >
                  <Stack gap="sm">
                    <Text variant="subhead" color="textSecondary">
                      Quel jour ?
                    </Text>
                    {/* La rangée déborde dans la marge de la carte : chaque jour garde une cible ≥ 44 pt. */}
                    <WeekdayPicker
                      value={prefs.planningReminderWeekday}
                      onChange={(planningReminderWeekday) => update({ planningReminderWeekday })}
                      accessibilityLabel="Jour du rappel"
                      style={{ marginHorizontal: -(t.spacing.lg - t.spacing.xs) }}
                      testID="notif-day"
                    />
                  </Stack>
                  <Row gap="md" justify="space-between">
                    <Text variant="subhead" color="textSecondary">
                      À quelle heure ?
                    </Text>
                    <Stepper
                      value={prefs.planningReminderHour}
                      onChange={(planningReminderHour) => update({ planningReminderHour })}
                      min={REMINDER_HOUR_RANGE.min}
                      max={REMINDER_HOUR_RANGE.max}
                      format={formatHour}
                      accessibilityLabel="Heure du rappel"
                      testID="notif-hour"
                    />
                  </Row>
                </Animated.View>
              ) : null}
            </View>
          </SettingsGroup>
        </Animated.View>

        <Animated.View entering={staggerEntering(2)}>
          <SettingsGroup title="Courses">
            <SettingsRow
              icon={ShoppingCart}
              title="Rappel de commande"
              subtitle="Le vendredi matin, si ton panier attend encore."
              right={
                <Switch
                  value={prefs.orderReminder}
                  onValueChange={(orderReminder) => update({ orderReminder })}
                  accessibilityLabel="Rappel de commande"
                  testID="notif-order"
                />
              }
            />
            {canPriceAlerts ? (
              <SettingsRow
                icon={TrendingDown}
                title="Baisses de prix"
                subtitle="Dès qu’un de tes produits habituels passe en promo."
                right={
                  <Switch
                    value={prefs.priceDrops}
                    onValueChange={(priceDrops) => update({ priceDrops })}
                    accessibilityLabel="Alertes de baisse de prix"
                    testID="notif-price"
                  />
                }
              />
            ) : (
              <SettingsRow
                icon={TrendingDown}
                title="Baisses de prix"
                subtitle="Avec Premium : une alerte quand un produit baisse."
                right={
                  <View style={[styles.lock, { backgroundColor: t.colors.accentSoft, borderRadius: t.radius.pill }]}>
                    <Crown size={t.iconSize.sm} color={t.colors.accentText} strokeWidth={2.4} />
                  </View>
                }
                chevron
                onPress={() => router.push(premiumHref('price_alerts') as Href)}
                accessibilityHint="Découvrir Premium"
                testID="notif-price-locked"
              />
            )}
          </SettingsGroup>
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  lock: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
});

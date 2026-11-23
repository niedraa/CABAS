/**
 * Réglages des notifications : autorisation système, rappel de planification
 * (jour + heure), rappel de commande, alertes baisse de prix (Premium).
 */
import { router, type Href } from 'expo-router';
import React, { useEffect } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { BellRing, CalendarClock, Crown, ShoppingCart, TrendingDown } from 'lucide-react-native';

import { WEEKDAY_LABELS } from '@/components/feature/profile';
import { Card, Chip, InfoBanner, ListRow, Screen, Stepper, Switch, Text } from '@/components/ui';
import { useSubscription } from '@/hooks';
import { getPermissionStatus, notificationsSupported } from '@/services/notifications';
import { useSettingsStore } from '@/stores';
import { useTheme } from '@/theme';

export default function NotificationsSettings() {
  const t = useTheme();
  const sub = useSubscription();
  const prefs = useSettingsStore((s) => s.notificationPrefs);
  const permission = useSettingsStore((s) => s.notificationPermission);
  const update = useSettingsStore((s) => s.updateNotificationPrefs);
  const supported = Platform.OS !== 'web' && notificationsSupported();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/profil' as Href));

  useEffect(() => {
    if (!supported) return;
    void getPermissionStatus().then((status) => useSettingsStore.setState({ notificationPermission: status }));
  }, [supported]);

  const ask = async () => {
    const status = await useSettingsStore.getState().requestNotificationPermission();
    if (status === 'denied') void Linking.openSettings().catch(() => undefined);
  };

  return (
    <Screen title="Notifications" subtitle="Juste ce qu’il faut, au bon moment." onBack={close} bottomInset="safe" testID="notifications-screen">
      <View style={{ gap: t.spacing.xl }}>
        {!supported ? (
          <InfoBanner tone="info" message="Les notifications sont disponibles dans l’application iPhone et Android. Tes réglages sont enregistrés." />
        ) : permission !== 'granted' ? (
          <InfoBanner
            tone="warning"
            icon={BellRing}
            title={permission === 'denied' ? 'Notifications bloquées' : 'Active les notifications'}
            message={
              permission === 'denied'
                ? 'Autorise Cabas dans les réglages de ton téléphone pour recevoir tes rappels.'
                : 'Pour recevoir tes rappels de planning et de commande.'
            }
            action={{ label: permission === 'denied' ? 'Ouvrir les réglages' : 'Autoriser', onPress: () => void ask() }}
          />
        ) : null}

        <Card variant="plain" padding="none" radius="lg">
          <ListRow
            icon={CalendarClock}
            title="Rappel de planification"
            subtitle={`Chaque ${['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'][prefs.planningReminderWeekday]} à ${prefs.planningReminderHour} h`}
            right={
              <Switch
                value={prefs.planningReminder}
                onValueChange={(v) => void update({ planningReminder: v })}
                accessibilityLabel="Rappel de planification"
                testID="switch-planning"
              />
            }
          />
          {prefs.planningReminder ? (
            <View style={{ padding: t.spacing.lg, paddingTop: 0, gap: t.spacing.md }}>
              <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Jour du rappel">
                {WEEKDAY_LABELS.map((label, i) => (
                  <Chip
                    key={label}
                    label={label}
                    size="sm"
                    role="radio"
                    selected={prefs.planningReminderWeekday === i}
                    onPress={() => void update({ planningReminderWeekday: i })}
                  />
                ))}
              </View>
              <View style={styles.row}>
                <Text variant="callout" style={styles.flex}>
                  Heure
                </Text>
                <Stepper
                  value={prefs.planningReminderHour}
                  onChange={(h) => void update({ planningReminderHour: h })}
                  min={6}
                  max={22}
                  format={(h) => `${h} h`}
                  accessibilityLabel="Heure du rappel"
                  size="sm"
                />
              </View>
            </View>
          ) : null}
          <ListRow
            icon={ShoppingCart}
            title="Rappel de commande"
            subtitle="Le lendemain matin si ton panier attend"
            right={
              <Switch value={prefs.orderReminder} onValueChange={(v) => void update({ orderReminder: v })} accessibilityLabel="Rappel de commande" testID="switch-order" />
            }
          />
          <ListRow
            icon={TrendingDown}
            title="Baisses de prix"
            subtitle={sub.isPremium ? 'Sur tes produits habituels' : 'Premium : sur tes produits habituels'}
            right={
              sub.isPremium ? (
                <Switch value={prefs.priceDrops} onValueChange={(v) => void update({ priceDrops: v })} accessibilityLabel="Alertes baisse de prix" testID="switch-prices" />
              ) : (
                <Crown size={t.iconSize.md} color={t.colors.accentText} />
              )
            }
            onPress={sub.isPremium ? undefined : () => router.push('/premium' as Href)}
          />
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});

/**
 * Réglages › Apparence : thème (Auto / Clair / Sombre — l'app bascule
 * aussitôt) et retour haptique.
 */
import { router, type Href } from 'expo-router';
import React from 'react';
import { Platform, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Vibrate } from 'lucide-react-native';

import { SettingsGroup, SettingsRow, ThemePicker } from '@/components/feature/account';
import { Screen, SectionHeader, staggerEntering, Switch } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { useSettingsStore } from '@/stores';
import { useTheme } from '@/theme';

export default function AppearanceSettings() {
  const t = useTheme();
  const theme = useSettingsStore((s) => s.themePreference);
  const hapticsOn = useSettingsStore((s) => s.hapticsEnabled);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profil' as Href));

  return (
    <Screen title="Apparence" subtitle="Cabas, à ta façon." onBack={back} testID="settings-apparence-screen">
      <View style={{ gap: t.spacing.xxl }}>
        <Animated.View entering={staggerEntering(0)} style={{ gap: t.spacing.md }}>
          <SectionHeader title="Thème" subtitle="« Auto » suit le réglage de ton téléphone." />
          <ThemePicker value={theme} onChange={(p) => useSettingsStore.getState().setThemePreference(p)} />
        </Animated.View>

        <Animated.View entering={staggerEntering(1)}>
          <SettingsGroup
            title="Toucher"
            note={Platform.OS === 'web' ? 'Les vibrations ne s’appliquent que sur téléphone.' : undefined}
          >
            <SettingsRow
              icon={Vibrate}
              title="Retour haptique"
              subtitle="Quand tu coches, choisis ou valides."
              right={
                <Switch
                  value={hapticsOn}
                  onValueChange={(on) => {
                    useSettingsStore.getState().setHapticsEnabled(on);
                    // Petit retour immédiat pour sentir la différence.
                    if (on) haptics.success();
                  }}
                  accessibilityLabel="Retour haptique"
                  testID="haptics-switch"
                />
              }
            />
          </SettingsGroup>
        </Animated.View>
      </View>
    </Screen>
  );
}

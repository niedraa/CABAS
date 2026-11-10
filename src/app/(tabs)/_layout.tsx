/**
 * Onglets principaux : Semaine · Liste · Prix · Profil.
 * Barre d'onglets personnalisée du kit (`AnimatedTabBar` : pastille qui glisse
 * au ressort, compteur d'articles restants sur « Liste »). Les écrans
 * apparaissent en fondu (animation « fade » des onglets JS).
 */
import { Tabs } from 'expo-router';
import React from 'react';
import { CalendarDays, CircleUser, ListChecks, Scale } from 'lucide-react-native';

import { AnimatedTabBar } from '@/components/ui';
import { useListProgress } from '@/stores';
import { useTheme } from '@/theme';

const ICONS = { index: CalendarDays, liste: ListChecks, panier: Scale, profil: CircleUser };

export default function TabsLayout() {
  const t = useTheme();
  const progress = useListProgress();
  const remaining = Math.max(0, progress.total - progress.done);

  return (
    <Tabs
      tabBar={(props) => <AnimatedTabBar {...props} icons={ICONS} />}
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        sceneStyle: { backgroundColor: t.colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Semaine', tabBarAccessibilityLabel: 'Semaine : mes repas', tabBarButtonTestID: 'tab-semaine' }}
      />
      <Tabs.Screen
        name="liste"
        options={{
          title: 'Liste',
          tabBarBadge: remaining > 0 ? remaining : undefined,
          tabBarAccessibilityLabel:
            remaining > 0 ? `Liste de courses, ${remaining} article${remaining > 1 ? 's' : ''} à acheter` : 'Liste de courses',
          tabBarButtonTestID: 'tab-liste',
        }}
      />
      <Tabs.Screen
        name="panier"
        options={{ title: 'Prix', tabBarAccessibilityLabel: 'Prix : comparateur et panier', tabBarButtonTestID: 'tab-prix' }}
      />
      <Tabs.Screen
        name="profil"
        options={{ title: 'Profil', tabBarAccessibilityLabel: 'Profil et réglages', tabBarButtonTestID: 'tab-profil' }}
      />
    </Tabs>
  );
}

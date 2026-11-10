/**
 * Layout racine : providers (gestes, zones sûres, thème, toasts), polices,
 * écran de lancement, démarrage de l'app et garde d'onboarding.
 *
 * Le splash reste affiché tant que les polices ne sont pas chargées, que les
 * stores n'ont pas relu le disque et que `useAppBootstrap()` n'est pas prêt
 * (jamais plus de 2,5 s d'attente réseau : l'app marche hors-ligne).
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFonts } from 'expo-font';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
  Stack,
  type ErrorBoundaryProps,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RotateCcw } from 'lucide-react-native';

import { CookingPot } from '@/components/brand';
import { rootScreenOptionsFor } from '@/components/feature/onboarding';
import { Button, Stack as VStack, Text, ToastProvider } from '@/components/ui';
import { useAppBootstrap } from '@/hooks';
import { captureError } from '@/services/monitoring';
import { useProfileStore, useSettingsStore } from '@/stores';
import { appFonts, ThemeProvider, useTheme } from '@/theme';

// Le splash natif reste affiché jusqu'à ce que l'app soit prête.
SplashScreen.preventAutoHideAsync().catch(() => undefined);
try {
  SplashScreen.setOptions({ duration: 280, fade: true });
} catch {
  // Options non prises en charge sur cette plateforme.
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(appFonts);
  const { ready } = useAppBootstrap();
  const themePreference = useSettingsStore((s) => s.themePreference);
  // Polices en échec : on affiche quand même l'app (polices système).
  const fontsReady = fontsLoaded || !!fontError;
  const appReady = fontsReady && ready;

  useEffect(() => {
    if (fontError) captureError(fontError, { where: 'fonts' });
  }, [fontError]);

  useEffect(() => {
    if (appReady) SplashScreen.hideAsync().catch(() => undefined);
  }, [appReady]);

  return (
    // Racines requises par le kit UI : gestes (Sheet) et zones sûres (Screen, TabBar).
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider preference={themePreference}>
          <ToastProvider>{appReady ? <RootNavigator /> : <BootBackdrop />}</ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Fond forêt identique au splash, le temps du démarrage (évite tout flash). */
function BootBackdrop() {
  const t = useTheme();
  return <View style={[styles.root, { backgroundColor: t.colors.hero }]} testID="boot" />;
}

function RootNavigator() {
  const t = useTheme();
  const onboarded = useProfileStore((s) => s.onboardingCompleted);
  const base = t.scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: t.colors.primary,
      background: t.colors.background,
      card: t.colors.surface,
      text: t.colors.text,
      border: t.colors.border,
      notification: t.colors.accent,
    },
  };

  return (
    <NavigationThemeProvider value={navTheme}>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={({ route }) => ({
          headerShown: false,
          contentStyle: { backgroundColor: t.colors.background },
          animation: 'slide_from_right',
          ...rootScreenOptionsFor(route.name),
        })}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(onboarding)" />
        {/* L'app n'est accessible qu'une fois le profil créé (sinon : retour à l'accueil → onboarding). */}
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
      </Stack>
    </NavigationThemeProvider>
  );
}

/** Erreur de rendu non rattrapée : écran bienveillant + signalement (Sentry si configuré). */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    captureError(error, { where: 'root-error-boundary' });
  }, [error]);
  return (
    <ThemeProvider>
      <ErrorScreen onRetry={retry} />
    </ThemeProvider>
  );
}

function ErrorScreen({ onRetry }: { onRetry: () => Promise<void> }) {
  const t = useTheme();
  return (
    <View style={[styles.root, styles.center, { backgroundColor: t.colors.background, padding: t.spacing.screen }]}>
      <VStack gap="xl" align="center" style={{ maxWidth: t.layout.maxContentWidth }}>
        <CookingPot size={150} />
        <VStack gap="sm" align="center">
          <Text variant="title2" align="center" accessibilityRole="header">
            Oups, ça a débordé
          </Text>
          <Text variant="callout" color="textSecondary" align="center">
            Un petit souci est survenu. Tes données sont en sécurité : réessaie, ça repart.
          </Text>
        </VStack>
        <Button label="Réessayer" leftIcon={RotateCcw} size="lg" onPress={() => void onRetry()} />
      </VStack>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
});

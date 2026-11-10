import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { appFonts, ThemeProvider } from '@/theme';

export default function RootLayout() {
  const [loaded] = useFonts(appFonts);
  if (!loaded) return null;
  return (
    // Racines requises par le kit UI : gestes (Sheet) et zones sûres (Screen, TabBar).
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });

import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';

import { appFonts, ThemeProvider } from '@/theme';

export default function RootLayout() {
  const [loaded] = useFonts(appFonts);
  if (!loaded) return null;
  return (
    <ThemeProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}

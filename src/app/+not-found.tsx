/**
 * Route inconnue (lien cassé, ancienne notification) : illustration et retour
 * à l'accueil, sans culpabiliser.
 */
import { router, Stack as RouterStack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Home } from 'lucide-react-native';

import { EmptyBasket } from '@/components/brand';
import { Button, Stack, Text, useSafeInsets } from '@/components/ui';
import { useTheme } from '@/theme';

export default function NotFound() {
  const t = useTheme();
  const insets = useSafeInsets();
  return (
    <View
      style={[
        styles.root,
        { backgroundColor: t.colors.background, paddingTop: insets.top, paddingBottom: insets.bottom + t.spacing.xl, paddingHorizontal: t.spacing.screen },
      ]}
      testID="not-found"
    >
      <RouterStack.Screen options={{ title: 'Page introuvable' }} />
      <Stack gap="xl" align="center" style={{ maxWidth: t.layout.maxContentWidth }}>
        <EmptyBasket size={168} />
        <Stack gap="sm" align="center">
          <Text variant="overline" color="accentText">
            Erreur 404
          </Text>
          <Text variant="title2" align="center" accessibilityRole="header">
            Cette page s’est perdue au marché
          </Text>
          <Text variant="callout" color="textSecondary" align="center">
            Le lien est peut-être ancien. Rien de grave : on te ramène à ta semaine.
          </Text>
        </Stack>
        <Button label="Retour à l’accueil" leftIcon={Home} size="lg" style={styles.center} onPress={() => router.replace('/')} />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { alignSelf: 'center' },
});

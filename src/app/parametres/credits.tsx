/**
 * Crédits : auteur et licence de chaque photo de plat (Wikimedia Commons,
 * licences libres — l'attribution est obligatoire), et mention des marques.
 * Toucher une ligne ouvre la page de la photo.
 */
import * as WebBrowser from 'expo-web-browser';
import { router, type Href } from 'expo-router';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { ExternalLink } from 'lucide-react-native';

import { Card, ListRow, RecipeThumb, Screen, Text } from '@/components/ui';
import { useCatalog } from '@/services/catalog';
import { recipePhotoCredits, useTheme } from '@/theme';

export default function CreditsScreen() {
  const t = useTheme();
  const catalog = useCatalog();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/profil' as Href));
  const rows = useMemo(
    () =>
      Object.entries(recipePhotoCredits)
        .map(([id, credit]) => ({ recipe: catalog.recipesById[id], credit }))
        .filter((r) => !!r.recipe)
        .sort((a, b) => a.recipe.title.localeCompare(b.recipe.title, 'fr')),
    [catalog],
  );

  return (
    <Screen title="Crédits" subtitle="Merci aux photographes qui partagent leur travail." onBack={close} bottomInset="safe" testID="credits-screen">
      <View style={{ gap: t.spacing.lg }}>
        <Text variant="footnote" color="textSecondary">
          Les photos des plats proviennent de Wikimedia Commons, sous licences libres (CC0, CC BY, CC BY-SA ou domaine public). Elles
          illustrent des plats similaires aux recettes. Les noms et logos des enseignes appartiennent à leurs propriétaires
          respectifs et servent uniquement à identifier les magasins comparés. Les prix relevés en magasin et les produits
          réels viennent d’Open Prices et d’Open Food Facts (licence ODbL), merci à leur communauté.
        </Text>
        <Card variant="plain" padding="none" radius="lg">
          {rows.map(({ recipe, credit }) => (
            <ListRow
              key={recipe.id}
              left={<RecipeThumb emoji={recipe.emoji} seed={recipe.id} recipeId={recipe.id} size="sm" />}
              title={recipe.title}
              subtitle={`${credit.author} · ${credit.license}`}
              right={<ExternalLink size={t.iconSize.sm} color={t.colors.textTertiary} />}
              onPress={() => void WebBrowser.openBrowserAsync(credit.source).catch(() => undefined)}
              accessibilityHint="Ouvre la page de la photo"
            />
          ))}
        </Card>
      </View>
    </Screen>
  );
}

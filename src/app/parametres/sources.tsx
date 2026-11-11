/**
 * Réglages › Sources et licences : d'où viennent les produits (Open Food
 * Facts), les prix (Open Prices) et les enseignes (OpenStreetMap), sous
 * licence ODbL ; date de l'instantané et fenêtre des relevés ; couverture
 * (prix relevés / estimés) et indice de prix de chaque enseigne (mesuré ou
 * issu de la presse) ; méthode des estimations ; frais et services indicatifs.
 * Lit la description de l'instantané COURANT (`useCatalog().meta`).
 */
import { router, type Href } from 'expo-router';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { CalendarRange, Scale } from 'lucide-react-native';

import { SettingsGroup, SettingsRow } from '@/components/feature/account';
import { ChainCoverageRow, chainRows, dataSources, ESTIMATE_METHODS, MethodStep, ODBL, snapshotSummary, SourceRow } from '@/components/feature/sources';
import { Card, Divider, InfoBanner, Screen, SectionHeader, staggerEntering, Text } from '@/components/ui';
import { openExternalUrl } from '@/lib/links';
import { useCatalog } from '@/services/catalog';
import { useTheme } from '@/theme';

export default function SourcesSettings() {
  const t = useTheme();
  const catalog = useCatalog();
  const meta = catalog.meta;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profil' as Href));
  const open = (url: string) => void openExternalUrl(url);

  const sources = useMemo(() => dataSources(meta), [meta]);
  const snapshot = useMemo(() => snapshotSummary(meta), [meta]);
  const chains = useMemo(() => chainRows(meta, catalog.stores), [meta, catalog.stores]);

  return (
    <Screen title="Sources et licences" subtitle="D’où viennent les prix de Cabas, en toute transparence." onBack={back} testID="settings-sources-screen">
      <View style={{ gap: t.spacing.xxl }}>
        <Animated.View entering={staggerEntering(0)}>
          <SettingsGroup
            title="Les données"
            note="Trois bases ouvertes et collaboratives, sous licence ODbL : tu peux les consulter, les réutiliser et les enrichir."
            testID="sources-list"
          >
            {sources.map((s) => (
              <SourceRow key={s.id} source={s} onOpen={open} testID={`source-${s.id}`} />
            ))}
          </SettingsGroup>
        </Animated.View>

        <Animated.View entering={staggerEntering(1)}>
          <SettingsGroup title="L’instantané" testID="sources-snapshot">
            {snapshot ? (
              <SettingsRow icon={CalendarRange} title={snapshot.title} subtitle={`${snapshot.window}\n${snapshot.counts}`} testID="sources-snapshot-row" />
            ) : (
              <SettingsRow icon={CalendarRange} title="Instantané indisponible" subtitle="Les prix restent indicatifs." />
            )}
            <SettingsRow
              icon={Scale}
              title="Un prix national par enseigne"
              subtitle="Médiane sur un an des relevés de ses magasins de métropole, hors promos."
            />
          </SettingsGroup>
        </Animated.View>

        {chains.length > 0 ? (
          <Animated.View entering={staggerEntering(2)} style={{ gap: t.spacing.sm }}>
            <SectionHeader
              title="Par enseigne"
              subtitle="Prix relevés et estimés, et indice de prix : Leclerc = 100, sur les mêmes produits."
            />
            <Card variant="plain" padding="none" testID="sources-chains">
              {chains.map((row, i) => (
                <React.Fragment key={row.chain}>
                  {i > 0 ? <Divider inset={t.spacing.lg} /> : null}
                  <ChainCoverageRow row={row} testID={`sources-chain-${row.chain}`} />
                </React.Fragment>
              ))}
            </Card>
          </Animated.View>
        ) : null}

        <Animated.View entering={staggerEntering(3)} style={{ gap: t.spacing.md }}>
          <SectionHeader title="Les prix « Estimé »" subtitle="Quand personne n’a encore relevé un produit dans une enseigne, on l’estime — et on te le dit." />
          <Card variant="plain" style={{ gap: t.spacing.lg }} testID="sources-methods">
            {ESTIMATE_METHODS.map((m, i) => (
              <MethodStep key={m.method} n={i + 1} title={m.title} body={m.body} />
            ))}
            <Text variant="footnote" color="textSecondary">
              Une marque nationale n’est jamais estimée chez Lidl, Aldi ou Netto : on n’invente pas un produit qu’ils ne vendent peut-être pas.
            </Text>
          </Card>
        </Animated.View>

        <Animated.View entering={staggerEntering(4)} style={{ gap: t.spacing.md }}>
          <InfoBanner
            tone="neutral"
            title="Frais et services indicatifs"
            message="Drive, click & collect, livraison et minimum de commande varient selon ton magasin : vérifie-les sur le site de l’enseigne."
          />
          <SettingsGroup
            title="Licence"
            note="Aucun logo d’enseigne dans Cabas : les initiales colorées ne sont qu’un repère. Les marques citées appartiennent à leurs propriétaires."
          >
            <SettingsRow
              title={`Open Database License (${ODBL.name})`}
              subtitle="Le catalogue de Cabas en est dérivé et partagé dans les mêmes conditions."
              chevron
              onPress={() => open(ODBL.url)}
              accessibilityHint="Ouvre le texte de la licence dans ton navigateur"
              testID="sources-license"
            />
          </SettingsGroup>
        </Animated.View>
      </View>
    </Screen>
  );
}

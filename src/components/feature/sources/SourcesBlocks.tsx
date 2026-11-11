/**
 * Briques de l'écran « Sources et licences » : une source de données (lien
 * externe), la couverture et l'indice de prix d'une enseigne, une étape de la
 * méthode d'estimation.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ExternalLink } from 'lucide-react-native';

import { Badge, PressableScale, StoreBadge, Text } from '@/components/ui';
import { useTheme } from '@/theme';

import type { ChainRow, DataSource } from './sourcesView';

export interface SourceRowProps {
  source: DataSource;
  onOpen: (url: string) => void;
  testID?: string;
}

/** Une source ouverte : nom, ce que Cabas en tire, licence ; ouvre le site. */
export function SourceRow({ source, onOpen, testID }: SourceRowProps) {
  const t = useTheme();
  const c = t.colors;
  return (
    <PressableScale
      onPress={() => onOpen(source.url)}
      scaleTo={0.985}
      dimOnPress
      accessibilityRole="link"
      accessibilityLabel={`${source.name}, licence ${source.license}. ${source.what}`}
      accessibilityHint="Ouvre le site dans ton navigateur"
      testID={testID}
      style={[styles.row, { gap: t.spacing.md, paddingVertical: t.spacing.md, paddingHorizontal: t.spacing.lg, minHeight: t.layout.minTouchTarget }]}
    >
      <View style={[styles.flex, { gap: t.spacing.xxs }]}>
        <View style={[styles.row, { gap: t.spacing.sm }]}>
          <Text variant="bodyMedium" style={styles.shrink}>
            {source.name}
          </Text>
          <Badge label={source.license} size="sm" />
        </View>
        <Text variant="footnote" color="textSecondary">
          {source.what}
        </Text>
      </View>
      <ExternalLink size={t.iconSize.sm} color={c.textSecondary} />
    </PressableScale>
  );
}

/** Couverture (relevés / estimés) et indice de prix d'une enseigne. */
export function ChainCoverageRow({ row, testID }: { row: ChainRow; testID?: string }) {
  const t = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={row.a11y}
      testID={testID}
      style={[styles.row, { gap: t.spacing.md, paddingVertical: t.spacing.md, paddingHorizontal: t.spacing.lg }]}
    >
      <StoreBadge chain={row.chain} name={row.name} size="md" />
      <View style={[styles.flex, { gap: t.spacing.xxs }]}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {row.name}
        </Text>
        <Text variant="footnote" color="textSecondary" tabular>
          {row.coverage}
        </Text>
        <Text variant="caption" color="textSecondary">
          {row.basisLabel}
        </Text>
      </View>
      <View style={styles.end}>
        <Text variant="headline" tabular>
          {row.index}
        </Text>
        <Text variant="caption" color="textSecondary" align="right">
          {row.comparison}
        </Text>
      </View>
    </View>
  );
}

/** Une méthode d'estimation, numérotée. */
export function MethodStep({ n, title, body }: { n: number; title: string; body: string }) {
  const t = useTheme();
  const c = t.colors;
  const dim = t.iconSize.xl;
  return (
    <View style={[styles.top, { gap: t.spacing.md }]} accessible accessibilityLabel={`${title}. ${body}`}>
      <View style={[styles.num, { width: dim, height: dim, borderRadius: t.radius.pill, backgroundColor: c.primarySoft }]}>
        <Text variant="headline" style={{ color: t.scheme === 'dark' ? c.text : c.primary }}>
          {n}
        </Text>
      </View>
      <View style={[styles.flex, { gap: t.spacing.xxs }]}>
        <Text variant="bodyMedium">{title}</Text>
        <Text variant="footnote" color="textSecondary">
          {body}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  top: { flexDirection: 'row', alignItems: 'flex-start' },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  end: { alignItems: 'flex-end' },
  num: { alignItems: 'center', justifyContent: 'center' },
});

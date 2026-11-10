/**
 * Groupe de réglages : surtitre, carte papier, lignes séparées par un filet
 * (inséré automatiquement), note facultative sous la carte.
 * `SettingsRow` = `ListRow` aux marges de la carte.
 */
import React, { Children } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Card, Divider, ListRow, Text, type ListRowProps } from '@/components/ui';
import { useTheme } from '@/theme';

export interface SettingsGroupProps {
  title?: string;
  /** Petite note sous la carte (explication, mention). */
  note?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function SettingsGroup({ title, note, children, style, testID }: SettingsGroupProps) {
  const t = useTheme();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ gap: t.spacing.sm }, style]} testID={testID}>
      {title ? (
        <Text variant="overline" color="textSecondary" accessibilityRole="header" style={{ marginLeft: t.spacing.xs }}>
          {title}
        </Text>
      ) : null}
      <Card variant="plain" padding="none" style={[styles.card, { borderColor: t.colors.border }]}>
        {rows.map((row, i) => (
          <React.Fragment key={(React.isValidElement(row) && row.key) || i}>
            {i > 0 ? <Divider inset={t.spacing.lg + 40 + t.spacing.md} /> : null}
            {row}
          </React.Fragment>
        ))}
      </Card>
      {note ? (
        <Text variant="footnote" color="textSecondary" style={{ marginHorizontal: t.spacing.xs }}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

/** Ligne de réglage (marges de la carte, sous-titre sur 2 lignes max). */
export function SettingsRow({ style, titleLines = 2, ...props }: ListRowProps) {
  const t = useTheme();
  return <ListRow {...props} titleLines={titleLines} style={[{ paddingHorizontal: t.spacing.lg }, style]} />;
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth * 2 },
});

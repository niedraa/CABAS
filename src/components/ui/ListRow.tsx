/**
 * Ligne de liste : vignette/icône à gauche, titre + sous-titre, accessoire
 * à droite (prix, interrupteur…), chevron optionnel. Pressable si `onPress`.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { useTheme } from '@/theme';

import { renderIcon, type IconLike } from './icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Élément à gauche (vignette, avatar, badge enseigne). */
  left?: React.ReactNode;
  /** Icône à gauche, posée sur une pastille tendre. */
  icon?: IconLike;
  right?: React.ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Nombre de lignes du titre (défaut 1). */
  titleLines?: number;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ListRow({
  title,
  subtitle,
  left,
  icon,
  right,
  chevron,
  onPress,
  destructive,
  disabled,
  titleLines = 1,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ListRowProps) {
  const t = useTheme();
  const c = t.colors;
  const titleColor = destructive ? 'danger' : 'text';

  const body = (
    <>
      {left ?? null}
      {!left && icon ? (
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: destructive ? c.dangerSoft : c.primarySoft, borderRadius: t.radius.sm },
          ]}
        >
          {renderIcon(icon, { size: 20, color: destructive ? c.danger : t.scheme === 'dark' ? c.text : c.primary })}
        </View>
      ) : null}
      <View style={styles.texts}>
        <Text variant="bodyMedium" color={titleColor} numberOfLines={titleLines}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" color="textSecondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? null}
      {chevron ? <ChevronRight size={20} color={c.textTertiary} strokeWidth={2} /> : null}
    </>
  );

  const rowStyle = [styles.row, { minHeight: 56, paddingVertical: t.spacing.md }, style];

  if (onPress) {
    return (
      <PressableScale
        testID={testID}
        onPress={onPress}
        disabled={disabled}
        scaleTo={0.985}
        dimOnPress
        accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
        accessibilityHint={accessibilityHint}
        style={[rowStyle, { opacity: disabled ? t.opacity.disabled : 1 }]}
      >
        {body}
      </PressableScale>
    );
  }
  return (
    <View testID={testID} style={rowStyle} accessible={!right} accessibilityLabel={accessibilityLabel}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, gap: 2 },
});

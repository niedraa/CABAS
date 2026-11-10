/**
 * Ligne « section du profil » (Foyer, Régimes & allergies…) : emoji sur
 * pastille, titre, valeur, détail, accessoire (monogrammes d'enseigne) et
 * chevron. Ouvre l'écran d'édition de la section.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { PressableScale, Text } from '@/components/ui';
import { useTheme } from '@/theme';

export interface ProfileSectionRowProps {
  emoji: string;
  title: string;
  value: string;
  detail?: string | null;
  right?: React.ReactNode;
  onPress: () => void;
  testID?: string;
}

export function ProfileSectionRow({ emoji, title, value, detail, right, onPress, testID }: ProfileSectionRowProps) {
  const t = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.985}
      dimOnPress
      accessibilityRole="button"
      accessibilityLabel={`${title} : ${value}${detail ? `. ${detail}` : ''}. Modifier`}
      style={[styles.row, { paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.md, gap: t.spacing.md }]}
      testID={testID}
    >
      <View style={[styles.emojiBox, { backgroundColor: t.colors.backgroundAlt, borderRadius: t.radius.md }]}>
        <Text style={styles.emoji} accessibilityElementsHidden importantForAccessibility="no">
          {emoji}
        </Text>
      </View>
      <View style={styles.texts}>
        <Text variant="caption" color="textSecondary">
          {title}
        </Text>
        <Text variant="bodyMedium" numberOfLines={2}>
          {value}
        </Text>
        {detail ? (
          <Text variant="footnote" color="textSecondary" numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {right}
      <ChevronRight size={t.iconSize.md} color={t.colors.textTertiary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 64 },
  emojiBox: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 20, lineHeight: 26 },
  texts: { flex: 1, gap: 2 },
});

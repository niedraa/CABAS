/**
 * Carte « étape suivante » du parcours : la liste de courses est prête
 * (repas → liste → prix → commande). Rend le passage 2 → 3 évident.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ArrowRight, ListChecks } from 'lucide-react-native';

import { PressableScale, Text } from '@/components/ui';
import { boxShadow, useTheme } from '@/theme';

import { countLabelFr } from './weekStats';

export interface ListReadyCardProps {
  /** Articles restant à acheter. */
  items: number;
  /** Articles de la liste, cochés compris (0 ou absent : liste pas encore faite). */
  total?: number;
  onPress: () => void;
  testID?: string;
}

const STEPS = ['Profil', 'Repas', 'Liste', 'Prix', 'Commande'] as const;
const CURRENT = 2;

/** Titre et sous-titre selon l'état de la liste : à faire, prête, ou courses terminées. */
export function listReadyCopy(items: number, total = 0): { title: string; subtitle: string } {
  if (items > 0) return { title: 'Ma liste est prête', subtitle: countLabelFr(items, 'article') };
  if (total > 0) return { title: 'Courses terminées', subtitle: 'Tout est coché' };
  return { title: 'Préparer ma liste', subtitle: 'Générée depuis tes repas' };
}

export function ListReadyCard({ items, total, onPress, testID }: ListReadyCardProps) {
  const t = useTheme();
  const c = t.colors;
  const { title, subtitle } = listReadyCopy(items, total);
  return (
    <PressableScale
      onPress={onPress}
      haptic="impact"
      scaleTo={0.98}
      testID={testID}
      accessibilityLabel={`${title} · ${subtitle}. Étape suivante : ta liste de courses.`}
      style={[
        styles.card,
        {
          backgroundColor: c.accent,
          borderRadius: t.radius.xl,
          padding: t.spacing.lg,
          boxShadow: boxShadow('md', c.shadow),
        },
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: c.onAccent, borderRadius: t.radius.md }]}>
          <ListChecks size={t.iconSize.lg} color={c.accent} strokeWidth={2.4} />
        </View>
        <View style={styles.flex}>
          <Text variant="headline" style={{ color: c.onAccent }}>
            {title}
          </Text>
          <Text variant="subhead" style={{ color: c.onAccent, opacity: 0.85 }}>
            {subtitle}
          </Text>
        </View>
        <ArrowRight size={t.iconSize.lg} color={c.onAccent} strokeWidth={2.4} />
      </View>
      <View style={[styles.steps, { marginTop: t.spacing.md }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {STEPS.map((s, i) => (
          <View key={s} style={styles.step}>
            <View
              style={[
                styles.bar,
                {
                  backgroundColor: c.onAccent,
                  opacity: i < CURRENT ? 0.9 : i === CURRENT ? 0.55 : 0.18,
                  borderRadius: t.radius.pill,
                },
              ]}
            />
            <Text variant="caption" numberOfLines={1} style={{ color: c.onAccent, opacity: i <= CURRENT ? 0.95 : 0.6, fontSize: 10 }}>
              {s}
            </Text>
          </View>
        ))}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {},
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  steps: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, gap: 4 },
  bar: { height: 4 },
});

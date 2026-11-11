/**
 * Section « Foyer » : adultes / enfants (compteurs) + illustration vivante du
 * foyer et portions calculées. Composant contrôlé (`value` + `onChange`),
 * réutilisé par l'onboarding et l'édition du profil.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, ZoomIn, ZoomOut } from 'react-native-reanimated';

import { Card, Row, Stack, Stepper, Text } from '@/components/ui';
import type { Household } from '@/core';
import { useTheme } from '@/theme';

import { HOUSEHOLD_LIMITS, householdA11yLabel, householdEmoji, portionsSentence } from './profileOptions';

export interface HouseholdSectionProps {
  value: Household;
  onChange: (value: Household) => void;
  testID?: string;
}

export function HouseholdSection({ value, onChange, testID }: HouseholdSectionProps) {
  const t = useTheme();
  const people = householdEmoji(value);
  const total = value.adults + value.children;
  const overflow = total - people.length;

  return (
    <Stack gap="lg" testID={testID}>
      {/* Le foyer, une pastille par personne. */}
      <View
        style={[styles.family, { backgroundColor: t.colors.primarySoft, borderRadius: t.radius.xl }]}
        accessible
        accessibilityRole="image"
        // Les portions (mises à jour en direct) font partie du libellé : la vue
        // regroupe ses enfants, le texte des portions n'est pas lu seul.
        accessibilityLabel={householdA11yLabel(value)}
        accessibilityLiveRegion="polite"
        testID={testID ? `${testID}-family` : undefined}
      >
        <Animated.View layout={LinearTransition.springify().damping(t.motion.spring.damping)} style={styles.people}>
          {people.map((emoji, i) => (
            <Animated.View
              key={`${i < value.adults ? 'a' : 'c'}-${i}`}
              entering={ZoomIn.springify().damping(t.motion.springBouncy.damping).stiffness(t.motion.springBouncy.stiffness)}
              exiting={ZoomOut.duration(t.motion.duration.fast)}
              layout={LinearTransition.springify().damping(t.motion.spring.damping)}
              style={[
                styles.person,
                {
                  backgroundColor: t.colors.surface,
                  width: i < value.adults ? 60 : 48,
                  height: i < value.adults ? 60 : 48,
                },
              ]}
            >
              <Text style={i < value.adults ? styles.adultEmoji : styles.kidEmoji}>{emoji}</Text>
            </Animated.View>
          ))}
          {overflow > 0 ? (
            <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.person, styles.more, { backgroundColor: t.colors.primary }]}>
              <Text variant="headline" style={{ color: t.colors.onPrimary }}>
                +{overflow}
              </Text>
            </Animated.View>
          ) : null}
        </Animated.View>
        <Text variant="headline" align="center" color="primary" testID={testID ? `${testID}-portions` : undefined}>
          {portionsSentence(value)}
        </Text>
      </View>

      <Card variant="plain" padding="none">
        <CounterRow
          emoji="🧑"
          title="Adultes"
          subtitle="Ados compris"
          value={value.adults}
          min={HOUSEHOLD_LIMITS.adults.min}
          max={HOUSEHOLD_LIMITS.adults.max}
          onChange={(adults) => onChange({ ...value, adults })}
          testID={testID ? `${testID}-adults` : undefined}
        />
        <View style={[styles.sep, { backgroundColor: t.colors.border }]} />
        <CounterRow
          emoji="🧒"
          title="Enfants"
          subtitle="Moins de 12 ans"
          value={value.children}
          min={HOUSEHOLD_LIMITS.children.min}
          max={HOUSEHOLD_LIMITS.children.max}
          onChange={(children) => onChange({ ...value, children })}
          testID={testID ? `${testID}-children` : undefined}
        />
      </Card>
    </Stack>
  );
}

function CounterRow({
  emoji,
  title,
  subtitle,
  value,
  min,
  max,
  onChange,
  testID,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Row gap="md" style={[styles.row, { paddingHorizontal: t.spacing.lg }]}>
      <View
        style={[styles.rowEmoji, { backgroundColor: t.colors.accentSoft, borderRadius: t.radius.md }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <View style={styles.flex}>
        <Text variant="headline">{title}</Text>
        <Text variant="footnote" color="textSecondary">
          {subtitle}
        </Text>
      </View>
      <Stepper value={value} onChange={onChange} min={min} max={max} accessibilityLabel={title} testID={testID} />
    </Row>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  family: { paddingVertical: 24, paddingHorizontal: 16, gap: 16, alignItems: 'center', minHeight: 164, justifyContent: 'center' },
  people: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-end', gap: 8, minHeight: 60 },
  person: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  more: { width: 48, height: 48 },
  adultEmoji: { fontSize: 32, lineHeight: 38 },
  kidEmoji: { fontSize: 24, lineHeight: 30 },
  row: { minHeight: 76, paddingVertical: 12 },
  rowEmoji: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 22, lineHeight: 28 },
  sep: { height: StyleSheet.hairlineWidth * 2, marginLeft: 72 },
});

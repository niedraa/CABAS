/**
 * Section « Créneaux » : grille 7 jours × (midi / soir) de cases à bascule,
 * préréglages en un geste, compteur de repas et rappel (non bloquant) de la
 * limite gratuite. Composant contrôlé (`value` = créneaux).
 */
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { Crown, Moon, Plus, Sun } from 'lucide-react-native';

import { AnimatedNumber, Badge, Chip, InfoBanner, PressableScale, Row, Stack, Text } from '@/components/ui';
import type { MealSlotPreference, MealType } from '@/core';
import { useTheme } from '@/theme';

import { matchingPreset, MEAL_TYPES, SLOT_PRESETS, WEEKDAY_NAMES_FR, hasSlot, toggleSlot } from './profileOptions';

export interface MealSlotsSectionProps {
  value: MealSlotPreference[];
  onChange: (value: MealSlotPreference[]) => void;
  /** Limite de repas planifiés de l'offre gratuite (null = Premium, pas de rappel). */
  freeLimit?: number | null;
  /** Ouvre le paywall depuis le rappel (optionnel). */
  onPremiumPress?: () => void;
  testID?: string;
}

const TYPE_META: Record<MealType, { label: string; icon: typeof Sun }> = {
  dejeuner: { label: 'Midi', icon: Sun },
  diner: { label: 'Soir', icon: Moon },
};

export function MealSlotsSection({ value, onChange, freeLimit = null, onPremiumPress, testID = 'slots' }: MealSlotsSectionProps) {
  const t = useTheme();
  const preset = matchingPreset(value);
  const count = value.length;

  return (
    <Stack gap="lg" testID={testID}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -t.spacing.screen }}
        contentContainerStyle={[styles.presets, { paddingHorizontal: t.spacing.screen }]}
        accessibilityRole="radiogroup"
        accessibilityLabel="Préréglages"
      >
        {SLOT_PRESETS.map((p) => (
          <Chip
            key={p.id}
            // Taille « md » : 44 pt de haut, la cible tactile minimale.
            size="md"
            role="radio"
            emoji={p.emoji}
            label={p.label}
            selected={preset === p.id}
            onPress={() => onChange(p.slots)}
            testID={`${testID}-preset-${p.id}`}
          />
        ))}
      </ScrollView>

      <Row gap="sm" align="baseline" accessible accessibilityLabel={`${count} repas par semaine`} style={styles.counter}>
        <AnimatedNumber value={count} variant="priceLarge" color={count === 0 ? 'danger' : 'primary'} testID={`${testID}-count`} />
        <Text variant="headline" color="textSecondary" style={styles.flex}>
          repas par semaine
        </Text>
        {freeLimit !== null && count > freeLimit ? <Badge label={`${freeLimit} en gratuit`} tone="premium" icon={Crown} size="sm" /> : null}
      </Row>

      <View style={[styles.grid, { backgroundColor: t.colors.surface, borderRadius: t.radius.xl, borderColor: t.colors.border, padding: t.spacing.md }]}>
        <Row style={styles.headRow}>
          <View style={styles.dayCol} />
          {MEAL_TYPES.map((type) => {
            const Icon = TYPE_META[type].icon;
            return (
              <Row key={type} gap="xs" justify="center" style={styles.cellCol}>
                <Icon size={t.iconSize.sm} color={t.colors.textSecondary} />
                <Text variant="caption" color="textSecondary">
                  {TYPE_META[type].label}
                </Text>
              </Row>
            );
          })}
        </Row>
        {WEEKDAY_NAMES_FR.map((day, weekday) => (
          <Row key={day} style={styles.dayRow}>
            <Text variant="bodyMedium" style={styles.dayCol} numberOfLines={1}>
              {day.charAt(0).toUpperCase() + day.slice(1)}
            </Text>
            {MEAL_TYPES.map((type) => (
              <View key={type} style={styles.cellCol}>
                <SlotCell
                  day={day}
                  type={type}
                  selected={hasSlot(value, weekday, type)}
                  weekend={weekday >= 5}
                  onPress={() => onChange(toggleSlot(value, weekday as MealSlotPreference['weekday'], type))}
                  testID={`${testID}-${weekday}-${type}`}
                />
              </View>
            ))}
          </Row>
        ))}
      </View>

      {count === 0 ? (
        <Text variant="footnote" color="danger" align="center" accessibilityLiveRegion="polite">
          Choisis au moins un repas à planifier.
        </Text>
      ) : null}

      {freeLimit !== null && count > freeLimit ? (
        <InfoBanner
          tone="premium"
          icon={Crown}
          title={`En gratuit, Cabas planifie ${freeLimit} repas par semaine`}
          message="Avec Premium, c’est toute ta semaine, sans limite. Tu pourras décider plus tard."
          action={onPremiumPress ? { label: 'Découvrir Premium', onPress: onPremiumPress } : undefined}
        />
      ) : null}
    </Stack>
  );
}

function SlotCell({
  day,
  type,
  selected,
  weekend,
  onPress,
  testID,
}: {
  day: string;
  type: MealType;
  selected: boolean;
  weekend: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const t = useTheme();
  const c = t.colors;
  const reduced = useReducedMotion();
  const p = useDerivedValue(() => (reduced ? (selected ? 1 : 0) : withSpring(selected ? 1 : 0, t.motion.springIndicator)), [selected, reduced]);
  const pop = useSharedValue(1);
  const bg = weekend ? c.accentSoft : c.backgroundAlt;
  const on = type === 'dejeuner' ? c.accent : c.primary;
  const fill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.get(), [0, 1], [bg, on]),
    transform: [{ scale: pop.get() }],
  }));
  const mark = useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ scale: 0.4 + 0.6 * p.get() }, { rotate: `${(1 - p.get()) * -30}deg` }] }));
  const plus = useAnimatedStyle(() => ({ opacity: 1 - p.get(), transform: [{ scale: 1 - 0.5 * p.get() }] }));
  const fg = type === 'dejeuner' ? c.onAccent : c.onPrimary;

  return (
    <PressableScale
      onPress={() => {
        if (!reduced) pop.set(withSequence(withSpring(0.86, t.motion.springSnappy), withSpring(1, t.motion.springBouncy)));
        onPress();
      }}
      haptic="select"
      scaleTo={1}
      accessibilityRole="checkbox"
      accessibilityLabel={`${day} ${type === 'dejeuner' ? 'midi' : 'soir'}`}
      accessibilityState={{ checked: selected }}
      testID={testID}
      style={styles.cellHit}
    >
      <Animated.View style={[styles.cell, { borderRadius: t.radius.md }, fill]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, plus]} pointerEvents="none">
          <Plus size={t.iconSize.sm} color={c.textTertiary} strokeWidth={2.4} />
        </Animated.View>
        <Animated.Text style={[styles.cellEmoji, { color: fg }, mark]} accessibilityElementsHidden importantForAccessibility="no">
          {type === 'dejeuner' ? '🥗' : '🍲'}
        </Animated.Text>
      </Animated.View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  presets: { flexDirection: 'row', gap: 8 },
  counter: { marginTop: -4 },
  grid: { borderWidth: 1, gap: 6 },
  headRow: { paddingBottom: 2 },
  dayRow: { minHeight: 48 },
  dayCol: { width: 96 },
  cellCol: { flex: 1, alignItems: 'center' },
  cellHit: { width: '100%', paddingHorizontal: 4 },
  cell: { height: 44, alignItems: 'center', justifyContent: 'center' },
  cellEmoji: { fontSize: 20, lineHeight: 26 },
});

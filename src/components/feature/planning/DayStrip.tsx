/**
 * Bandeau des 7 jours (« lun. 9 » … « dim. 15 ») : aujourd'hui souligné,
 * pastilles pour les repas planifiés, pastille de sélection qui glisse au
 * ressort (`springIndicator`). Toucher un jour → `onSelect(index)`.
 */
import React, { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated';

import { PressableScale, Text } from '@/components/ui';
import { WEEKDAY_SHORT, parseISODate, weekdayIndex } from '@/core';
import { useTheme } from '@/theme';

export interface DayStripDay {
  date: string;
  /** Nombre de repas planifiés (0 à 2). */
  meals: number;
  /** Créneaux réservés à Premium (offre gratuite). */
  locked?: number;
  isToday?: boolean;
  isPast?: boolean;
  /** Libellé long pour les lecteurs d'écran (« lundi 9 novembre »). */
  label?: string;
}

export interface DayStripProps {
  days: readonly DayStripDay[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const ITEM_H = 68;

export function DayStrip({ days, selectedIndex, onSelect, style, testID }: DayStripProps) {
  const t = useTheme();
  const c = t.colors;
  const [width, setWidth] = useState(0);
  const count = Math.max(1, days.length);
  const itemW = width / count;
  const pillW = Math.max(0, Math.min(itemW - 4, 52));

  const x = useDerivedValue(
    () => withSpring(selectedIndex * itemW + (itemW - pillW) / 2, t.motion.springIndicator),
    [selectedIndex, itemW, pillW],
  );
  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      accessibilityLabel="Jours de la semaine"
      onLayout={onLayout}
      style={[styles.row, { height: ITEM_H }, style]}
    >
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            { width: pillW, height: ITEM_H, borderRadius: t.radius.lg, backgroundColor: c.primary },
            pillStyle,
          ]}
        />
      ) : null}
      {days.map((d, i) => {
        const selected = i === selectedIndex;
        const wd = weekdayIndex(d.date);
        const dayNum = parseISODate(d.date).getDate();
        const fg = selected ? c.onPrimary : d.isPast ? c.textTertiary : c.text;
        const sub = selected ? c.onPrimary : d.isToday ? c.accentText : c.textSecondary;
        const dots: ('meal' | 'locked')[] = [
          ...Array.from({ length: Math.min(2, d.meals) }, () => 'meal' as const),
          ...Array.from({ length: Math.min(2 - Math.min(2, d.meals), d.locked ?? 0) }, () => 'locked' as const),
        ];
        const a11y = [
          d.isToday ? 'Aujourd’hui' : null,
          d.label ?? `${WEEKDAY_SHORT[wd]} ${dayNum}`,
          d.meals === 0 ? 'aucun repas' : `${d.meals} repas`,
        ]
          .filter(Boolean)
          .join(', ');
        return (
          <PressableScale
            key={d.date}
            testID={testID ? `${testID}-${i}` : undefined}
            accessibilityRole="tab"
            accessibilityLabel={a11y}
            accessibilityState={{ selected }}
            aria-selected={selected}
            haptic="select"
            scaleTo={0.92}
            onPress={() => onSelect(i)}
            style={[styles.item, { height: ITEM_H }]}
          >
            <Text variant="caption" style={{ color: sub }} maxFontSizeMultiplier={1.2}>
              {d.isToday && !selected ? 'auj.' : WEEKDAY_SHORT[wd]}
            </Text>
            <Text variant="title3" tabular style={{ color: fg }} maxFontSizeMultiplier={1.2}>
              {dayNum}
            </Text>
            <View style={styles.dots}>
              {dots.length === 0 ? (
                <View style={[styles.dot, { backgroundColor: 'transparent' }]} />
              ) : (
                dots.map((kind, k) => (
                  <View
                    key={k}
                    style={[
                      styles.dot,
                      kind === 'meal'
                        ? { backgroundColor: selected ? c.accent : c.success }
                        : { borderWidth: 1.5, borderColor: selected ? c.onPrimary : c.borderStrong },
                    ]}
                  />
                ))
              )}
            </View>
            {d.isToday ? (
              <View
                style={[
                  styles.todayRing,
                  { width: pillW || 48, height: ITEM_H, borderColor: selected ? 'transparent' : c.accent, borderRadius: t.radius.lg },
                ]}
                pointerEvents="none"
              />
            ) : null}
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  pill: { position: 'absolute', left: 0, top: 0 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1, minWidth: 44 },
  dots: { flexDirection: 'row', gap: 3, height: 6, marginTop: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  todayRing: { position: 'absolute', top: 0, alignSelf: 'center', borderWidth: 2 },
});

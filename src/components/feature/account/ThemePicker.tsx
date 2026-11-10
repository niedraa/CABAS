/**
 * Choix du thème (Auto / Clair / Sombre) : trois tuiles avec un aperçu
 * miniature de l'app dans chaque thème (« Auto » = moitié crème, moitié
 * nuit). La tuile choisie s'entoure de forêt et rebondit.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';

import { PressableScale, Text } from '@/components/ui';
import type { ThemePreference } from '@/stores';
import { darkColors, lightColors, useTheme, type ColorScheme } from '@/theme';

import { THEME_CHOICES } from './settingsOptions';

export interface ThemePickerProps {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
  testID?: string;
}

export function ThemePicker({ value, onChange, testID = 'theme-picker' }: ThemePickerProps) {
  const t = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Thème" style={[styles.row, { gap: t.spacing.sm }]} testID={testID}>
      {THEME_CHOICES.map((o) => (
        <ThemeTile
          key={o.value}
          pref={o.value}
          label={o.label}
          hint={o.hint}
          selected={o.value === value}
          onPress={() => o.value !== value && onChange(o.value)}
          testID={`${testID}-${o.value}`}
        />
      ))}
    </View>
  );
}

function ThemeTile({
  pref,
  label,
  hint,
  selected,
  onPress,
  testID,
}: {
  pref: ThemePreference;
  label: string;
  hint: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const t = useTheme();
  const c = t.colors;
  const p = useDerivedValue(() => withSpring(selected ? 1 : 0, t.motion.springBouncy), [selected]);
  const frame = useAnimatedStyle(() => ({
    borderColor: interpolateColor(p.get(), [0, 1], [c.border, c.primary]),
    transform: [{ scale: 0.97 + 0.03 * p.get() }],
  }));
  const check = useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ scale: 0.4 + 0.6 * p.get() }] }));

  return (
    <PressableScale
      onPress={onPress}
      haptic="select"
      scaleTo={0.96}
      accessibilityRole="radio"
      accessibilityLabel={`${label}, ${hint}`}
      accessibilityState={{ checked: selected }}
      style={styles.flex}
      testID={testID}
    >
      <Animated.View style={[styles.tile, { backgroundColor: c.surface, borderRadius: t.radius.lg, padding: t.spacing.sm, gap: t.spacing.sm }, frame]}>
        <View style={[styles.preview, { borderRadius: t.radius.md }]}>
          {pref === 'system' ? (
            <>
              <MiniApp colors={lightColors} />
              {/* Moitié droite : le même écran, en sombre. */}
              <View style={styles.rightHalf}>
                <View style={styles.fullFromRight}>
                  <MiniApp colors={darkColors} />
                </View>
              </View>
            </>
          ) : (
            <MiniApp colors={pref === 'dark' ? darkColors : lightColors} />
          )}
        </View>
        <View style={styles.labels}>
          <Text variant="headline" align="center">
            {label}
          </Text>
          <Text variant="caption" color="textSecondary" align="center" numberOfLines={2}>
            {hint}
          </Text>
        </View>
        <Animated.View style={[styles.check, { backgroundColor: c.primary }, check]}>
          <Check size={t.iconSize.xs} color={c.onPrimary} strokeWidth={3} />
        </Animated.View>
      </Animated.View>
    </PressableScale>
  );
}

/** Écran miniature : fond, carte, pastille moutarde, lignes de texte. */
function MiniApp({ colors }: { colors: ColorScheme }) {
  const t = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, padding: t.spacing.sm }]}>
      <View style={[styles.line, { width: '55%', backgroundColor: colors.text }]} />
      <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: t.radius.xs }]}>
        <View style={[styles.lineSm, { width: '70%', backgroundColor: colors.textSecondary }]} />
        <View style={[styles.lineSm, { width: '45%', backgroundColor: colors.textTertiary }]} />
      </View>
      <View style={[styles.pill, { backgroundColor: colors.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row' },
  tile: { borderWidth: 2, alignItems: 'stretch' },
  preview: { height: 92, overflow: 'hidden' },
  rightHalf: { position: 'absolute', top: 0, bottom: 0, left: '50%', right: 0, overflow: 'hidden' },
  fullFromRight: { position: 'absolute', top: 0, bottom: 0, right: 0, width: '200%' },
  labels: { gap: 1, paddingBottom: 4 },
  check: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  line: { height: 7, borderRadius: 4, marginBottom: 8 },
  card: { padding: 6, gap: 5, marginBottom: 8 },
  lineSm: { height: 5, borderRadius: 3 },
  pill: { height: 12, width: '60%', borderRadius: 6 },
});

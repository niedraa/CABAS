/**
 * Puce de sélection (régimes, allergies, magasins, filtres).
 * Sélectionnée : fond forêt, coche qui « pousse » au ressort.
 * `ToggleChip` gère son propre état (non contrôlé) si besoin.
 */
import React, { useState } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';

import { useTheme } from '@/theme';

import { renderIcon, type IconLike } from './icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  emoji?: string;
  icon?: IconLike;
  size?: 'sm' | 'md';
  disabled?: boolean;
  /** Rôle a11y : 'checkbox' (multi) ou 'radio' (choix unique). */
  role?: 'checkbox' | 'radio' | 'button';
  /** Ton de la sélection : forêt (défaut) ou tomate (allergies). */
  tone?: 'primary' | 'danger';
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const CHECK = 16;

export function Chip({
  label,
  selected = false,
  onPress,
  emoji,
  icon,
  size = 'md',
  disabled,
  role = 'checkbox',
  tone = 'primary',
  accessibilityHint,
  style,
  testID,
}: ChipProps) {
  const t = useTheme();
  const c = t.colors;
  const selBg = tone === 'danger' ? c.danger : c.primary;
  const selFg = tone === 'danger' ? c.onDanger : c.onPrimary;
  const fg = selected ? selFg : c.text;
  const height = size === 'sm' ? 36 : 44;

  // Progression 0 → 1 de la coche (largeur + échelle).
  const p = useDerivedValue(() => withSpring(selected ? 1 : 0, t.motion.springBouncy), [selected]);
  const checkStyle = useAnimatedStyle(() => ({
    width: (CHECK + 4) * p.get(),
    opacity: p.get(),
    transform: [{ scale: 0.4 + 0.6 * p.get() }],
  }));

  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      haptic="select"
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked: role === 'button' ? undefined : selected, selected, disabled: !!disabled }}
      scaleTo={0.94}
      style={[
        styles.base,
        {
          height,
          paddingHorizontal: size === 'sm' ? 12 : 16,
          borderRadius: t.radius.pill,
          backgroundColor: selected ? selBg : c.surface,
          borderColor: selected ? selBg : c.border,
          opacity: disabled ? t.opacity.disabled : 1,
        },
        style,
      ]}
    >
      <Animated.View style={[styles.check, checkStyle]}>
        <Check size={CHECK} color={selFg} strokeWidth={3} />
      </Animated.View>
      {emoji ? (
        <Text style={styles.emoji} accessibilityElementsHidden importantForAccessibility="no">
          {emoji}
        </Text>
      ) : (
        renderIcon(icon, { size: 16, color: fg })
      )}
      <Text variant={size === 'sm' ? 'subhead' : 'bodyMedium'} style={{ color: fg }} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

export interface ToggleChipProps extends Omit<ChipProps, 'selected' | 'onPress'> {
  /** Valeur initiale (non contrôlé) ou valeur imposée (contrôlé). */
  defaultSelected?: boolean;
  selected?: boolean;
  onChange?: (selected: boolean) => void;
}

/** Puce à bascule : contrôlée si `selected` est fourni, sinon autonome. */
export function ToggleChip({ defaultSelected = false, selected, onChange, ...rest }: ToggleChipProps) {
  const [inner, setInner] = useState(defaultSelected);
  const isOn = selected ?? inner;
  return (
    <Chip
      {...rest}
      selected={isOn}
      onPress={() => {
        if (selected === undefined) setInner(!isOn);
        onChange?.(!isOn);
      }}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
  },
  check: { overflow: 'hidden', alignItems: 'flex-start', marginRight: -4 },
  emoji: { fontSize: 16, lineHeight: 20 },
});


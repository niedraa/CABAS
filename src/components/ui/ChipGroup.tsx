/**
 * Groupe de puces qui passe à la ligne. Sélection unique ou multiple.
 *
 * ```tsx
 * <ChipGroup mode="multi" options={DIETS} value={diets} onChange={setDiets} />
 * ```
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { haptics } from '@/lib/haptics';
import { spacing } from '@/theme';

import { Chip, type ChipProps } from './Chip';
import { type IconLike } from './icon';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  emoji?: string;
  icon?: IconLike;
  disabled?: boolean;
}

interface BaseProps<T extends string> {
  options: readonly ChipOption<T>[];
  size?: ChipProps['size'];
  tone?: ChipProps['tone'];
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export interface MultiChipGroupProps<T extends string> extends BaseProps<T> {
  mode: 'multi';
  value: readonly T[];
  onChange: (value: T[]) => void;
  /** Nombre maximum de choix (avertissement haptique au-delà). */
  max?: number;
}

export interface SingleChipGroupProps<T extends string> extends BaseProps<T> {
  mode: 'single';
  value: T | null;
  onChange: (value: T) => void;
}

export type ChipGroupProps<T extends string> = MultiChipGroupProps<T> | SingleChipGroupProps<T>;

export function ChipGroup<T extends string>(props: ChipGroupProps<T>) {
  const { options, size, tone, style, accessibilityLabel, testID } = props;

  const isSelected = (v: T) =>
    props.mode === 'multi' ? props.value.includes(v) : props.value === v;

  const toggle = (v: T) => {
    if (props.mode === 'single') {
      if (props.value !== v) props.onChange(v);
      return;
    }
    const cur = props.value;
    if (cur.includes(v)) {
      props.onChange(cur.filter((x) => x !== v));
    } else if (props.max !== undefined && cur.length >= props.max) {
      haptics.warning();
    } else {
      props.onChange([...cur, v]);
    }
  };

  return (
    <View
      testID={testID}
      accessibilityRole={props.mode === 'single' ? 'radiogroup' : 'list'}
      accessibilityLabel={accessibilityLabel}
      style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, style]}
    >
      {options.map((o) => (
        <Chip
          key={o.value}
          testID={testID ? `${testID}-${o.value}` : undefined}
          label={o.label}
          emoji={o.emoji}
          icon={o.icon}
          size={size}
          tone={tone}
          disabled={o.disabled}
          role={props.mode === 'single' ? 'radio' : 'checkbox'}
          selected={isSelected(o.value)}
          onPress={() => toggle(o.value)}
        />
      ))}
    </View>
  );
}

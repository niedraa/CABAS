/**
 * Choix de la date limite en un toucher : aucune, aujourd'hui, demain,
 * 3 jours, 1 semaine, 2 semaines (la date déjà enregistrée reste proposée).
 */
import React from 'react';
import { View } from 'react-native';

import { ChipGroup, Text, type ChipOption } from '@/components/ui';
import { useTheme } from '@/theme';

import { EXPIRY_PRESETS, expiryFromPreset, expiryInfo, presetForExpiry } from './pantryView';

export interface ExpiryPickerProps {
  value: string | undefined;
  onChange: (expiresAt: string | undefined) => void;
  today: string;
  label?: string;
  testID?: string;
}

export function ExpiryPicker({ value, onChange, today, label = 'À consommer avant', testID }: ExpiryPickerProps) {
  const t = useTheme();
  const key = presetForExpiry(value, today);
  const custom = key === 'custom' ? expiryInfo(value, today) : null;
  const options: ChipOption<string>[] = EXPIRY_PRESETS.map((p) => ({ value: p.key, label: p.label }));
  if (custom) options.push({ value: 'custom', label: custom.short });
  return (
    <View style={{ gap: t.spacing.sm }} testID={testID}>
      <Text variant="subhead">{label}</Text>
      <ChipGroup<string>
        mode="single"
        size="sm"
        options={options}
        value={key}
        onChange={(k) => {
          if (k !== 'custom') onChange(expiryFromPreset(k, today));
        }}
        accessibilityLabel={label}
        testID={testID ? `${testID}-chips` : undefined}
      />
    </View>
  );
}

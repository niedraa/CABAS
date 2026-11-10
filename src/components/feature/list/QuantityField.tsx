/**
 * Saisie d'une quantité en unité de base : « − 3 + » pour les pièces, champ
 * numérique (virgule acceptée) pour les grammes / millilitres, et sélecteur
 * d'unité facultatif. Partagé par la liste (édition) et le placard.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SegmentedControl, Stepper, Text, TextField } from '@/components/ui';
import type { BaseUnit } from '@/core';
import { formatNumberFr } from '@/core';
import { useTheme } from '@/theme';

import { parseAmount, UNIT_SHORT } from './listView';

export interface QuantityFieldProps {
  value: number;
  unit: BaseUnit;
  onChange: (value: number) => void;
  /** Unités proposées : sélecteur affiché s'il y en a plusieurs. */
  units?: readonly BaseUnit[];
  onUnitChange?: (unit: BaseUnit) => void;
  label?: string;
  /** Minimum du sélecteur de pièces (défaut 1). */
  min?: number;
  testID?: string;
}

const UNIT_OPTION_LABELS: Record<BaseUnit, string> = { piece: 'Pièces', g: 'Grammes', ml: 'Millilitres' };

export function QuantityField({ value, unit, onChange, units, onUnitChange, label = 'Quantité', min = 1, testID }: QuantityFieldProps) {
  const t = useTheme();
  const [draft, setDraft] = useState(() => (value > 0 ? formatNumberFr(value, 3) : ''));
  const [draftUnit, setDraftUnit] = useState(unit);
  // Changement d'unité : le brouillon repart de la valeur reçue.
  if (draftUnit !== unit) {
    setDraftUnit(unit);
    setDraft(value > 0 ? formatNumberFr(value, 3) : '');
  }
  const invalid = unit !== 'piece' && draft.trim() !== '' && parseAmount(draft) === null;

  return (
    <View style={{ gap: t.spacing.sm }} testID={testID}>
      <View style={styles.row}>
        <Text variant="subhead" style={styles.flex}>
          {label}
        </Text>
        {unit === 'piece' ? (
          <Stepper
            value={Math.max(min, Math.round(value))}
            onChange={onChange}
            min={min}
            max={99}
            accessibilityLabel={label}
            testID={testID ? `${testID}-stepper` : undefined}
          />
        ) : null}
      </View>
      {unit !== 'piece' ? (
        <TextField
          value={draft}
          onChangeText={(s) => {
            setDraft(s);
            const n = parseAmount(s);
            if (n !== null) onChange(n);
          }}
          keyboardType="decimal-pad"
          inputMode="decimal"
          accessibilityLabel={`${label} en ${UNIT_OPTION_LABELS[unit].toLowerCase()}`}
          error={invalid ? 'Indique un nombre, par exemple 250.' : null}
          right={
            <Text variant="headline" color="textSecondary">
              {UNIT_SHORT[unit]}
            </Text>
          }
          testID={testID ? `${testID}-input` : undefined}
        />
      ) : null}
      {units && units.length > 1 && onUnitChange ? (
        <SegmentedControl<BaseUnit>
          size="sm"
          options={units.map((u) => ({ value: u, label: UNIT_OPTION_LABELS[u] }))}
          value={unit}
          onChange={onUnitChange}
          accessibilityLabel="Unité"
          testID={testID ? `${testID}-unit` : undefined}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});

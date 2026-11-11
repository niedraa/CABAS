/**
 * Feuille « Ajouter une dépense » : montant (clavier décimal, « € »),
 * enseigne (tes magasins d'abord), jour (7 derniers jours), libellé
 * facultatif. Le bouton s'active dès que le montant est lisible.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Euro, Plus } from 'lucide-react-native';

import { Button, Chip, ChipGroup, Sheet, Stack, Text, TextField } from '@/components/ui';
import type { Store } from '@/core';
import { storeDisplayName } from '@/core';
import { useTheme } from '@/theme';

import { parseAmountInput, recentDayChoices } from './budgetView';

export interface AddSpendingInput {
  date: string;
  storeId: string;
  totalCents: number;
  label?: string;
}

export interface AddSpendingSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: AddSpendingInput) => void;
  /** Enseignes proposées (magasins préférés d'abord). */
  stores: readonly Store[];
  today: string;
  testID?: string;
}

export function AddSpendingSheet({ visible, onClose, onSubmit, stores, today, testID = 'add-spending' }: AddSpendingSheetProps) {
  const t = useTheme();
  const [amount, setAmount] = useState('');
  const [storeId, setStoreId] = useState<string | null>(stores[0]?.id ?? null);
  const [date, setDate] = useState(today);
  const [label, setLabel] = useState('');
  const [touched, setTouched] = useState(false);

  // Formulaire vierge à chaque ouverture (ajustement pendant le rendu, sans effet).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setAmount('');
      setStoreId(stores[0]?.id ?? null);
      setDate(today);
      setLabel('');
      setTouched(false);
    }
  }

  const parsed = parseAmountInput(amount);
  const days = useMemo(() => recentDayChoices(today, 7), [today]);
  const storeOptions = useMemo(() => stores.map((s) => ({ value: s.id, label: storeDisplayName(s) })), [stores]);
  const canSubmit = parsed.ok && !!storeId;

  const submit = () => {
    setTouched(true);
    if (!parsed.ok || !storeId) return;
    onSubmit({ date, storeId, totalCents: parsed.cents, label: label.trim() || undefined });
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Ajouter une dépense"
      subtitle="Un ticket de caisse, un marché : tout compte."
      scrollable
      testID={testID}
      footer={
        <Button
          label="Ajouter la dépense"
          leftIcon={Plus}
          size="lg"
          fullWidth
          disabled={!canSubmit}
          onPress={submit}
          testID={`${testID}-submit`}
        />
      }
    >
      <Stack gap="xl">
        <TextField
          label="Montant"
          value={amount}
          onChangeText={setAmount}
          onBlur={() => setTouched(true)}
          placeholder="42,50"
          keyboardType="decimal-pad"
          inputMode="decimal"
          leftIcon={Euro}
          error={touched || amount.length > 3 ? (parsed.ok ? null : parsed.message) : null}
          accessibilityLabel="Montant de la dépense, en euros"
          returnKeyType="done"
          onSubmitEditing={submit}
          testID={`${testID}-amount`}
        />
        <Stack gap="sm">
          <Text variant="subhead">Enseigne</Text>
          {/* Puces « md » (44 pt) : la cible tactile minimale. */}
          <ChipGroup
            mode="single"
            size="md"
            options={storeOptions}
            value={storeId}
            onChange={setStoreId}
            accessibilityLabel="Enseigne"
            testID={`${testID}-store`}
          />
        </Stack>
        <Stack gap="sm">
          <Text variant="subhead">Jour</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -t.spacing.xl }}
            contentContainerStyle={[styles.days, { paddingHorizontal: t.spacing.xl, gap: t.spacing.sm }]}
            accessibilityRole="radiogroup"
            accessibilityLabel="Jour de la dépense"
          >
            {days.map((d) => (
              <Chip
                key={d.value}
                size="md"
                role="radio"
                label={d.label}
                selected={d.value === date}
                onPress={() => setDate(d.value)}
                testID={`${testID}-day-${d.value}`}
              />
            ))}
          </ScrollView>
        </Stack>
        <TextField
          label="Libellé (facultatif)"
          value={label}
          onChangeText={setLabel}
          placeholder="Marché du samedi"
          maxLength={60}
          returnKeyType="done"
          accessibilityLabel="Libellé de la dépense"
          testID={`${testID}-label`}
        />
      </Stack>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  days: { flexDirection: 'row' },
});

/**
 * Feuille d'édition d'un article de la liste : libellé, quantité (unité de
 * base), rayon, recettes qui l'utilisent, suppression.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { Trash2 } from 'lucide-react-native';

import { Button, ChipGroup, Sheet, Stack, Text, TextField } from '@/components/ui';
import { AISLE_LABELS, AISLES, parseDecimalFr, unitLabel, type Aisle, type ShoppingListItem } from '@/core';
import { useTheme } from '@/theme';

export interface ItemEditSheetProps {
  item: ShoppingListItem | null;
  /** Titres des recettes qui utilisent l'article. */
  recipeTitles: string[];
  onClose: () => void;
  onSave: (patch: { label: string; quantity: number; aisle: Aisle }) => void;
  onRemove: () => void;
}

function formatInput(n: number): string {
  if (!Number.isFinite(n)) return '';
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

export function ItemEditSheet({ item, recipeTitles, onClose, onSave, onRemove }: ItemEditSheetProps) {
  return (
    <Sheet
      visible={!!item}
      onClose={onClose}
      title="Modifier l’article"
      subtitle={item?.source === 'plan' ? 'Calculé à partir de tes repas' : 'Ajouté à la main'}
      scrollable
      testID="item-sheet"
    >
      {/* Formulaire remonté pour chaque article : état initial = l'article. */}
      {item ? <ItemForm key={item.id} item={item} recipeTitles={recipeTitles} onSave={onSave} onRemove={onRemove} /> : null}
    </Sheet>
  );
}

function ItemForm({
  item,
  recipeTitles,
  onSave,
  onRemove,
}: Omit<ItemEditSheetProps, 'item' | 'onClose'> & { item: ShoppingListItem }) {
  const t = useTheme();
  const [label, setLabel] = useState(item.label);
  const [qty, setQty] = useState(formatInput(item.quantity));
  const [aisle, setAisle] = useState<Aisle>(item.aisle);

  const parsed = parseDecimalFr(qty);
  const qtyError = qty.trim() !== '' && (parsed === null || parsed <= 0) ? 'Indique une quantité positive.' : null;
  const canSave = label.trim().length > 0 && !qtyError;

  return (
    <Stack gap="lg">
      <TextField label="Article" value={label} onChangeText={setLabel} maxLength={80} returnKeyType="done" testID="item-sheet-label" />
      <TextField
        label="Quantité"
        value={qty}
        onChangeText={setQty}
        keyboardType="decimal-pad"
        error={qtyError}
        right={
          <Text variant="callout" color="textSecondary">
            {unitLabel(item.unit, parsed ?? item.quantity)}
          </Text>
        }
        testID="item-sheet-qty"
      />
      <View style={{ gap: t.spacing.sm }}>
        <Text variant="subhead">Rayon</Text>
        <ChipGroup<Aisle>
          mode="single"
          value={aisle}
          onChange={setAisle}
          options={AISLES.map((a) => ({ value: a, label: AISLE_LABELS[a] }))}
          size="sm"
          accessibilityLabel="Rayon de l’article"
        />
      </View>
      {recipeTitles.length > 0 ? (
        <View style={{ gap: t.spacing.xs }}>
          <Text variant="subhead">Pour {recipeTitles.length > 1 ? 'les recettes' : 'la recette'}</Text>
          {recipeTitles.map((title) => (
            <Text key={title} variant="footnote" color="textSecondary">
              • {title}
            </Text>
          ))}
        </View>
      ) : null}
      <Stack gap="sm">
        <Button
          label="Enregistrer"
          fullWidth
          disabled={!canSave}
          onPress={() => onSave({ label: label.trim(), quantity: parsed ?? item.quantity, aisle })}
          testID="item-sheet-save"
        />
        <Button label="Retirer de la liste" variant="ghost" leftIcon={Trash2} fullWidth onPress={onRemove} testID="item-sheet-remove" />
      </Stack>
    </Stack>
  );
}

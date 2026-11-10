/**
 * Feuille d'édition d'un article : libellé, quantité (et unité pour un ajout
 * manuel), rayon ; retrait de la liste.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Info, Trash2 } from 'lucide-react-native';

import { Button, ChipGroup, Divider, ListRow, Sheet, Text, TextField } from '@/components/ui';
import type { Aisle, BaseUnit, Recipe, ShoppingListItem } from '@/core';
import type { ListItemPatch } from '@/stores';
import { useTheme } from '@/theme';

import { AISLE_OPTIONS, recipeSources } from './listView';
import { QuantityField } from './QuantityField';
import { useStickyValue } from './useStickyValue';

export interface ListItemSheetProps {
  visible: boolean;
  item: ShoppingListItem | null;
  /** Recettes du catalogue (recettes d'origine en sous-titre). */
  recipesById?: Readonly<Record<string, Pick<Recipe, 'title'>>>;
  onClose: () => void;
  onSave: (patch: ListItemPatch) => void;
  onRemove: () => void;
}

const MANUAL_UNITS: readonly BaseUnit[] = ['piece', 'g', 'ml'];

export function ListItemSheet({ visible, item: current, recipesById = {}, onClose, onSave, onRemove }: ListItemSheetProps) {
  const item = useStickyValue(current);
  const sources = item ? recipeSources(item.recipeIds, recipesById)?.full : null;
  return (
    <Sheet
      visible={visible && !!current}
      onClose={onClose}
      title="Modifier l’article"
      subtitle={item ? (item.source === 'manual' ? 'Ajouté par toi' : (sources ?? 'Article de ton menu')) : undefined}
      scrollable
      testID="list-item-sheet"
    >
      {item ? <Editor key={item.id} item={item} onSave={onSave} onRemove={onRemove} /> : null}
    </Sheet>
  );
}

function Editor({ item, onSave, onRemove }: { item: ShoppingListItem; onSave: (patch: ListItemPatch) => void; onRemove: () => void }) {
  const t = useTheme();
  const c = t.colors;
  const [label, setLabel] = useState(item.label);
  const [quantity, setQuantity] = useState(item.quantity);
  const [unit, setUnit] = useState<BaseUnit>(item.unit);
  const [aisle, setAisle] = useState<Aisle>(item.aisle);
  const manual = item.source === 'manual';
  const valid = label.trim().length > 0 && quantity > 0;

  const save = () => {
    if (!valid) return;
    const patch: ListItemPatch = {};
    if (label.trim() !== item.label) patch.label = label.trim();
    if (quantity !== item.quantity) patch.quantity = quantity;
    if (unit !== item.unit) patch.unit = unit;
    if (aisle !== item.aisle) patch.aisle = aisle;
    onSave(patch);
  };

  return (
    <View style={{ gap: t.spacing.xl }}>
      <TextField
        label="Article"
        value={label}
        onChangeText={setLabel}
        autoCapitalize="sentences"
        returnKeyType="done"
        error={label.trim() ? null : 'Donne un nom à cet article.'}
        testID="list-item-label"
      />
      <View style={{ gap: t.spacing.sm }}>
        <QuantityField
          value={quantity}
          unit={unit}
          onChange={setQuantity}
          units={manual ? MANUAL_UNITS : undefined}
          onUnitChange={(u) => {
            setUnit(u);
            if (u === 'piece') setQuantity(Math.max(1, Math.round(quantity)));
          }}
          testID="list-item-quantity"
        />
        {!manual ? (
          <View style={[styles.hint, { gap: t.spacing.xs }]}>
            <Info size={t.iconSize.xs} color={c.textTertiary} />
            <Text variant="footnote" color="textSecondary" style={styles.flex}>
              Article de ton menu : Cabas le recalcule si tes repas changent.
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ gap: t.spacing.sm }}>
        <Text variant="subhead">Rayon</Text>
        <ChipGroup<Aisle>
          mode="single"
          size="sm"
          options={AISLE_OPTIONS}
          value={aisle}
          onChange={setAisle}
          accessibilityLabel="Rayon"
          testID="list-item-aisle"
        />
      </View>
      <View style={{ gap: t.spacing.xs }}>
        <Button label="Enregistrer" fullWidth size="lg" disabled={!valid} onPress={save} testID="list-item-save" />
        <Divider spacing={t.spacing.xs} />
        <ListRow icon={Trash2} title="Retirer de la liste" destructive onPress={onRemove} testID="list-item-remove" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});

/**
 * Feuille d'un article du placard : quantité restante, date limite,
 * « Tout utilisé » et retrait.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { CircleCheck, Trash2 } from 'lucide-react-native';

import { QuantityField, useStickyValue } from '@/components/feature/list';
import { Button, Divider, ListRow, Sheet } from '@/components/ui';
import type { PantryItem } from '@/core';
import { useTheme } from '@/theme';

import { ExpiryPicker } from './ExpiryPicker';
import { expiryInfo } from './pantryView';

export interface PantryEdit {
  quantity: number;
  expiresAt: string | undefined;
}

export interface PantryItemSheetProps {
  visible: boolean;
  item: PantryItem | null;
  today: string;
  onClose: () => void;
  onSave: (edit: PantryEdit) => void;
  onUseAll: () => void;
  onRemove: () => void;
}

export function PantryItemSheet({ visible, item: current, today, onClose, onSave, onUseAll, onRemove }: PantryItemSheetProps) {
  const item = useStickyValue(current);
  const expiry = item ? expiryInfo(item.expiresAt, today) : null;
  return (
    <Sheet
      visible={visible && !!current}
      onClose={onClose}
      title={item?.label}
      subtitle={expiry ? expiry.label : 'Sans date limite'}
      scrollable
      testID="pantry-item-sheet"
    >
      {item ? <Editor key={item.id} item={item} today={today} onSave={onSave} onUseAll={onUseAll} onRemove={onRemove} /> : null}
    </Sheet>
  );
}

function Editor({
  item,
  today,
  onSave,
  onUseAll,
  onRemove,
}: {
  item: PantryItem;
  today: string;
  onSave: (edit: PantryEdit) => void;
  onUseAll: () => void;
  onRemove: () => void;
}) {
  const t = useTheme();
  const [quantity, setQuantity] = useState(item.quantity);
  const [expiresAt, setExpiresAt] = useState<string | undefined>(item.expiresAt?.slice(0, 10));
  const valid = quantity > 0;
  return (
    <View style={{ gap: t.spacing.xl }}>
      <QuantityField value={quantity} unit={item.unit} onChange={setQuantity} label="Il en reste" testID="pantry-item-quantity" />
      <ExpiryPicker value={expiresAt} onChange={setExpiresAt} today={today} testID="pantry-item-expiry" />
      <View style={{ gap: t.spacing.xs }}>
        <Button label="Enregistrer" size="lg" fullWidth disabled={!valid} onPress={() => onSave({ quantity, expiresAt })} testID="pantry-item-save" />
        <Divider spacing={t.spacing.xs} />
        <ListRow icon={CircleCheck} title="J’ai tout utilisé" subtitle="Zéro gaspi, bravo !" onPress={onUseAll} testID="pantry-item-use-all" />
        <Divider inset={52} />
        <ListRow icon={Trash2} title="Retirer du placard" destructive onPress={onRemove} testID="pantry-item-remove" />
      </View>
    </View>
  );
}

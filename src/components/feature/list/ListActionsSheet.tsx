/**
 * Actions de la liste (« … ») : partager / copier en texte, tout décocher,
 * vider les articles cochés, ouvrir le placard.
 */
import React from 'react';
import { View } from 'react-native';
import { Archive, Copy, Eraser, RotateCcw, Share2 } from 'lucide-react-native';

import { Divider, ListRow, Sheet } from '@/components/ui';
import { useTheme } from '@/theme';

import { countFr } from './listView';

export interface ListActionsSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Articles cochés (actions « décocher » / « vider » masquées à 0). */
  checkedCount: number;
  totalCount: number;
  onShare: () => void;
  onCopy: () => void;
  onUncheckAll: () => void;
  onClearChecked: () => void;
  onOpenPantry: () => void;
}

export function ListActionsSheet({
  visible,
  onClose,
  checkedCount,
  totalCount,
  onShare,
  onCopy,
  onUncheckAll,
  onClearChecked,
  onOpenPantry,
}: ListActionsSheetProps) {
  const t = useTheme();
  const none = checkedCount === 0;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Ma liste"
      subtitle={`${countFr(totalCount, 'article')} · ${none ? 'rien de coché' : countFr(checkedCount, 'coché')}`}
      testID="list-actions"
    >
      <View style={{ gap: t.spacing.xxs }}>
        {totalCount > 0 ? (
          <>
            <ListRow icon={Share2} title="Partager la liste" subtitle="Par message, à qui fait les courses." onPress={onShare} testID="list-actions-share" />
            <Divider inset={52} />
            <ListRow icon={Copy} title="Copier en texte" onPress={onCopy} testID="list-actions-copy" />
            <Divider inset={52} />
          </>
        ) : null}
        {/* Actions sur les articles cochés : seulement s'il y en a. */}
        {none ? null : (
          <>
            <ListRow icon={RotateCcw} title="Tout décocher" onPress={onUncheckAll} testID="list-actions-uncheck" />
            <Divider inset={52} />
            <ListRow
              icon={Eraser}
              title="Vider les articles cochés"
              subtitle={`${countFr(checkedCount, 'article')} quitte${checkedCount > 1 ? 'nt' : ''} la liste.`}
              onPress={onClearChecked}
              destructive
              testID="list-actions-clear"
            />
            <Divider inset={52} />
          </>
        )}
        <ListRow icon={Archive} title="Mon placard" subtitle="Ce que tu as déjà, retiré de ta liste." chevron onPress={onOpenPantry} testID="list-actions-pantry" />
      </View>
    </Sheet>
  );
}

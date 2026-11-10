/**
 * Ligne d'un article du placard : vignette du rayon, quantité, date limite
 * lisible (pastille colorée selon l'urgence), bouton « Utilisé ».
 * Toucher → feuille d'édition ; glisser vers la gauche → retirer.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Check, Clock } from 'lucide-react-native';

import { AISLE_EMOJI, SwipeToRemove } from '@/components/feature/list';
import { Badge, PressableScale, Text, type BadgeTone } from '@/components/ui';
import type { Aisle, PantryItem } from '@/core';
import { formatQuantity } from '@/core';
import { aisleColors, useTheme, withAlpha } from '@/theme';

import { expiryInfo, type ExpiryTone } from './pantryView';

export interface PantryItemRowProps {
  item: PantryItem;
  aisle: Aisle;
  today: string;
  onPress: () => void;
  onUseAll: () => void;
  onRemove: () => void;
  divider?: boolean;
  testID?: string;
}

const EXPIRY_BADGE: Record<ExpiryTone, BadgeTone> = { danger: 'danger', warning: 'accent', neutral: 'neutral' };

export function PantryItemRow({ item, aisle, today, onPress, onUseAll, onRemove, divider, testID }: PantryItemRowProps) {
  const t = useTheme();
  const c = t.colors;
  const expiry = expiryInfo(item.expiresAt, today);
  const qty = formatQuantity(item.quantity, item.unit);
  const qtyLabel = item.unit === 'piece' ? `× ${qty}` : qty;

  return (
    <SwipeToRemove onRemove={onRemove}>
      <View
        style={[
          styles.row,
          {
            backgroundColor: c.surface,
            paddingLeft: t.spacing.md,
            paddingRight: t.spacing.md,
            gap: t.spacing.sm,
            borderTopColor: c.border,
            borderTopWidth: divider ? StyleSheet.hairlineWidth * 2 : 0,
          },
        ]}
      >
        <PressableScale
          onPress={onPress}
          scaleTo={0.985}
          accessibilityLabel={[item.label, qty, expiry?.label].filter(Boolean).join(', ')}
          accessibilityHint="Modifier la quantité ou la date limite."
          accessibilityActions={[
            { name: 'activate', label: 'Modifier' },
            { name: 'useAll', label: 'Tout utilisé' },
            { name: 'remove', label: 'Retirer du placard' },
          ]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'useAll') onUseAll();
            else if (e.nativeEvent.actionName === 'remove') onRemove();
            else onPress();
          }}
          style={[styles.main, { gap: t.spacing.md, paddingVertical: t.spacing.md, minHeight: t.layout.minTouchTarget + t.spacing.md }]}
          testID={testID}
        >
          <View
            style={[
              styles.thumb,
              { borderRadius: t.radius.md, backgroundColor: withAlpha(aisleColors[aisle] ?? aisleColors.autre, t.scheme === 'dark' ? 0.3 : 0.2) },
            ]}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            <Text style={styles.emoji} allowFontScaling={false}>
              {AISLE_EMOJI[aisle]}
            </Text>
          </View>
          <View style={[styles.texts, { gap: t.spacing.xxs }]}>
            <Text variant="bodyMedium" numberOfLines={2}>
              {item.label}
            </Text>
            <View style={[styles.meta, { gap: t.spacing.sm }]}>
              <Text variant="subhead" color="textSecondary" tabular>
                {qtyLabel}
              </Text>
              {expiry ? <Badge size="sm" icon={Clock} label={expiry.short} tone={EXPIRY_BADGE[expiry.tone]} accessibilityLabel={expiry.label} /> : null}
            </View>
          </View>
        </PressableScale>
        <PressableScale
          onPress={onUseAll}
          haptic="success"
          scaleTo={0.92}
          accessibilityLabel={`Tout utilisé : ${item.label}`}
          hitSlop={(t.layout.minTouchTarget - t.controlHeight.sm) / 2}
          style={[
            styles.use,
            {
              height: t.controlHeight.sm,
              borderRadius: t.radius.pill,
              paddingHorizontal: t.spacing.md,
              gap: t.spacing.xs,
              backgroundColor: c.primarySoft,
            },
          ]}
          testID={testID ? `${testID}-use` : undefined}
        >
          <Check size={t.iconSize.xs} color={t.scheme === 'dark' ? c.text : c.primary} strokeWidth={2.6} />
          <Text variant="caption" style={{ color: t.scheme === 'dark' ? c.text : c.primary }}>
            Utilisé
          </Text>
        </PressableScale>
      </View>
    </SwipeToRemove>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  thumb: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 22, lineHeight: 28 },
  texts: { flex: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  use: { flexDirection: 'row', alignItems: 'center' },
});

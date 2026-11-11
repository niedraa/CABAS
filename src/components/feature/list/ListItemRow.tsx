/**
 * Ligne d'un article de la liste de courses.
 *
 * - toucher la ligne → coche / décoche (case au ressort, libellé barré qui
 *   passe en couleur secondaire — contraste AA conservé —, vibration « succès ») ;
 * - appui long ou crayon → feuille d'édition ;
 * - glisser vers la gauche → retirer (annulable) ;
 * - accessibilité : une seule case à cocher lue en entier, actions
 *   « Modifier » et « Retirer » pour le lecteur d'écran.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Archive, Check, Pencil } from 'lucide-react-native';

import { Badge, IconButton, PressableScale, Text } from '@/components/ui';
import type { ShoppingListItem } from '@/core';
import { useTheme } from '@/theme';

import { itemA11yLabel, type ItemView } from './listView';
import { SwipeToRemove } from './SwipeToRemove';

export interface ListItemRowProps {
  item: ShoppingListItem;
  view: ItemView;
  onToggle: () => void;
  onEdit: () => void;
  onRemove: () => void;
  /** Filet de séparation en haut (pas pour la première ligne d'un rayon). */
  divider?: boolean;
  testID?: string;
}

export function ListItemRow({ item, view, onToggle, onEdit, onRemove, divider, testID }: ListItemRowProps) {
  const t = useTheme();
  const c = t.colors;
  const checked = item.checked;
  const p = useDerivedValue<number>(() => withSpring(checked ? 1 : 0, t.motion.spring), [checked]);
  // Coché : barré + couleur secondaire, sans voile d'opacité (la ligne reste
  // touchable pour décocher : son texte doit rester lisible, contraste AA).
  const labelStyle = useAnimatedStyle(() => ({ color: interpolateColor(p.get(), [0, 1], [c.text, c.textSecondary]) }));
  const meta = [view.buy, view.sources].filter(Boolean).join(' · ');
  const a11y = itemA11yLabel(item, view);

  return (
    <SwipeToRemove onRemove={onRemove}>
      <View
        style={[
          styles.row,
          {
            backgroundColor: c.surface,
            paddingLeft: t.spacing.md,
            paddingRight: t.spacing.xs,
            borderTopColor: c.border,
            borderTopWidth: divider ? StyleSheet.hairlineWidth * 2 : 0,
          },
        ]}
      >
        <PressableScale
          onPress={onToggle}
          onLongPress={onEdit}
          delayLongPress={380}
          haptic={checked ? 'select' : 'success'}
          scaleTo={0.985}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          aria-checked={checked}
          accessibilityLabel={a11y}
          accessibilityHint={checked ? 'Touche pour remettre dans la liste.' : 'Touche pour cocher.'}
          accessibilityActions={[
            { name: 'activate', label: checked ? 'Décocher' : 'Cocher' },
            { name: 'edit', label: 'Modifier' },
            { name: 'remove', label: 'Retirer de la liste' },
          ]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'edit') onEdit();
            else if (e.nativeEvent.actionName === 'remove') onRemove();
            else onToggle();
          }}
          style={[styles.main, { minHeight: t.layout.minTouchTarget + t.spacing.md, paddingVertical: t.spacing.md, gap: t.spacing.md }]}
          testID={testID}
        >
          {/* Case purement visuelle : la ligne entière est la cible. */}
          <CheckMark checked={checked} progress={p} />
          <View style={styles.texts}>
            <View style={[styles.titleRow, { gap: t.spacing.sm }]}>
              <Animated.Text
                numberOfLines={2}
                maxFontSizeMultiplier={1.6}
                style={[t.typography.bodyMedium, styles.label, checked && styles.strike, labelStyle]}
              >
                {item.label}
              </Animated.Text>
              {view.quantity ? (
                <Text variant="subhead" tabular color="textSecondary" style={styles.qty}>
                  {view.quantity}
                </Text>
              ) : null}
            </View>
            {meta ? (
              <Text variant="footnote" color="textSecondary" numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
            {view.pantry ? (
              <Badge
                size="sm"
                icon={Archive}
                label={view.pantry.label}
                tone={view.pantry.tone === 'success' ? 'success' : 'neutral'}
                style={[styles.badge, { marginTop: t.spacing.xxs }]}
              />
            ) : item.note ? (
              <Text variant="footnote" color="textSecondary" numberOfLines={2}>
                {item.note}
              </Text>
            ) : null}
          </View>
        </PressableScale>
        <IconButton
          icon={Pencil}
          size="sm"
          color={c.textTertiary}
          accessibilityLabel={`Modifier : ${item.label}`}
          onPress={onEdit}
          testID={testID ? `${testID}-edit` : undefined}
        />
      </View>
    </SwipeToRemove>
  );
}

const CHECK_SIZE = 26;

/** Case cochée au ressort, coche dessinée de gauche à droite (comme `Checkbox`). */
function CheckMark({ checked, progress }: { checked: boolean; progress: Readonly<SharedValue<number>> }) {
  const t = useTheme();
  const c = t.colors;
  const fill = useDerivedValue(() => withSpring(checked ? 1 : 0, t.motion.springBouncy), [checked]);
  const draw = useDerivedValue(
    () => (checked ? withDelay(60, withTiming(1, { duration: t.motion.duration.fast })) : withTiming(0, { duration: t.motion.duration.instant })),
    [checked],
  );
  const fillStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, fill.get() * 1.4),
    transform: [{ scale: 0.5 + 0.5 * fill.get() }],
  }));
  const boxStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(progress.get(), [0, 1], [c.borderStrong, c.success]),
  }));
  const tickStyle = useAnimatedStyle(() => ({ width: CHECK_SIZE * draw.get() }));
  return (
    <Animated.View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.box, { borderRadius: CHECK_SIZE * 0.32 }, boxStyle]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.success, borderRadius: CHECK_SIZE * 0.28 }, fillStyle]} />
      <Animated.View style={[styles.tickMask, tickStyle]}>
        <View style={styles.tick}>
          <Check size={CHECK_SIZE * 0.68} color={t.scheme === 'dark' ? c.background : c.surface} strokeWidth={3.2} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { width: CHECK_SIZE, height: CHECK_SIZE, borderWidth: 2, overflow: 'hidden', justifyContent: 'center' },
  tickMask: { position: 'absolute', left: -2, top: -2, height: CHECK_SIZE, overflow: 'hidden' },
  tick: { width: CHECK_SIZE, height: CHECK_SIZE, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  texts: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  label: { flexShrink: 1 },
  strike: { textDecorationLine: 'line-through' },
  qty: { flexShrink: 0 },
  badge: { alignSelf: 'flex-start' },
});

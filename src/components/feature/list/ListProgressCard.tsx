/**
 * Bandeau héros de la liste : anneau d'avancement (cochés / total), articles
 * restants, et les deux suites logiques : comparer les prix, ouvrir le placard.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Archive, Scale } from 'lucide-react-native';

import { CircleDecor } from '@/components/brand';
import { AnimatedNumber, Button, ProgressRing, Text } from '@/components/ui';
import { useTheme, withAlpha } from '@/theme';

import { HeroButton } from './HeroButton';
import { remainingHeadline } from './listView';

export interface ListProgressCardProps {
  done: number;
  total: number;
  subtitle: string;
  onComparePrices: () => void;
  onOpenPantry: () => void;
  testID?: string;
}

export function ListProgressCard({ done, total, subtitle, onComparePrices, onOpenPantry, testID }: ListProgressCardProps) {
  const t = useTheme();
  const c = t.colors;
  const remaining = Math.max(0, total - done);
  const ratio = total > 0 ? done / total : 0;
  const onHero = { color: c.heroText };
  const soft = { color: c.heroText, opacity: 0.8 };

  return (
    <View testID={testID} style={[styles.card, { backgroundColor: c.hero, borderRadius: t.radius.xl, padding: t.spacing.xl }]}>
      <CircleDecor tone="hero" placement="topRight" scale={0.42} />
      <View style={[styles.row, { gap: t.spacing.lg }]}>
        <ProgressRing
          progress={ratio}
          size={76}
          strokeWidth={8}
          tone="accent"
          trackColor={withAlpha(c.heroText, 0.16)}
          accessibilityLabel={`${done} article${done > 1 ? 's' : ''} coché${done > 1 ? 's' : ''} sur ${total}`}
          testID={testID ? `${testID}-ring` : undefined}
        >
          <View style={styles.ringInner}>
            <AnimatedNumber value={done} variant="title3" style={onHero} />
            <Text variant="caption" style={soft} tabular>
              /{total}
            </Text>
          </View>
        </ProgressRing>
        <View style={styles.flex}>
          <Text variant="overline" style={soft}>
            Dans le cabas
          </Text>
          <Text variant="title3" style={onHero} accessibilityRole="header" testID={testID ? `${testID}-title` : undefined}>
            {remainingHeadline(remaining)}
          </Text>
          <Text variant="footnote" style={soft}>
            {subtitle}
          </Text>
        </View>
      </View>
      <View style={[styles.actions, { gap: t.spacing.sm, marginTop: t.spacing.lg }]}>
        <Button
          label="Comparer les prix"
          size="sm"
          leftIcon={Scale}
          onPress={onComparePrices}
          hitSlop={(t.layout.minTouchTarget - t.controlHeight.sm) / 2}
          style={styles.flex}
          testID={testID ? `${testID}-compare` : undefined}
        />
        <HeroButton
          label="Placard"
          icon={Archive}
          size="sm"
          accessibilityLabel="Ouvrir mon placard"
          onPress={onOpenPantry}
          testID={testID ? `${testID}-pantry` : undefined}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  ringInner: { flexDirection: 'row', alignItems: 'baseline' },
  actions: { flexDirection: 'row', alignItems: 'center' },
});

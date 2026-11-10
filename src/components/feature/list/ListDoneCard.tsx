/**
 * Tout est coché : moment joyeux (célébration si on vient de finir), puis
 * les gestes utiles d'après-courses : ranger le surplus au placard, vider
 * les articles cochés.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Archive, CircleCheck, Eraser } from 'lucide-react-native';

import { BasketMark, Celebration, CircleDecor } from '@/components/brand';
import { Button, Text } from '@/components/ui';
import { boxShadow, useTheme } from '@/theme';

import { countFr } from './listView';

export interface ListDoneCardProps {
  total: number;
  /** > 0 : on vient de tout cocher, la célébration se joue (valeur = clé de rejeu). */
  celebrateKey: number;
  /** Surplus déjà rangé au placard. */
  stored: boolean;
  onStoreLeftovers: () => void;
  onOpenPantry: () => void;
  onClearChecked: () => void;
  testID?: string;
}

const SIZE = 150;

export function ListDoneCard({ total, celebrateKey, stored, onStoreLeftovers, onOpenPantry, onClearChecked, testID }: ListDoneCardProps) {
  const t = useTheme();
  const c = t.colors;
  const core = Math.round(SIZE * 0.46);
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        {
          backgroundColor: c.surface,
          borderColor: c.border,
          borderRadius: t.radius.xl,
          padding: t.spacing.xl,
          gap: t.spacing.lg,
          boxShadow: boxShadow('md', c.shadow),
        },
      ]}
    >
      <CircleDecor tone="paper" placement="topRight" scale={0.5} />
      <View style={[styles.center, { gap: t.spacing.sm }]}>
        {celebrateKey > 0 ? (
          <Celebration size={SIZE} playKey={celebrateKey} accessibilityLabel="Bravo, tout est coché" />
        ) : (
          <View style={[styles.center, { width: SIZE, height: core + t.spacing.xxl }]}>
            <View
              style={[styles.center, { width: core, height: core, borderRadius: t.radius.pill, backgroundColor: c.hero }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <BasketMark size={Math.round(core * 0.62)} variant="reversed" />
            </View>
          </View>
        )}
        <Text variant="title2" align="center" accessibilityRole="header" testID={testID ? `${testID}-title` : undefined}>
          Tout est dans le cabas !
        </Text>
        <Text variant="callout" color="textSecondary" align="center" style={styles.body}>
          {stored
            ? 'Le surplus est rangé : Cabas te proposera de quoi le cuisiner.'
            : `${countFr(total, 'article')}, bravo. Range le surplus au placard : rien ne se perd.`}
        </Text>
      </View>
      <View style={{ gap: t.spacing.sm }}>
        {stored ? (
          <Animated.View entering={FadeIn.duration(t.motion.duration.base)} style={{ gap: t.spacing.sm }}>
            <View style={[styles.storedRow, { gap: t.spacing.xs }]} accessibilityLiveRegion="polite">
              <CircleCheck size={t.iconSize.sm} color={c.success} strokeWidth={2.4} />
              <Text variant="subhead" color="success">
                Surplus rangé au placard
              </Text>
            </View>
            <Button
              label="Voir mon placard"
              variant="secondary"
              leftIcon={Archive}
              fullWidth
              onPress={onOpenPantry}
              testID={testID ? `${testID}-pantry` : undefined}
            />
          </Animated.View>
        ) : (
          <Button
            label="Ranger le reste au placard"
            leftIcon={Archive}
            fullWidth
            onPress={onStoreLeftovers}
            testID={testID ? `${testID}-store` : undefined}
          />
        )}
        <Button
          label="Vider les articles cochés"
          variant="tonal"
          leftIcon={Eraser}
          fullWidth
          onPress={onClearChecked}
          testID={testID ? `${testID}-clear` : undefined}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth * 2 },
  center: { alignItems: 'center', justifyContent: 'center' },
  body: { maxWidth: 320 },
  storedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});

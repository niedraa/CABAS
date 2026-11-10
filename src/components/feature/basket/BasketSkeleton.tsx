/**
 * Squelettes de l'onglet « Prix » pendant la comparaison : ticket, magasin
 * et lignes d'articles, avec le message « On compare… ».
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Skeleton, Text } from '@/components/ui';
import { useTheme } from '@/theme';

export function ComparisonRowSkeleton() {
  const t = useTheme();
  return (
    <View style={[styles.row, { gap: t.spacing.md, paddingVertical: t.spacing.md }]}>
      <Skeleton circle height={t.controlHeight.sm - t.spacing.sm} />
      <View style={[styles.flex, { gap: t.spacing.xs }]}>
        <Skeleton width="55%" height={t.spacing.lg} />
        <Skeleton width="80%" height={t.spacing.md} />
      </View>
      <Skeleton width={t.spacing.huge + t.spacing.sm} height={t.spacing.lg} />
    </View>
  );
}

export function BasketSkeleton({ message = 'On compare les prix de tes enseignes…' }: { message?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.lg }} accessible accessibilityLabel={message} accessibilityState={{ busy: true }} testID="basket-skeleton">
      <Animated.View entering={FadeIn.duration(t.motion.duration.base)}>
        <Text variant="subhead" color="textSecondary" align="center">
          {message}
        </Text>
      </Animated.View>
      <Skeleton height={t.spacing.huge * 4} radius={t.radius.lg} />
      <Skeleton height={t.spacing.huge * 3} radius={t.radius.xl} />
      <View style={[styles.card, { backgroundColor: t.colors.surface, borderRadius: t.radius.lg, paddingHorizontal: t.spacing.lg }]}>
        <ComparisonRowSkeleton />
        <ComparisonRowSkeleton />
        <ComparisonRowSkeleton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  card: {},
});

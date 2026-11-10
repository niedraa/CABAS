/**
 * Total des économies réalisées grâce au comparateur (chiffres d'abord).
 * Sans économie encore : une promesse simple, pas un zéro triste.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { PiggyBank } from 'lucide-react-native';

import { AnimatedPrice, Card, Text } from '@/components/ui';
import { formatPriceForA11y } from '@/lib/a11y';
import { useTheme } from '@/theme';

export interface SavingsCardProps {
  savingsCents: number;
  /** Nombre de commandes passées par Cabas. */
  orders: number;
  testID?: string;
}

export function SavingsCard({ savingsCents, orders, testID = 'savings-card' }: SavingsCardProps) {
  const t = useTheme();
  const c = t.colors;
  const has = savingsCents > 0;
  return (
    <Card
      variant="plain"
      padding="lg"
      radius="xl"
      accessible
      accessibilityLabel={
        has
          ? `${formatPriceForA11y(savingsCents)} économisés grâce à Cabas${orders > 0 ? `, sur ${orders} commande${orders > 1 ? 's' : ''}` : ''}`
          : 'Tes économies apparaîtront ici dès ta première commande.'
      }
      testID={testID}
    >
      <View style={[styles.row, { gap: t.spacing.md }]}>
        <View style={[styles.icon, { backgroundColor: c.dangerSoft, borderRadius: t.radius.md }]}>
          <PiggyBank size={t.iconSize.lg} color={c.savings} strokeWidth={2.2} />
        </View>
        <View style={styles.flex}>
          {has ? (
            <>
              <AnimatedPrice cents={savingsCents} variant="title2" color="savings" testID={`${testID}-amount`} />
              <Text variant="footnote" color="textSecondary">
                économisés grâce au comparateur{orders > 0 ? ` · ${orders} commande${orders > 1 ? 's' : ''}` : ''}
              </Text>
            </>
          ) : (
            <>
              <Text variant="headline">Tes économies, bientôt ici</Text>
              <Text variant="footnote" color="textSecondary">
                Dès ta première commande, Cabas chiffre ce que tu as gagné.
              </Text>
            </>
          )}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});

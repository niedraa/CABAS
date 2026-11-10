/**
 * Comment passer la commande, selon l'offre et l'étape :
 *  - Premium : « commande en un clic » (panier prêt, ouverture directe) ;
 *  - gratuit : 2 étapes (copier la liste, ouvrir le site) + invitation Premium sobre ;
 *  - après ouverture : « De retour ? » (rouvrir, copier) avant la confirmation.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Check, ClipboardCopy, Crown, ExternalLink } from 'lucide-react-native';

import { Badge, Button, InfoBanner, Text } from '@/components/ui';
import { FEATURE_COPY } from '@/core';
import { useTheme } from '@/theme';

import type { OrderStage } from './orderView';

export interface OrderActionsProps {
  stage: Exclude<OrderStage, 'confirmed'>;
  /** Commande en un clic (Premium). */
  oneClick: boolean;
  storeName: string;
  copied: boolean;
  busy?: 'copy' | 'open' | null;
  onCopy: () => void;
  onOpen: () => void;
  onPremium: () => void;
  testID?: string;
}

export function OrderActions({ stage, oneClick, storeName, copied, busy, onCopy, onOpen, onPremium, testID }: OrderActionsProps) {
  const t = useTheme();
  const c = t.colors;
  // Petits boutons : zone tactile portée à 44 pt.
  const v = (t.layout.minTouchTarget - t.controlHeight.sm) / 2;
  const slop = { top: v, bottom: v, left: 0, right: 0 };
  const copyButton = (
    <Button
      label={copied ? 'Copiée' : 'Copier'}
      variant="tonal"
      size="sm"
      leftIcon={copied ? Check : ClipboardCopy}
      loading={busy === 'copy'}
      onPress={onCopy}
      hitSlop={slop}
      accessibilityLabel={copied ? 'Liste copiée, copier à nouveau' : 'Copier la liste'}
      testID={testID ? `${testID}-copy` : undefined}
    />
  );

  if (stage === 'opened') {
    return (
      <View
        testID={testID}
        style={[styles.card, { backgroundColor: c.accentSoft, borderRadius: t.radius.xl, padding: t.spacing.lg, gap: t.spacing.md }]}
      >
        <Text variant="title3" accessibilityRole="header">
          De retour de chez {storeName} ?
        </Text>
        <Text variant="callout" color="textSecondary">
          Valide ta commande sur leur site, puis confirme ici : on l’ajoute à ton budget.
        </Text>
        <View style={[styles.row, { gap: t.spacing.sm }]}>
          <Button
            label={`Rouvrir ${storeName}`}
            variant="secondary"
            size="sm"
            rightIcon={ExternalLink}
            loading={busy === 'open'}
            onPress={onOpen}
            hitSlop={slop}
            testID={testID ? `${testID}-reopen` : undefined}
          />
          {copyButton}
        </View>
      </View>
    );
  }

  if (oneClick) {
    return (
      <View
        testID={testID}
        style={[styles.card, { backgroundColor: c.surface, borderRadius: t.radius.xl, padding: t.spacing.lg, gap: t.spacing.md }]}
      >
        <View style={[styles.row, { gap: t.spacing.sm }]}>
          <Badge label="Premium" tone="premium" icon={Crown} size="sm" />
          <Text variant="headline" style={styles.flex}>
            {FEATURE_COPY.one_click_order.title}
          </Text>
        </View>
        <Text variant="callout" color="textSecondary">
          Ton panier est prêt : il ne reste qu’à valider chez {storeName}. On copie aussi ta liste, au cas où.
        </Text>
        <View style={[styles.row, { gap: t.spacing.sm }]}>
          <Text variant="footnote" color="textSecondary" style={styles.flex}>
            Ta liste en texte, pour la partager.
          </Text>
          {copyButton}
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: t.spacing.md }} testID={testID}>
      <View style={[styles.card, { backgroundColor: c.surface, borderRadius: t.radius.xl, padding: t.spacing.lg, gap: t.spacing.lg }]}>
        <Text variant="headline" accessibilityRole="header">
          Ta commande en 2 étapes
        </Text>
        <Step n={1} title="Copie ta liste" body="Produits, quantités et prix, prêts à coller." done={copied} right={copyButton} />
        <Step n={2} title={`Ouvre ${storeName}`} body="Ajoute les articles au panier du site, puis valide." />
      </View>
      <InfoBanner
        tone="premium"
        icon={Crown}
        title={FEATURE_COPY.one_click_order.title}
        message="Avec Premium, ton panier drive est prêt : il ne reste qu’à valider."
        action={{ label: 'Découvrir Premium', onPress: onPremium }}
      />
    </View>
  );
}

function Step({ n, title, body, done, right }: { n: number; title: string; body: string; done?: boolean; right?: React.ReactNode }) {
  const t = useTheme();
  const c = t.colors;
  const dim = t.iconSize.xl;
  return (
    <View style={[styles.step, { gap: t.spacing.md }]} accessible={!right} accessibilityLabel={`Étape ${n} : ${title}. ${body}`}>
      <View
        style={[
          styles.num,
          { width: dim, height: dim, borderRadius: t.radius.pill, backgroundColor: done ? c.success : c.primarySoft },
        ]}
      >
        {done ? (
          <Check size={t.iconSize.sm} color={c.surface} strokeWidth={3} />
        ) : (
          <Text variant="headline" style={{ color: t.scheme === 'dark' ? c.text : c.primary }}>
            {n}
          </Text>
        )}
      </View>
      <View style={styles.flex}>
        <Text variant="bodyMedium">{title}</Text>
        <Text variant="footnote" color="textSecondary">
          {body}
        </Text>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {},
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  step: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  num: { alignItems: 'center', justifyContent: 'center' },
});

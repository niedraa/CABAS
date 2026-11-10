/**
 * Réglages du panier : mode (« Un seul magasin » gratuit / « Le moins cher »
 * Premium) et canal (drive / livraison). La couronne signale le mode Premium
 * aux comptes gratuits ; l'explication du mode suit la sélection.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Crown, Sparkles, Store, Truck } from 'lucide-react-native';

import { Chip, SegmentedControl, Text } from '@/components/ui';
import type { BasketMode, OrderChannel } from '@/core';
import { useTheme } from '@/theme';

import { CHANNEL_LABELS, MODE_COPY } from './basketView';

export interface BasketControlsProps {
  mode: BasketMode;
  channel: OrderChannel;
  isPremium: boolean;
  onModeChange: (mode: BasketMode) => void;
  onChannelChange: (channel: OrderChannel) => void;
  testID?: string;
}

const CHANNELS: { value: OrderChannel; icon: typeof Store }[] = [
  { value: 'drive', icon: Store },
  { value: 'delivery', icon: Truck },
];

export function BasketControls({ mode, channel, isPremium, onModeChange, onChannelChange, testID }: BasketControlsProps) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.sm }} testID={testID}>
      <SegmentedControl<BasketMode>
        options={[
          { value: 'single_store', label: MODE_COPY.single_store.label },
          { value: 'cheapest', label: MODE_COPY.cheapest.label, icon: isPremium ? Sparkles : Crown },
        ]}
        value={mode}
        onChange={onModeChange}
        accessibilityLabel="Mode du panier"
        testID={testID ? `${testID}-mode` : undefined}
      />
      <Animated.View key={mode} entering={FadeIn.duration(t.motion.duration.base)}>
        <Text variant="footnote" color="textSecondary" style={{ paddingHorizontal: t.spacing.xs }}>
          {MODE_COPY[mode].hint}
          {!isPremium && mode === 'cheapest' ? ' Réservé à Premium.' : ''}
        </Text>
      </Animated.View>
      <View
        style={[styles.channels, { gap: t.spacing.sm, marginTop: t.spacing.xs }]}
        accessibilityRole="radiogroup"
        accessibilityLabel="Retrait au drive ou livraison"
      >
        {CHANNELS.map((ch) => (
          <Chip
            key={ch.value}
            label={CHANNEL_LABELS[ch.value]}
            icon={ch.icon}
            role="radio"
            selected={channel === ch.value}
            onPress={() => {
              if (channel !== ch.value) onChannelChange(ch.value);
            }}
            testID={testID ? `${testID}-${ch.value}` : undefined}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  channels: { flexDirection: 'row', flexWrap: 'wrap' },
});

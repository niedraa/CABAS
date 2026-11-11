/**
 * En-tête du paywall : surtitre « Cabas Premium » (couronne moutarde), grand
 * titre `hero`, promesse courte, panier de la marque. À poser sur un fond
 * forêt (les cercles doux sont dessinés par l'écran).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { Crown } from 'lucide-react-native';

import { BasketMark } from '@/components/brand';
import { staggerEntering, Text } from '@/components/ui';
import { useTheme, withAlpha } from '@/theme';

export interface PremiumHeroProps {
  eyebrow?: string;
  title: string;
  subtitle: string;
  /** Emoji posé sur le panier (« 🎉 » une fois Premium). */
  emoji?: string;
  testID?: string;
}

export function PremiumHero({ eyebrow = 'Cabas Premium', title, subtitle, emoji, testID = 'premium-hero' }: PremiumHeroProps) {
  const t = useTheme();
  const c = t.colors;
  return (
    <View style={{ gap: t.spacing.md }} testID={testID}>
      <Animated.View
        entering={ZoomIn.springify().damping(t.motion.springBouncy.damping).stiffness(t.motion.springBouncy.stiffness)}
        style={[styles.mark, { backgroundColor: withAlpha(c.heroText, 0.1), borderRadius: t.radius.xl }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <BasketMark size={56} variant="reversed" />
        <View style={[styles.crown, { backgroundColor: c.accent, borderColor: c.hero }]}>
          {emoji ? <Text style={styles.emoji}>{emoji}</Text> : <Crown size={t.iconSize.sm} color={c.onAccent} strokeWidth={2.4} />}
        </View>
      </Animated.View>
      <Animated.View entering={staggerEntering(1, t.motion.stagger, t.motion.duration.instant)}>
        <Text variant="overline" color="accent">
          {eyebrow}
        </Text>
      </Animated.View>
      <Animated.View entering={staggerEntering(2, t.motion.stagger, t.motion.duration.instant)}>
        <Text variant="hero" color="heroText" accessibilityRole="header" maxFontSizeMultiplier={1.3} testID={`${testID}-title`}>
          {title}
        </Text>
      </Animated.View>
      <Animated.View entering={staggerEntering(3, t.motion.stagger, t.motion.duration.instant)}>
        <Text variant="callout" color="heroText" style={styles.lead}>
          {subtitle}
        </Text>
      </Animated.View>
    </View>
  );
}

const MARK = 88;
const CROWN = 32;

const styles = StyleSheet.create({
  mark: { width: MARK, height: MARK, alignItems: 'center', justifyContent: 'center' },
  crown: {
    position: 'absolute',
    right: -8,
    top: -8,
    width: CROWN,
    height: CROWN,
    borderRadius: CROWN / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 15, lineHeight: 19 },
  lead: { opacity: 0.86, maxWidth: 380 },
});

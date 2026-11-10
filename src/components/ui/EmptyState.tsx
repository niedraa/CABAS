/**
 * État vide : illustration (passée en prop, voir components/brand),
 * titre chaleureux, explication, action.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useTheme } from '@/theme';

import { Button, type ButtonProps } from './Button';
import { Text } from './Text';

export interface EmptyStateProps {
  illustration?: React.ReactNode;
  title: string;
  body?: string;
  action?: Pick<ButtonProps, 'label' | 'onPress' | 'leftIcon' | 'variant'>;
  secondaryAction?: Pick<ButtonProps, 'label' | 'onPress'>;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ illustration, title, body, action, secondaryAction, compact, style }: EmptyStateProps) {
  const t = useTheme();
  const spring = t.motion.spring;
  const enter = (i: number) =>
    FadeInDown.delay(i * t.motion.stagger * 2)
      .springify()
      .damping(spring.damping)
      .stiffness(spring.stiffness);
  return (
    <View style={[styles.base, { paddingVertical: compact ? t.spacing.xl : t.spacing.huge }, style]}>
      {illustration ? (
        <Animated.View entering={enter(0)} style={{ marginBottom: t.spacing.lg }}>
          {illustration}
        </Animated.View>
      ) : null}
      <Animated.View entering={enter(1)} style={styles.texts}>
        <Text variant="title2" align="center" accessibilityRole="header">
          {title}
        </Text>
        {body ? (
          <Text variant="callout" color="textSecondary" align="center">
            {body}
          </Text>
        ) : null}
      </Animated.View>
      {action || secondaryAction ? (
        <Animated.View entering={enter(2)} style={[styles.actions, { marginTop: t.spacing.xl }]}>
          {action ? <Button {...action} variant={action.variant ?? 'primary'} /> : null}
          {secondaryAction ? <Button {...secondaryAction} variant="ghost" size="sm" /> : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', paddingHorizontal: 24 },
  texts: { gap: 8, alignItems: 'center', maxWidth: 340 },
  actions: { alignItems: 'center', gap: 8 },
});

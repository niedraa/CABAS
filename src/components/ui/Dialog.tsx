/**
 * Boîte de dialogue centrée (confirmation, information bloquante).
 * Apparition : voile + carte qui « pousse » au ressort ; sortie rapide.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { boxShadow, useTheme } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';
import { usePresence } from './usePresence';

export interface DialogProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  /** Illustration ou emoji au-dessus du titre. */
  illustration?: React.ReactNode;
  children?: React.ReactNode;
  /** Boutons (pile verticale, le principal en premier). */
  actions?: React.ReactNode;
  dismissible?: boolean;
  testID?: string;
}

export function Dialog({
  visible,
  onClose,
  title,
  message,
  illustration,
  children,
  actions,
  dismissible = true,
  testID,
}: DialogProps) {
  const t = useTheme();
  const c = t.colors;
  const { rendered, progress } = usePresence(visible, { spring: t.motion.springBouncy, exitDuration: t.motion.duration.fast });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, progress.get()) }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.get() * 1.5),
    transform: [{ scale: 0.88 + 0.12 * progress.get() }, { translateY: 16 * (1 - progress.get()) }],
  }));

  if (!rendered) return null;
  const close = () => {
    if (dismissible) onClose();
  };

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={close} testID={testID}>
      <View style={styles.center}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }, backdropStyle]}>
          <Pressable style={styles.flex} onPress={close} accessibilityRole="button" accessibilityLabel="Fermer" />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[
            styles.card,
            {
              backgroundColor: c.surfaceElevated,
              borderRadius: t.radius.xl,
              padding: t.spacing.xxl,
              boxShadow: boxShadow('lg', c.shadow),
            },
            cardStyle,
          ]}
        >
          {illustration ? <View style={styles.illu}>{illustration}</View> : null}
          <Text variant="title3" align="center" accessibilityRole="header">
            {title}
          </Text>
          {message ? (
            <Text variant="callout" color="textSecondary" align="center" style={styles.message}>
              {message}
            </Text>
          ) : null}
          {children}
          {actions ? <View style={[styles.actions, { marginTop: t.spacing.xl }]}>{actions}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

export interface ConfirmDialogProps extends Omit<DialogProps, 'actions' | 'children'> {
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Action irréversible : bouton tomate. */
  destructive?: boolean;
  loading?: boolean;
}

/** Confirmation « Supprimer ma liste ? » en deux boutons. */
export function ConfirmDialog({
  onConfirm,
  onClose,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  destructive,
  loading,
  ...rest
}: ConfirmDialogProps) {
  return (
    <Dialog
      {...rest}
      onClose={onClose}
      actions={
        <>
          <Button
            label={confirmLabel}
            variant={destructive ? 'danger' : 'primary'}
            haptic={destructive ? 'impact' : 'success'}
            loading={loading}
            fullWidth
            onPress={onConfirm}
          />
          <Button label={cancelLabel} variant="ghost" fullWidth onPress={onClose} />
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, alignItems: 'stretch' },
  illu: { alignItems: 'center', marginBottom: 16 },
  message: { marginTop: 8 },
  actions: { gap: 8 },
});

/**
 * Boîte de dialogue centrée (confirmation, information bloquante).
 * Apparition : voile + carte qui « pousse » au ressort ; sortie rapide.
 *
 * Fermeture : la sortie est animée, puis (iOS) la Modal est refermée côté
 * natif avant le démontage. `onExited` signale la fin de ce cycle. Une autre
 * Modal du kit demandée entre-temps attend son tour (voir `presentation.tsx`) :
 * enchaîner deux confirmations fonctionne aussi sur iOS.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { boxShadow, useTheme } from '@/theme';

import { Button } from './Button';
import { PresentationLevel, usePresentationSlot } from './presentation';
import { Text } from './Text';

/** iOS : délai maximal d'attente de la fermeture native (`onDismiss`) avant de démonter. */
const NATIVE_DISMISS_TIMEOUT_MS = 1000;

export interface DialogProps {
  visible: boolean;
  onClose: () => void;
  /**
   * Appelé une fois le dialogue entièrement refermé (animation de sortie
   * terminée, Modal fermée côté natif). Pour enchaîner une présentation native
   * (partage, autre écran modal) qui ne doit pas croiser celle-ci.
   */
  onExited?: () => void;
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
  onExited,
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
  // `mounted` : Modal montée ; `hiding` (iOS) : masquée, en attente de sa fermeture native.
  const [mounted, setMounted] = useState(false);
  const [hiding, setHiding] = useState(false);
  const granted = usePresentationSlot(visible, mounted);
  const progress = useSharedValue(0);
  // Modal effectivement présentée côté natif (`onShow` reçu) : sinon rien à attendre.
  const shown = useRef(false);
  const visibleRef = useRef(visible);
  const onExitedRef = useRef(onExited);
  useEffect(() => {
    visibleRef.current = visible;
    onExitedRef.current = onExited;
  });

  // Ajustement d'état pendant le rendu (recommandé par React plutôt qu'un effet) :
  // monter dès que le créneau de présentation est accordé.
  if (visible && granted && !mounted) setMounted(true);

  const spring = t.motion.springBouncy;
  const exitDuration = t.motion.duration.fast;

  // Démontage final (ou réaffichage si `visible` est repassé à true entre-temps).
  const finish = () => {
    shown.current = false;
    setHiding(false);
    if (!visibleRef.current) setMounted(false);
  };
  const finishRef = useRef(finish);
  const hidingRef = useRef(hiding);
  useEffect(() => {
    finishRef.current = finish;
    hidingRef.current = hiding;
  });

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      progress.set(withSpring(1, spring));
      return;
    }
    const endExit = () => {
      if (visibleRef.current) return;
      // iOS : masquer la Modal et attendre `onDismiss` avant de libérer la place.
      if (Platform.OS === 'ios' && shown.current) setHiding(true);
      else finishRef.current();
    };
    progress.set(
      withTiming(0, { duration: exitDuration }, (finished) => {
        if (finished) scheduleOnRN(endExit);
      }),
    );
    // `spring` est un objet de tokens stable : seules visibilité et montage comptent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mounted]);

  // Filet de sécurité : `onDismiss` perdu → on démonte quand même.
  useEffect(() => {
    if (!hiding) return;
    const timer = setTimeout(() => finishRef.current(), NATIVE_DISMISS_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [hiding]);

  // Cycle ouverture → fermeture complète : prévient le parent.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (visible) wasOpen.current = true;
    else if (!mounted && wasOpen.current) {
      wasOpen.current = false;
      onExitedRef.current?.();
    }
  }, [visible, mounted]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, progress.get()) }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.get() * 1.5),
    transform: [{ scale: 0.88 + 0.12 * progress.get() }, { translateY: 16 * (1 - progress.get()) }],
  }));

  if (!mounted) return null;
  const close = () => {
    if (dismissible) onClose();
  };

  return (
    <Modal
      transparent
      visible={!hiding}
      animationType="none"
      statusBarTranslucent
      onRequestClose={close}
      onShow={() => {
        shown.current = true;
      }}
      onDismiss={() => {
        if (hidingRef.current) finishRef.current();
      }}
      testID={testID}
    >
      <PresentationLevel>
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
      </PresentationLevel>
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

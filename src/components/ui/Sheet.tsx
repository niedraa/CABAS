/**
 * Feuille modale du bas (« remplacer un plat », filtres, détail d'un prix).
 *
 * - voile qui s'estompe, feuille qui monte au ressort (`motion.springSheet`) ;
 * - glisser vers le bas pour fermer (Gesture Handler v3, thread UI),
 *   avec élasticité vers le haut et points d'ancrage optionnels ;
 * - fonctionne sur iOS, Android et web (Modal transparente).
 *
 * Composant contrôlé : `visible` + `onClose`. La sortie est animée avant
 * le démontage.
 */
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { X } from 'lucide-react-native';

import { haptics } from '@/lib/haptics';
import { boxShadow, useTheme } from '@/theme';

import { IconButton } from './IconButton';
import { Text } from './Text';
import { useSafeInsets } from './useSafeInsets';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
  /** Pied collé (boutons d'action). */
  footer?: React.ReactNode;
  /**
   * Hauteurs d'ancrage en fraction d'écran, croissantes (ex. [0.5, 0.92]).
   * Sans ancrage, la feuille prend la hauteur de son contenu (max 92 %).
   */
  snapPoints?: number[];
  /** Contenu défilant (longues listes). */
  scrollable?: boolean;
  /** Bouton « fermer » dans l'en-tête (défaut true si titre). */
  showClose?: boolean;
  /** Empêche la fermeture par geste / voile (action obligatoire). */
  dismissible?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

const MAX_FRACTION = 0.92;

export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  snapPoints,
  scrollable = false,
  showClose,
  dismissible = true,
  contentStyle,
  testID,
}: SheetProps) {
  const t = useTheme();
  const c = t.colors;
  const insets = useSafeInsets();
  const { height: winH } = useWindowDimensions();
  const [rendered, setRendered] = useState(visible);
  const [sheetH, setSheetH] = useState(0);

  // Position verticale de la feuille : 0 = entièrement ouverte, sheetH = cachée.
  const translateY = useSharedValue(winH);
  const startY = useSharedValue(0);

  const maxH = Math.min(winH * MAX_FRACTION, winH - insets.top - 8);
  const sorted = snapPoints && snapPoints.length > 0 ? [...snapPoints].sort((a, b) => a - b) : null;
  const fixedH = sorted ? Math.min(maxH, sorted[sorted.length - 1] * winH) : undefined;
  // Décalages d'ancrage (du plus ouvert au moins ouvert).
  const offsets = sorted && fixedH ? sorted.map((f) => Math.max(0, fixedH - f * winH)).sort((a, b) => a - b) : [0];
  const restOffset = offsets[offsets.length - 1];

  // Ajustements d'état pendant le rendu (recommandé par React plutôt qu'un effet) :
  // - monter dès que la feuille doit apparaître ;
  // - si elle n'a jamais été mesurée (ex. tests), démonter directement à la fermeture.
  if (visible && !rendered) setRendered(true);
  if (!visible && rendered && sheetH === 0) setRendered(false);

  useEffect(() => {
    if (!rendered || sheetH === 0) return;
    if (visible) {
      translateY.set(withSpring(restOffset, t.motion.springSheet));
    } else {
      translateY.set(
        withTiming(sheetH + 40, { duration: t.motion.duration.base }, (finished) => {
          if (finished) scheduleOnRN(setRendered, false);
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, rendered, sheetH, restOffset]);

  const requestClose = () => {
    if (dismissible) onClose();
  };
  // Valeurs capturées par les worklets du geste : primitives / fonctions JS
  // simples (pas l'objet thème entier).
  const sheetSpring = t.motion.springSheet;
  const onSnap = () => haptics.select();

  const pan = usePanGesture({
    enabled: dismissible || offsets.length > 1,
    activeOffsetY: [-6, 6],
    onActivate: () => {
      'worklet';
      startY.set(translateY.get());
    },
    onUpdate: (e) => {
      'worklet';
      const next = startY.get() + e.translationY;
      // Élasticité au-delà de l'ouverture maximale.
      translateY.set(next < 0 ? next * 0.25 : next);
    },
    onDeactivate: (e) => {
      'worklet';
      const projected = translateY.get() + e.velocityY * 0.18;
      const last = offsets[offsets.length - 1];
      const closeAt = last + (sheetH - last) * 0.35;
      if (dismissible && (projected > closeAt || e.velocityY > 1400)) {
        translateY.set(withTiming(sheetH + 40, { duration: 200 }));
        scheduleOnRN(onClose);
        return;
      }
      let best = offsets[0];
      for (const o of offsets) if (Math.abs(o - projected) < Math.abs(best - projected)) best = o;
      translateY.set(withSpring(best, sheetSpring));
      scheduleOnRN(onSnap);
    },
  });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: sheetH > 0 ? interpolate(translateY.get(), [restOffset, sheetH], [1, 0], Extrapolation.CLAMP) : 0,
  }));

  if (!rendered) return null;

  const hasHeader = !!title || (showClose ?? false);
  const Body = scrollable ? ScrollView : View;

  return (
    <Modal
      transparent
      visible
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={requestClose}
      testID={testID}
    >
      <GestureHandlerRootView style={styles.flex}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }, backdropStyle]}>
            <Pressable
              style={styles.flex}
              onPress={requestClose}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              testID={testID ? `${testID}-backdrop` : 'sheet-backdrop'}
            />
          </Animated.View>
          <View style={styles.anchor} pointerEvents="box-none">
            <Animated.View
              accessibilityViewIsModal
              onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}
              style={[
                styles.sheet,
                {
                  backgroundColor: c.surfaceElevated,
                  borderTopLeftRadius: t.radius.xl,
                  borderTopRightRadius: t.radius.xl,
                  maxHeight: maxH,
                  height: fixedH,
                  maxWidth: t.layout.maxContentWidth + 40,
                  boxShadow: boxShadow('lg', c.shadow),
                },
                sheetStyle,
              ]}
            >
              <GestureDetector gesture={pan}>
                <View style={styles.dragZone}>
                  <View style={styles.grabberWrap}>
                    <View style={[styles.grabber, { backgroundColor: c.borderStrong }]} />
                  </View>
                  {hasHeader ? (
                    <View style={[styles.header, { paddingHorizontal: t.spacing.xl }]}>
                      <View style={styles.flex}>
                        {title ? (
                          <Text variant="title3" accessibilityRole="header">
                            {title}
                          </Text>
                        ) : null}
                        {subtitle ? (
                          <Text variant="footnote" color="textSecondary">
                            {subtitle}
                          </Text>
                        ) : null}
                      </View>
                      {(showClose ?? !!title) && dismissible ? (
                        <IconButton icon={X} accessibilityLabel="Fermer" variant="tonal" size="sm" onPress={onClose} />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </GestureDetector>
              <Body
                style={scrollable ? styles.flexShrink : undefined}
                contentContainerStyle={scrollable ? { paddingBottom: t.spacing.lg } : undefined}
              >
                <View style={[{ paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.sm }, contentStyle]}>{children}</View>
              </Body>
              {footer ? (
                <View style={{ paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.md }}>{footer}</View>
              ) : null}
              <View style={{ height: insets.bottom + t.spacing.lg }} />
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  anchor: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', overflow: 'hidden' },
  dragZone: { paddingBottom: 4 },
  grabberWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  grabber: { width: 40, height: 5, borderRadius: 3 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 4 },
});

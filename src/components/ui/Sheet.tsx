/**
 * Feuille modale du bas (« remplacer un plat », filtres, détail d'un prix).
 *
 * - voile qui s'estompe, feuille qui monte au ressort (`motion.springSheet`) ;
 * - glisser vers le bas pour fermer (Gesture Handler v3, thread UI),
 *   avec élasticité vers le haut et points d'ancrage optionnels ;
 * - fonctionne sur iOS, Android et web (Modal transparente) ;
 * - clavier : `KeyboardAvoidingView` sur iOS ; sur Android la fenêtre de la
 *   Modal est edge-to-edge (plus redimensionnée par `adjustResize`), la
 *   feuille remonte donc de la hauteur du clavier ;
 * - iOS : attend que toute autre Modal du kit soit refermée avant de se
 *   présenter (voir `presentation.tsx`).
 *
 * Composant contrôlé : `visible` + `onClose`. La sortie est animée avant
 * le démontage.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
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
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { X } from 'lucide-react-native';

import { haptics } from '@/lib/haptics';
import { boxShadow, useTheme } from '@/theme';

import { IconButton } from './IconButton';
import { PresentationLevel, usePresentationSlot } from './presentation';
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
  /**
   * Appelé une fois la feuille entièrement refermée (sur iOS : Modal fermée
   * côté natif). Pour enchaîner une autre présentation native (partage…),
   * qui ne doit pas s'ouvrir par-dessus une Modal en train de se fermer.
   */
  onDismissed?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

const MAX_FRACTION = 0.92;
/** iOS : délai maximal d'attente de la fermeture native (`onDismiss`) avant de démonter. */
const NATIVE_DISMISS_TIMEOUT_MS = 1000;

/**
 * Android : hauteur du clavier (au-dessus de la barre de navigation), animée.
 * La fenêtre de la Modal est edge-to-edge : `adjustResize` ne la redimensionne
 * plus et `KeyboardAvoidingView` n'y fait rien. Toujours 0 ailleurs.
 */
function useAndroidKeyboardInset(active: boolean, duration: number): SharedValue<number> {
  const inset = useSharedValue(0);
  useEffect(() => {
    if (Platform.OS !== 'android' || !active) return;
    const to = (h: number) => inset.set(withTiming(Math.max(0, h), { duration }));
    if (Keyboard.isVisible()) to(Keyboard.metrics()?.height ?? 0);
    const show = Keyboard.addListener('keyboardDidShow', (e) => to(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => to(0));
    return () => {
      show.remove();
      hide.remove();
      inset.set(0);
    };
  }, [active, duration, inset]);
  return inset;
}

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
  onDismissed,
  contentStyle,
  testID,
}: SheetProps) {
  const t = useTheme();
  const c = t.colors;
  const insets = useSafeInsets();
  const { height: winH } = useWindowDimensions();
  const [rendered, setRendered] = useState(false);
  // iOS : une seule Modal présentée à la fois par niveau (voir `presentation.tsx`).
  const granted = usePresentationSlot(visible, rendered);
  // Modal effectivement présentée côté natif (`onShow` reçu) : sinon, rien à attendre.
  const shown = useRef(false);
  // iOS : en fin de sortie, la Modal est masquée (visible = false) et reste montée
  // jusqu'à son `onDismiss` natif. La démonter tout de suite fermerait aussi ce qui
  // vient de se présenter par-dessus (feuille de partage…).
  const [hiding, setHiding] = useState(false);
  const [sheetH, setSheetH] = useState(0);

  // Feuille entièrement refermée (démontée) : prévient le parent.
  const onDismissedRef = useRef(onDismissed);
  useEffect(() => {
    onDismissedRef.current = onDismissed;
  });
  const wasRendered = useRef(rendered);
  useEffect(() => {
    if (!rendered) shown.current = false;
    if (wasRendered.current && !rendered) onDismissedRef.current?.();
    wasRendered.current = rendered;
  }, [rendered]);

  // Filet de sécurité : `onDismiss` perdu → on démonte quand même.
  useEffect(() => {
    if (!hiding) return;
    const timer = setTimeout(() => {
      setHiding(false);
      setRendered(false);
    }, NATIVE_DISMISS_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [hiding]);

  const keyboardInset = useAndroidKeyboardInset(rendered, t.motion.duration.base);

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
  // - monter dès que la feuille doit apparaître (et que le créneau de présentation est accordé) ;
  // - si elle n'a jamais été mesurée (ex. tests), démonter directement à la fermeture.
  if (visible && !rendered && granted) setRendered(true);
  if (visible && hiding) setHiding(false);
  if (!visible && rendered && sheetH === 0) setRendered(false);

  useEffect(() => {
    if (!rendered || sheetH === 0) return;
    if (visible) {
      translateY.set(withSpring(restOffset, t.motion.springSheet));
    } else {
      const finishExit = () => (Platform.OS === 'ios' && shown.current ? setHiding(true) : setRendered(false));
      translateY.set(
        withTiming(sheetH + 40, { duration: t.motion.duration.base }, (finished) => {
          if (finished) scheduleOnRN(finishExit);
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
  const keyboardStyle = useAnimatedStyle(() => ({ paddingBottom: keyboardInset.get() }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: sheetH > 0 ? interpolate(translateY.get(), [restOffset, sheetH], [1, 0], Extrapolation.CLAMP) : 0,
  }));

  if (!rendered) return null;

  const hasHeader = !!title || (showClose ?? false);
  const Body = scrollable ? ScrollView : View;

  return (
    <Modal
      transparent
      visible={!hiding}
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={requestClose}
      onShow={() => {
        shown.current = true;
      }}
      onDismiss={
        hiding
          ? () => {
              setHiding(false);
              setRendered(false);
            }
          : undefined
      }
      testID={testID}
    >
      <PresentationLevel>
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
            {/* Marge haute : clavier ouvert, la feuille rétrécit (`flexShrink`) au lieu de passer sous la barre d'état.
              Marge basse (Android) : hauteur du clavier. */}
            <Animated.View style={[styles.anchor, { paddingTop: insets.top + 8 }, keyboardStyle]} pointerEvents="box-none">
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
                  // Clavier ouvert : le premier toucher atteint sa cible (résultat, bouton)
                  // au lieu de seulement fermer le clavier.
                  keyboardShouldPersistTaps={scrollable ? 'handled' : undefined}
                  keyboardDismissMode={scrollable ? 'on-drag' : undefined}
                >
                  <View style={[{ paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.sm }, contentStyle]}>{children}</View>
                </Body>
                {footer ? (
                  <View style={{ paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.md }}>{footer}</View>
                ) : null}
                <View style={{ height: insets.bottom + t.spacing.lg }} />
              </Animated.View>
            </Animated.View>
          </KeyboardAvoidingView>
        </GestureHandlerRootView>
      </PresentationLevel>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  anchor: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  // `flexShrink` : la hauteur fixe (ancrages) cède quand le clavier réduit la place.
  sheet: { width: '100%', overflow: 'hidden', flexShrink: 1 },
  dragZone: { paddingBottom: 4 },
  grabberWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  grabber: { width: 40, height: 5, borderRadius: 3 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 4 },
});

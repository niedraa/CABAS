/**
 * Système de toasts : `<ToastProvider>` à la racine, puis
 * `const toast = useToast(); toast.show({ title: 'Liste prête !', tone: 'success' })`.
 *
 * Les toasts tombent du haut au ressort, s'empilent (3 max), se ferment
 * seuls (3,5 s par défaut), au toucher, ou via leur action. Chaque toast
 * déclenche le retour haptique de son ton et est annoncé au lecteur d'écran.
 *
 * - iOS : les toasts s'affichent dans une `FullWindowOverlay`, au-dessus des
 *   écrans présentés en modal (paywall, commande…) et des Sheet / Dialog ;
 * - accessibilité : le bouton d'action est un élément distinct du message
 *   (jamais imbriqué), et un toast avec action reste affiché tant que le
 *   lecteur d'écran est actif, jusqu'à sa fermeture (laisse le temps d'agir).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { FullWindowOverlay } from 'react-native-screens';
import { CircleAlert, CircleCheck, Info, Sparkles, type LucideIcon } from 'lucide-react-native';

import { announce } from '@/lib/a11y';
import { haptics } from '@/lib/haptics';
import { boxShadow, useTheme } from '@/theme';

import { renderIcon, type IconLike } from './icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { useSafeInsets } from './useSafeInsets';

export type ToastTone = 'neutral' | 'success' | 'danger' | 'info' | 'accent';

export interface ToastOptions {
  title: string;
  message?: string;
  tone?: ToastTone;
  icon?: IconLike;
  emoji?: string;
  /** Durée d'affichage en ms (0 = jusqu'à fermeture manuelle). */
  duration?: number;
  action?: { label: string; onPress: () => void };
}

interface ToastItem extends ToastOptions {
  id: number;
}

export interface ToastApi {
  show: (opts: ToastOptions) => number;
  hide: (id: number) => void;
  hideAll: () => void;
}

const noop: ToastApi = { show: () => -1, hide: () => undefined, hideAll: () => undefined };
const ToastContext = createContext<ToastApi | null>(null);

/** Accès aux toasts. Hors `ToastProvider`, renvoie une API inerte (avec avertissement en dev). */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    if (__DEV__) console.warn('useToast() appelé hors de <ToastProvider>.');
    return noop;
  }
  return ctx;
}

const DEFAULT_DURATION = 3500;
const MAX_VISIBLE = 3;

/**
 * Durée effective d'un toast (ms, 0 = jusqu'à fermeture). Lecteur d'écran
 * actif : un toast avec action ne se ferme pas seul (le temps d'atteindre le
 * bouton « Annuler » dépasse largement 3,5 s).
 */
export function toastDuration(opts: Pick<ToastOptions, 'duration' | 'action'>, screenReaderOn: boolean): number {
  const duration = opts.duration ?? DEFAULT_DURATION;
  return screenReaderOn && opts.action ? 0 : duration;
}

/**
 * État du lecteur d'écran (VoiceOver / TalkBack), lu sans provoquer de rendu.
 * Web : react-native-web répond toujours `true` (aucun moyen de le savoir),
 * ce qui figerait tous les toasts avec action : on le considère inactif.
 */
function useScreenReaderRef(): React.RefObject<boolean> {
  const on = useRef(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let alive = true;
    let sub: { remove(): void } | undefined;
    try {
      AccessibilityInfo.isScreenReaderEnabled().then(
        (v) => {
          if (alive) on.current = v;
        },
        () => undefined,
      );
      sub = AccessibilityInfo.addEventListener('screenReaderChanged', (v: boolean) => {
        on.current = v;
      });
    } catch {
      // Indisponible (web, tests) : considéré comme inactif.
    }
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);
  return on;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const screenReader = useScreenReaderRef();

  const hide = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setItems((cur) => cur.filter((i) => i.id !== id));
  }, []);

  const show = useCallback(
    (opts: ToastOptions) => {
      const id = nextId.current++;
      setItems((cur) => [{ ...opts, id }, ...cur].slice(0, MAX_VISIBLE));
      const tone = opts.tone ?? 'neutral';
      if (tone === 'success') haptics.success();
      else if (tone === 'danger') haptics.error();
      else haptics.tap();
      announce(opts.message ? `${opts.title}. ${opts.message}` : opts.title);
      const duration = toastDuration(opts, screenReader.current);
      if (duration > 0) timers.current.set(id, setTimeout(() => hide(id), duration));
      return id;
    },
    [hide, screenReader],
  );

  const hideAll = useCallback(() => {
    timers.current.forEach((tm) => clearTimeout(tm));
    timers.current.clear();
    setItems([]);
  }, []);

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((tm) => clearTimeout(tm));
  }, []);

  const api = useMemo(() => ({ show, hide, hideAll }), [show, hide, hideAll]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport items={items} onHide={hide} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ items, onHide }: { items: ToastItem[]; onHide: (id: number) => void }) {
  const t = useTheme();
  const insets = useSafeInsets();
  const viewport = (
    <View
      pointerEvents="box-none"
      style={[styles.viewport, { top: insets.top + t.spacing.sm, zIndex: t.zIndex.toast }]}
    >
      {items.map((item) => (
        <ToastCard key={item.id} item={item} onHide={() => onHide(item.id)} />
      ))}
    </View>
  );
  return Platform.OS === 'ios' ? <IosOverlay active={items.length > 0}>{viewport}</IosOverlay> : viewport;
}

/**
 * iOS : les écrans en modal natif et les Modal (Sheet, Dialog) sont des
 * contrôleurs présentés PAR-DESSUS la vue racine. La `FullWindowOverlay` se
 * place au sommet de la fenêtre à son montage : on la monte donc à
 * l'apparition des toasts (au-dessus de ce qui est présenté à cet instant), et
 * on la retire une fois le dernier sorti (animation de sortie comprise).
 * `unstable_accessibilityContainerViewIsModal={false}` : le reste de l'écran
 * reste accessible au lecteur d'écran.
 */
function IosOverlay({ active, children }: { active: boolean; children: React.ReactNode }) {
  const t = useTheme();
  const [mounted, setMounted] = useState(active);
  // Ajustement d'état pendant le rendu : monter dès qu'un toast arrive.
  if (active && !mounted) setMounted(true);
  const exitMs = t.motion.duration.fast * 2;
  useEffect(() => {
    if (active || !mounted) return;
    const timer = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(timer);
  }, [active, mounted, exitMs]);
  if (!mounted) return null;
  return <FullWindowOverlay unstable_accessibilityContainerViewIsModal={false}>{children}</FullWindowOverlay>;
}

const TONE_ICON: Record<ToastTone, LucideIcon> = {
  neutral: Info,
  success: CircleCheck,
  danger: CircleAlert,
  info: Info,
  accent: Sparkles,
};

function ToastCard({ item, onHide }: { item: ToastItem; onHide: () => void }) {
  const t = useTheme();
  const c = t.colors;
  const tone = item.tone ?? 'neutral';
  // Toasts « encre » : fond sombre contrasté en clair, papier surélevé en sombre.
  const bg = t.scheme === 'dark' ? c.surfaceElevated : c.text;
  const fg = t.scheme === 'dark' ? c.text : c.background;
  const accent: Record<ToastTone, string> = {
    neutral: fg,
    success: t.scheme === 'dark' ? c.success : '#8DBEA3',
    danger: t.scheme === 'dark' ? c.danger : '#F07A5E',
    info: t.scheme === 'dark' ? c.info : '#C9B3E3',
    accent: c.accent,
  };
  const spring = t.motion.springToast;
  const action = item.action;

  return (
    <Animated.View
      entering={FadeInUp.springify().damping(spring.damping).stiffness(spring.stiffness).mass(spring.mass)}
      exiting={FadeOutUp.duration(t.motion.duration.fast)}
      layout={LinearTransition.springify().damping(spring.damping).stiffness(spring.stiffness)}
      style={[
        styles.cardWrap,
        styles.card,
        { backgroundColor: bg, borderRadius: t.radius.lg, boxShadow: boxShadow('lg', c.shadow) },
      ]}
    >
      {/* Message et action côte à côte, jamais imbriqués : le lecteur d'écran atteint le bouton. */}
      <PressableScale
        onPress={onHide}
        onAccessibilityEscape={onHide}
        haptic="none"
        accessibilityRole="alert"
        accessibilityLabel={item.message ? `${item.title}. ${item.message}` : item.title}
        accessibilityHint="Touche pour fermer"
        scaleTo={1}
        dimOnPress
        testID={`toast-${item.id}`}
        style={[styles.body, { paddingRight: action ? 0 : CARD_PADDING_H }]}
      >
        <View style={[styles.iconWrap, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
          {item.emoji ? (
            <Text style={styles.emoji}>{item.emoji}</Text>
          ) : (
            renderIcon(item.icon ?? TONE_ICON[tone], { size: 20, color: accent[tone] })
          )}
        </View>
        <View style={styles.texts}>
          <Text variant="headline" style={{ color: fg }} numberOfLines={2}>
            {item.title}
          </Text>
          {item.message ? (
            <Text variant="footnote" style={{ color: fg, opacity: 0.78 }} numberOfLines={3}>
              {item.message}
            </Text>
          ) : null}
        </View>
      </PressableScale>
      {action ? (
        <PressableScale
          onPress={() => {
            action.onPress();
            onHide();
          }}
          accessibilityLabel={action.label}
          hitSlop={8}
          testID={`toast-${item.id}-action`}
          style={[styles.action, { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: t.radius.pill }]}
        >
          <Text variant="subhead" style={{ color: c.accent, fontFamily: t.typography.headline.fontFamily }}>
            {action.label}
          </Text>
        </PressableScale>
      ) : null}
    </Animated.View>
  );
}

const CARD_PADDING_H = 14;

const styles = StyleSheet.create({
  viewport: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  cardWrap: { width: '100%', maxWidth: 480 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Zone « message » : toute la carte hors bouton d'action (toucher = fermer).
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: CARD_PADDING_H },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 18, lineHeight: 22 },
  texts: { flex: 1, gap: 1 },
  action: { paddingHorizontal: 12, paddingVertical: 8, marginRight: CARD_PADDING_H },
});

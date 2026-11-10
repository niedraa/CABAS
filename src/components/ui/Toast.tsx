/**
 * Système de toasts : `<ToastProvider>` à la racine, puis
 * `const toast = useToast(); toast.show({ title: 'Liste prête !', tone: 'success' })`.
 *
 * Les toasts tombent du haut au ressort, s'empilent (3 max), se ferment
 * seuls (3,5 s par défaut), au toucher, ou via leur action. Chaque toast
 * déclenche le retour haptique de son ton et est annoncé au lecteur d'écran.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, LinearTransition } from 'react-native-reanimated';
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

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

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
      const duration = opts.duration ?? DEFAULT_DURATION;
      if (duration > 0) timers.current.set(id, setTimeout(() => hide(id), duration));
      return id;
    },
    [hide],
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
  return (
    <View
      pointerEvents="box-none"
      style={[styles.viewport, { top: insets.top + t.spacing.sm, zIndex: t.zIndex.toast }]}
    >
      {items.map((item) => (
        <ToastCard key={item.id} item={item} onHide={() => onHide(item.id)} />
      ))}
    </View>
  );
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

  return (
    <Animated.View
      entering={FadeInUp.springify().damping(spring.damping).stiffness(spring.stiffness).mass(spring.mass)}
      exiting={FadeOutUp.duration(t.motion.duration.fast)}
      layout={LinearTransition.springify().damping(spring.damping).stiffness(spring.stiffness)}
      style={styles.cardWrap}
    >
      <PressableScale
        onPress={onHide}
        haptic="none"
        accessibilityRole="alert"
        accessibilityLabel={item.message ? `${item.title}. ${item.message}` : item.title}
        accessibilityHint="Touche pour fermer"
        scaleTo={0.97}
        testID={`toast-${item.id}`}
        style={[
          styles.card,
          { backgroundColor: bg, borderRadius: t.radius.lg, boxShadow: boxShadow('lg', c.shadow) },
        ]}
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
        {item.action ? (
          <PressableScale
            onPress={() => {
              item.action?.onPress();
              onHide();
            }}
            accessibilityLabel={item.action.label}
            hitSlop={8}
            style={[styles.action, { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: t.radius.pill }]}
          >
            <Text variant="subhead" style={{ color: c.accent, fontFamily: t.typography.headline.fontFamily }}>
              {item.action.label}
            </Text>
          </PressableScale>
        ) : null}
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  viewport: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  cardWrap: { width: '100%', maxWidth: 480 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 18, lineHeight: 22 },
  texts: { flex: 1, gap: 1 },
  action: { paddingHorizontal: 12, paddingVertical: 8 },
});

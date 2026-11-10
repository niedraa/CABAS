/**
 * Barre d'onglets personnalisée : pastille « vert tendre » qui glisse sous
 * l'icône active (ressort `springIndicator`), icônes lucide, libellés,
 * pastilles de compteur qui « poppent » quand le nombre change.
 *
 * Compatible avec la prop `tabBar` des onglets expo-router (SDK 58 :
 * `{ state, descriptors, emitter, navigateToTab, insets }`) ET avec la forme
 * historique react-navigation (`{ state, descriptors, navigation }`).
 *
 * ```tsx
 * <Tabs tabBar={(props) => <AnimatedTabBar {...props} icons={{ index: CalendarDays }} />} />
 * ```
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { boxShadow, useTheme } from '@/theme';

import { type IconComponent } from './icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { useSafeInsets } from './useSafeInsets';

/** Sous-ensemble des options d'onglet utilisées ici. */
export interface TabBarOptionsLike {
  title?: string;
  tabBarLabel?: string | ((props: { focused: boolean; color: ColorValue; position: 'below-icon' | 'beside-icon'; children: string }) => React.ReactNode);
  tabBarIcon?: (props: { focused: boolean; color: ColorValue; size: number }) => React.ReactNode;
  tabBarBadge?: number | string;
  tabBarAccessibilityLabel?: string;
  tabBarButtonTestID?: string;
}

export interface TabRouteLike {
  key: string;
  name: string;
  params?: object;
}

/**
 * Émetteur d'événements minimal. Syntaxe « méthode » volontaire : paramètres
 * bivariants pour accepter les émetteurs génériques de react-navigation.
 */
export interface TabEventEmitterLike {
  emit(e: { type: string; target?: string; canPreventDefault?: boolean }): unknown;
}

const isPrevented = (ev: unknown) => !!(ev && (ev as { defaultPrevented?: boolean }).defaultPrevented);

export interface AnimatedTabBarProps {
  state: { index: number; routes: TabRouteLike[] };
  descriptors: Record<string, { options: TabBarOptionsLike }>;
  /** expo-router SDK 58 */
  emitter?: TabEventEmitterLike;
  navigateToTab?: (routeKey: string) => void;
  /** react-navigation (forme historique) */
  navigation?: TabEventEmitterLike & {
    navigate(name: string, params?: object): void;
  };
  insets?: { bottom: number; top?: number; left?: number; right?: number };
  /** Icônes par nom de route (prioritaires sur `tabBarIcon`). */
  icons?: Record<string, IconComponent>;
  /** Barre posée (défaut) ou flottante en pilule. */
  floating?: boolean;
  style?: StyleProp<ViewStyle>;
}

const PILL_W = 60;
const PILL_H = 32;

export function AnimatedTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  navigation,
  insets: insetsProp,
  icons,
  floating = false,
  style,
}: AnimatedTabBarProps) {
  const t = useTheme();
  const c = t.colors;
  const safe = useSafeInsets();
  const bottomInset = insetsProp?.bottom ?? safe.bottom;
  const [width, setWidth] = useState(0);
  const count = Math.max(1, state.routes.length);
  const tabW = width / count;

  const x = useDerivedValue(
    () => withSpring(state.index * tabW + (tabW - PILL_W) / 2, t.motion.springIndicator),
    [state.index, tabW],
  );
  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  const press = (route: TabRouteLike, focused: boolean) => {
    if (emitter) {
      const ev = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !isPrevented(ev)) navigateToTab?.(route.key);
      return;
    }
    if (navigation) {
      const ev = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !isPrevented(ev)) navigation.navigate(route.name, route.params);
    }
  };
  const longPress = (route: TabRouteLike) => {
    if (emitter) emitter.emit({ type: 'tabLongPress', target: route.key });
    else navigation?.emit({ type: 'tabLongPress', target: route.key });
  };

  return (
    <View
      style={[
        floating
          ? {
              position: 'absolute',
              left: t.spacing.lg,
              right: t.spacing.lg,
              bottom: bottomInset + t.spacing.sm,
              borderRadius: t.radius.xl,
              backgroundColor: c.surfaceElevated,
              boxShadow: boxShadow('lg', c.shadow),
            }
          : {
              backgroundColor: c.surface,
              borderTopWidth: StyleSheet.hairlineWidth * 2,
              borderTopColor: c.border,
              paddingBottom: bottomInset,
            },
        style,
      ]}
    >
      <View
        accessibilityRole="tablist"
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[styles.row, { height: t.layout.tabBarHeight }]}
      >
        {width > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pill,
              { backgroundColor: c.primarySoft, borderRadius: t.radius.pill, top: 8 },
              pillStyle,
            ]}
          />
        ) : null}
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key] ?? { options: {} };
          const focused = index === state.index;
          const color = focused ? (t.scheme === 'dark' ? c.text : c.primary) : c.textSecondary;
          const label =
            typeof options.tabBarLabel === 'string' ? options.tabBarLabel : (options.title ?? route.name);
          const Icon = icons?.[route.name];
          const badge = options.tabBarBadge;
          return (
            <PressableScale
              key={route.key}
              testID={options.tabBarButtonTestID}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={
                options.tabBarAccessibilityLabel ??
                (badge !== undefined ? `${label}, ${badge} nouveauté${Number(badge) > 1 ? 's' : ''}` : label)
              }
              haptic="select"
              scaleTo={0.9}
              onPress={() => press(route, focused)}
              onLongPress={() => longPress(route)}
              style={styles.tab}
            >
              <View style={styles.iconBox}>
                {Icon ? (
                  <Icon size={22} color={color as string} strokeWidth={focused ? 2.4 : 2} />
                ) : (
                  options.tabBarIcon?.({ focused, color, size: 22 })
                )}
                {badge !== undefined && badge !== '' ? <TabBadge value={badge} /> : null}
              </View>
              {typeof options.tabBarLabel === 'function' ? (
                options.tabBarLabel({ focused, color, position: 'below-icon', children: label })
              ) : (
                <Text
                  variant="caption"
                  numberOfLines={1}
                  style={{
                    color,
                    fontFamily: focused ? t.typography.headline.fontFamily : t.typography.subhead.fontFamily,
                    fontSize: 11,
                  }}
                >
                  {label}
                </Text>
              )}
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

function TabBadge({ value }: { value: number | string }) {
  const t = useTheme();
  const c = t.colors;
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.set(withSequence(withSpring(1.35, t.motion.springSnappy), withSpring(1, t.motion.springBouncy)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const text = typeof value === 'number' && value > 99 ? '99+' : String(value);
  return (
    <Animated.View
      style={[
        styles.badge,
        { backgroundColor: c.danger, borderColor: c.surface, minWidth: text.length > 1 ? 22 : 18 },
        style,
      ]}
    >
      <Text style={[styles.badgeText, { color: c.onDanger, fontFamily: t.typography.headline.fontFamily }]} allowFontScaling={false}>
        {text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch' },
  pill: { position: 'absolute', left: 0, width: PILL_W, height: PILL_H },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 8, gap: 4 },
  iconBox: { height: PILL_H, width: PILL_W, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -2,
    right: 8,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, lineHeight: 12 },
});

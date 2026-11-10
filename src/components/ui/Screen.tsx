/**
 * Squelette d'écran : fond, zone sûre, défilement, marges latérales
 * (`spacing.screen`), largeur max (tablette / web), réserve pour la barre
 * d'onglets, et grand titre qui se replie dans la barre supérieure au
 * défilement (comme iOS, mais au ressort de la DA).
 */
import React from 'react';
import {
  StyleSheet,
  View,
  type RefreshControlProps,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';

import { useTheme, type ColorScheme } from '@/theme';

import { Text } from './Text';
import { TopBar } from './TopBar';
import { useSafeInsets } from './useSafeInsets';

export interface ScreenProps {
  children?: React.ReactNode;
  /** Grand titre (repliable). */
  title?: string;
  /** Surtitre au-dessus du grand titre (« Semaine du 10 nov. »). */
  eyebrow?: string;
  subtitle?: string;
  onBack?: () => void;
  backIcon?: 'back' | 'close';
  headerRight?: React.ReactNode;
  /** Contenu défilant (défaut true). */
  scroll?: boolean;
  /** Marges latérales `spacing.screen` (défaut true). */
  padded?: boolean;
  background?: keyof ColorScheme;
  /** Réserve en bas : barre d'onglets, zone sûre seule, ou rien. */
  bottomInset?: 'tabBar' | 'safe' | 'none';
  /** Élément collé en bas (CTA), au-dessus de la zone sûre. */
  footer?: React.ReactNode;
  /** Élément placé avant le contenu, sans marges (bandeau héros). */
  hero?: React.ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollProps?: Omit<ScrollViewProps, 'children' | 'contentContainerStyle' | 'refreshControl' | 'onScroll'>;
  testID?: string;
}

const LARGE_TITLE_COLLAPSE = 56;

export function Screen({
  children,
  title,
  eyebrow,
  subtitle,
  onBack,
  backIcon,
  headerRight,
  scroll = true,
  padded = true,
  background = 'background',
  bottomInset = 'safe',
  footer,
  hero,
  refreshControl,
  contentContainerStyle,
  scrollProps,
  testID,
}: ScreenProps) {
  const t = useTheme();
  const insets = useSafeInsets();
  const scrollY = useSharedValue(0);
  const hasTopBar = !!(title || onBack || headerRight);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });
  const reveal = useDerivedValue(() =>
    interpolate(scrollY.get(), [0, LARGE_TITLE_COLLAPSE], [0, 1], Extrapolation.CLAMP),
  );
  // Le grand titre s'estompe et rapetisse légèrement en remontant.
  const largeTitleStyle = useAnimatedStyle(() => {
    const y = scrollY.get();
    return {
      opacity: interpolate(y, [0, LARGE_TITLE_COLLAPSE * 0.9], [1, 0], Extrapolation.CLAMP),
      transform: [
        { scale: interpolate(y, [-120, 0, LARGE_TITLE_COLLAPSE], [1.08, 1, 0.94], Extrapolation.CLAMP) },
        { translateY: interpolate(y, [-120, 0], [10, 0], Extrapolation.CLAMP) },
      ],
    };
  });

  const bottomPad =
    bottomInset === 'tabBar'
      ? t.layout.tabBarHeight + insets.bottom + t.spacing.xxl
      : bottomInset === 'safe'
        ? insets.bottom + t.spacing.xxl
        : 0;
  const hPad = padded ? t.spacing.screen : 0;

  const largeTitle = title ? (
    <Animated.View style={[styles.largeTitle, { paddingHorizontal: hPad, transformOrigin: 'left' }, largeTitleStyle]}>
      {eyebrow ? (
        <Text variant="overline" color="textSecondary" style={styles.eyebrow}>
          {eyebrow}
        </Text>
      ) : null}
      <Text variant="title1" accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? (
        <Text variant="callout" color="textSecondary" style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </Animated.View>
  ) : null;

  const inner = (
    <View style={[styles.column, { maxWidth: t.layout.maxContentWidth }]}>
      {hero}
      {largeTitle}
      <View style={[{ paddingHorizontal: hPad, flexGrow: scroll ? 0 : 1 }, contentContainerStyle]}>{children}</View>
    </View>
  );

  return (
    <View testID={testID} style={[styles.root, { backgroundColor: t.colors[background] }]}>
      {hasTopBar ? (
        <TopBar
          withSafeArea
          title={title}
          onBack={onBack}
          backIcon={backIcon}
          right={headerRight}
          revealProgress={title ? reveal : undefined}
          style={{ backgroundColor: t.colors[background], zIndex: t.zIndex.sticky }}
        />
      ) : (
        <View style={{ height: insets.top }} />
      )}
      {scroll ? (
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          refreshControl={refreshControl}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: footer ? t.spacing.xxl : bottomPad, flexGrow: 1 }}
          {...scrollProps}
        >
          {inner}
        </Animated.ScrollView>
      ) : (
        <View style={[styles.flex, { paddingBottom: footer ? 0 : bottomPad }]}>{inner}</View>
      )}
      {footer ? (
        <View
          style={[
            styles.footer,
            {
              paddingHorizontal: hPad,
              paddingTop: t.spacing.md,
              paddingBottom: bottomInset === 'tabBar' ? bottomPad - t.spacing.xxl + t.spacing.md : insets.bottom + t.spacing.md,
              backgroundColor: t.colors[background],
              borderTopColor: t.colors.border,
            },
          ]}
        >
          <View style={[styles.column, { maxWidth: t.layout.maxContentWidth }]}>{footer}</View>
        </View>
      ) : null}
    </View>
  );
}


const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  column: { width: '100%', alignSelf: 'center', flexGrow: 1 },
  largeTitle: { paddingTop: 4, paddingBottom: 16 },
  eyebrow: { marginBottom: 4 },
  subtitle: { marginTop: 6 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth * 2 },
});

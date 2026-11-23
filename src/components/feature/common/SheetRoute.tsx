/**
 * Route présentée en feuille : en natif, la route est déjà une `formSheet`
 * (voir `rootScreenOptionsFor`) ; sur le web, fond transparent + `Sheet` du
 * kit (l'écran précédent reste visible). `useSheetRouteClose()` ferme la
 * feuille avec son animation puis revient en arrière.
 */
import { router, Stack, type Href } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Sheet, Text } from '@/components/ui';
import { useTheme } from '@/theme';

const IS_WEB = Platform.OS === 'web';

export function useSheetRouteClose(fallback: Href = '/' as Href) {
  const t = useTheme();
  const [visible, setVisible] = useState(true);
  const leaving = useRef(false);
  const leave = () => (router.canGoBack() ? router.back() : router.replace(fallback));
  const close = () => {
    if (leaving.current) return;
    leaving.current = true;
    if (!IS_WEB) {
      leave();
      return;
    }
    setVisible(false);
    setTimeout(leave, t.motion.duration.base + 40);
  };
  return { visible, close };
}

export interface SheetRouteProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  testID?: string;
}

export function SheetRoute({ visible, onClose, title, subtitle, footer, children, testID }: SheetRouteProps) {
  const t = useTheme();
  if (!IS_WEB) {
    return (
      <View style={[styles.root, { backgroundColor: t.colors.surfaceElevated }]} testID={testID}>
        <ScrollView contentContainerStyle={{ padding: t.spacing.xl, paddingBottom: t.spacing.huge }} keyboardShouldPersistTaps="handled">
          <View style={{ marginBottom: t.spacing.lg }}>
            <Text variant="title3" accessibilityRole="header">
              {title}
            </Text>
            {subtitle ? (
              <Text variant="footnote" color="textSecondary">
                {subtitle}
              </Text>
            ) : null}
          </View>
          {children}
        </ScrollView>
        {footer ? <View style={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxl }}>{footer}</View> : null}
      </View>
    );
  }
  return (
    <View style={styles.transparent} pointerEvents="box-none">
      <Stack.Screen options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
      <Sheet visible={visible} onClose={onClose} title={title} subtitle={subtitle} snapPoints={[0.88]} scrollable footer={footer} testID={testID}>
        {children}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  transparent: { flex: 1, backgroundColor: 'transparent' },
});

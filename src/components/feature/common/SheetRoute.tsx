/**
 * Route présentée en feuille : en natif, modale plein écran avec bouton
 * « fermer » (voir `rootScreenOptionsFor`) ; sur le web, fond transparent + `Sheet` du
 * kit (l'écran précédent reste visible). `useSheetRouteClose()` ferme la
 * feuille avec son animation puis revient en arrière.
 */
import { router, Stack, type Href } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Screen, Sheet } from '@/components/ui';
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
  if (!IS_WEB) {
    // Natif : la route est une modale plein écran (voir `rootScreenOptionsFor`).
    return (
      <Screen title={title} subtitle={subtitle} onBack={onClose} backIcon="close" bottomInset="safe" footer={footer} testID={testID}>
        {children}
      </Screen>
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
  transparent: { flex: 1, backgroundColor: 'transparent' },
});

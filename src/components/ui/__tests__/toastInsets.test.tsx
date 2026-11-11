import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button, ToastProvider, useToast } from '@/components/ui';

// iPhone à encoche : marge haute de la FENÊTRE = 59 pt.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  initialWindowMetrics: {
    frame: { x: 0, y: 0, width: 393, height: 852 },
    insets: { top: 59, bottom: 34, left: 0, right: 0 },
  },
}));

type Node = { type: string; props: Record<string, any>; children?: (Node | string)[] | null };
function findOverlay(node: unknown): Node | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findOverlay(n);
      if (found) return found;
    }
    return null;
  }
  const n = node as Node;
  if (n.type === 'RNSFullWindowOverlay') return n;
  return findOverlay(n.children ?? null);
}

function Harness() {
  const toast = useToast();
  return <Button label="Montrer" onPress={() => toast.show({ title: 'Aucun abonnement trouvé', duration: 0 })} />;
}

it('iOS : dans un écran modal (marge haute 0), le toast reste sous la barre d’état', async () => {
  await render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 393, height: 800 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } }}
    >
      <ToastProvider>
        <Harness />
      </ToastProvider>
    </SafeAreaProvider>,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Montrer' }));
  const overlay = findOverlay(screen.toJSON());
  expect(overlay).toBeTruthy();
  const viewport = overlay!.children![0] as Node;
  const top = StyleSheet.flatten(viewport.props.style).top as number;
  expect(top).toBeGreaterThanOrEqual(59);
});

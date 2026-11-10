import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { AnimatedTabBar, Button, ConfirmDialog, Sheet, ToastProvider, useToast } from '@/components/ui';

function ToastHarness({ duration }: { duration?: number }) {
  const toast = useToast();
  return (
    <Button
      label="Montrer"
      onPress={() =>
        toast.show({
          title: 'Liste prête',
          message: '24 articles',
          tone: 'success',
          duration,
          action: { label: 'Voir', onPress: onAction },
        })
      }
    />
  );
}
const onAction = jest.fn();

describe('Toast', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('s’affiche puis disparaît automatiquement', async () => {
    await render(
      <ToastProvider>
        <ToastHarness duration={2000} />
      </ToastProvider>,
    );
    expect(screen.queryByText('Liste prête')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Montrer' }));
    expect(screen.getByText('Liste prête')).toBeTruthy();
    expect(screen.getByText('24 articles')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(1999);
    });
    expect(screen.queryByText('Liste prête')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(2);
    });
    expect(screen.queryByText('Liste prête')).toBeNull();
  });

  it('se ferme au toucher et exécute son action', async () => {
    await render(
      <ToastProvider>
        <ToastHarness duration={0} />
      </ToastProvider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Montrer' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Voir' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Liste prête')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Montrer' }));
    await fireEvent.press(screen.getByRole('alert', { name: 'Liste prête. 24 articles' }));
    expect(screen.queryByText('Liste prête')).toBeNull();
  });

  it('empile au plus 3 toasts', async () => {
    await render(
      <ToastProvider>
        <ToastHarness duration={0} />
      </ToastProvider>,
    );
    for (let i = 0; i < 5; i++) await fireEvent.press(screen.getByRole('button', { name: 'Montrer' }));
    expect(screen.getAllByText('Liste prête')).toHaveLength(3);
  });
});

describe('Sheet', () => {
  it('s’ouvre, se ferme via le voile et se démonte', async () => {
    const onClose = jest.fn();
    const { rerender } = await render(
      <Sheet visible={false} onClose={onClose} title="Remplacer le plat">
        <Button label="Curry" onPress={() => undefined} />
      </Sheet>,
    );
    expect(screen.queryByText('Remplacer le plat')).toBeNull();

    await rerender(
      <Sheet visible onClose={onClose} title="Remplacer le plat" testID="s">
        <Button label="Curry" onPress={() => undefined} />
      </Sheet>,
    );
    expect(screen.getByRole('header', { name: 'Remplacer le plat' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Curry' })).toBeTruthy();

    await fireEvent.press(screen.getByTestId('s-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);

    await rerender(
      <Sheet visible={false} onClose={onClose} title="Remplacer le plat" testID="s">
        <Button label="Curry" onPress={() => undefined} />
      </Sheet>,
    );
    expect(screen.queryByText('Remplacer le plat')).toBeNull();
  });

  it('bouton fermer et mode non-fermable', async () => {
    const onClose = jest.fn();
    const { rerender } = await render(<Sheet visible onClose={onClose} title="Filtres" />);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Fermer' }).at(-1)!);
    expect(onClose).toHaveBeenCalledTimes(1);

    await rerender(<Sheet visible onClose={onClose} title="Filtres" dismissible={false} testID="nd" />);
    await fireEvent.press(screen.getByTestId('nd-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ConfirmDialog', () => {
  it('confirme ou annule', async () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    await render(
      <ConfirmDialog visible title="Vider ta liste ?" onConfirm={onConfirm} onClose={onClose} destructive confirmLabel="Vider" />,
    );
    expect(screen.getByRole('header', { name: 'Vider ta liste ?' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Vider' }));
    expect(onConfirm).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Annuler' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('AnimatedTabBar', () => {
  const state = { index: 0, routes: [{ key: 'a', name: 'index' }, { key: 'b', name: 'liste' }] };
  const descriptors = {
    a: { options: { title: 'Semaine' } },
    b: { options: { title: 'Liste', tabBarBadge: 3 } },
  };

  it('forme expo-router : émet tabPress puis navigue', async () => {
    const emit = jest.fn(() => ({ defaultPrevented: false }));
    const navigateToTab = jest.fn();
    await render(<AnimatedTabBar state={state} descriptors={descriptors} emitter={{ emit }} navigateToTab={navigateToTab} />);
    expect(screen.getByRole('tab', { name: 'Semaine' })).toBeSelected();
    await fireEvent.press(screen.getByRole('tab', { name: 'Liste, 3 nouveautés' }));
    expect(emit).toHaveBeenCalledWith({ type: 'tabPress', target: 'b', canPreventDefault: true });
    expect(navigateToTab).toHaveBeenCalledWith('b');
    // Onglet déjà actif : pas de navigation.
    await fireEvent.press(screen.getByRole('tab', { name: 'Semaine' }));
    expect(navigateToTab).toHaveBeenCalledTimes(1);
  });

  it('forme react-navigation : respecte preventDefault', async () => {
    const navigate = jest.fn();
    const emit = jest.fn(() => ({ defaultPrevented: true }));
    await render(<AnimatedTabBar state={state} descriptors={descriptors} navigation={{ emit, navigate }} />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Liste, 3 nouveautés' }));
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByText('3')).toBeTruthy();
  });
});

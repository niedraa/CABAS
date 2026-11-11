import React, { useState } from 'react';
import { AccessibilityInfo, Keyboard, Platform } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import { AnimatedTabBar, Button, ConfirmDialog, Dialog, Sheet, ToastProvider, useToast } from '@/components/ui';

import { toastDuration } from '../Toast';
import { __resetPresentationForTests } from '../presentation';

/** Laisse passer les fins d'animation (callbacks Reanimated simulés en microtâches). */
const flush = () => act(async () => undefined);

afterEach(() => __resetPresentationForTests());

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

  it('bouton d’action distinct du message (atteignable au lecteur d’écran)', async () => {
    await render(
      <ToastProvider>
        <ToastHarness duration={0} />
      </ToastProvider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Montrer' }));
    const alert = screen.getByRole('alert', { name: 'Liste prête. 24 articles' });
    // Le bouton n'est plus imbriqué dans l'élément « alerte » (qui masquerait ses enfants à VoiceOver).
    expect(within(alert).queryByRole('button', { name: 'Voir' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Voir' })).toBeTruthy();
  });

  it('lecteur d’écran actif : un toast avec action reste jusqu’à sa fermeture', async () => {
    expect(toastDuration({ action: { label: 'Annuler', onPress: jest.fn() } }, true)).toBe(0);
    expect(toastDuration({ action: { label: 'Annuler', onPress: jest.fn() } }, false)).toBe(3500);
    expect(toastDuration({ duration: 2000 }, true)).toBe(2000);

    jest.mocked(AccessibilityInfo.isScreenReaderEnabled).mockResolvedValueOnce(true);
    await render(
      <ToastProvider>
        <ToastHarness duration={2000} />
      </ToastProvider>,
    );
    await flush();
    await fireEvent.press(screen.getByRole('button', { name: 'Montrer' }));
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Liste prête')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Voir' }));
    expect(screen.queryByText('Liste prête')).toBeNull();
  });

  it('web : react-native-web répond toujours « lecteur actif », le toast se ferme quand même', async () => {
    const os = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    const screenReader = jest.mocked(AccessibilityInfo.isScreenReaderEnabled);
    const original = screenReader.getMockImplementation();
    screenReader.mockResolvedValue(true);
    try {
      await render(
        <ToastProvider>
          <ToastHarness duration={2000} />
        </ToastProvider>,
      );
      await flush();
      await fireEvent.press(screen.getByRole('button', { name: 'Montrer' }));
      await act(async () => {
        jest.advanceTimersByTime(2001);
      });
      expect(screen.queryByText('Liste prête')).toBeNull();
    } finally {
      if (original) screenReader.mockImplementation(original);
      else screenReader.mockReset();
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
    }
  });

  it('iOS : rendu dans une FullWindowOverlay (au-dessus des modales), retirée après le dernier toast', async () => {
    await render(
      <ToastProvider>
        <ToastHarness duration={1000} />
      </ToastProvider>,
    );
    const overlay = () => JSON.stringify(screen.toJSON()).includes('RNSFullWindowOverlay');
    expect(overlay()).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Montrer' }));
    expect(overlay()).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Liste prête')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(overlay()).toBe(false);
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

describe('Dialog : enchaînement et fin de fermeture', () => {
  function DeleteFlow({ onExited }: { onExited?: () => void }) {
    const [step, setStep] = useState<'first' | 'second' | 'closed'>('first');
    return (
      <>
        <ConfirmDialog
          visible={step === 'first'}
          onClose={() => setStep('closed')}
          onConfirm={() => setStep('second')}
          onExited={onExited}
          title="Supprimer ton compte ?"
          confirmLabel="Continuer"
          testID="d1"
        />
        <Dialog visible={step === 'second'} onClose={() => setStep('closed')} title="C’est définitif" testID="d2" />
      </>
    );
  }

  it('iOS : la seconde confirmation attend que la première soit refermée côté natif', async () => {
    expect(Platform.OS).toBe('ios');
    const onExited = jest.fn();
    await render(<DeleteFlow onExited={onExited} />);
    // Présentation native terminée (UIKit → onShow).
    await fireEvent(screen.getByTestId('d1'), 'show');
    const nativeDismiss = screen.getByTestId('d1').props.onDismiss as () => void;

    await fireEvent.press(screen.getByRole('button', { name: 'Continuer' }));
    await flush();
    // Première Modal masquée, fermeture native en cours : la seconde ne se présente pas encore.
    expect(screen.queryByText('Supprimer ton compte ?')).toBeNull();
    expect(screen.queryByText('C’est définitif')).toBeNull();
    expect(onExited).not.toHaveBeenCalled();

    await act(async () => nativeDismiss());
    expect(onExited).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('header', { name: 'C’est définitif' })).toBeTruthy();
  });

  it('iOS : `onDismiss` perdu → démontage au délai de sécurité, la suite s’affiche', async () => {
    // Microtâches réelles : fins d'animation simulées par Reanimated.
    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
    try {
      await render(<DeleteFlow />);
      await fireEvent(screen.getByTestId('d1'), 'show');
      await fireEvent.press(screen.getByRole('button', { name: 'Continuer' }));
      await flush();
      expect(screen.queryByText('C’est définitif')).toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.getByRole('header', { name: 'C’est définitif' })).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('jamais présentée côté natif : `onExited` dès la fin de la sortie', async () => {
    const onExited = jest.fn();
    const { rerender } = await render(<Dialog visible title="Info" onClose={jest.fn()} onExited={onExited} />);
    expect(screen.getByRole('header', { name: 'Info' })).toBeTruthy();
    await rerender(<Dialog visible={false} title="Info" onClose={jest.fn()} onExited={onExited} />);
    await flush();
    expect(screen.queryByText('Info')).toBeNull();
    expect(onExited).toHaveBeenCalledTimes(1);
  });

  it('Android : pas d’attente (plusieurs Modal y coexistent)', async () => {
    const os = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    try {
      await render(<DeleteFlow />);
      await fireEvent(screen.getByTestId('d1'), 'show');
      await fireEvent.press(screen.getByRole('button', { name: 'Continuer' }));
      expect(screen.getByRole('header', { name: 'C’est définitif' })).toBeTruthy();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
    }
  });

  it('iOS : une Sheet ouverte pendant la fermeture d’un Dialog attend son tour', async () => {
    function DialogThenSheet() {
      const [step, setStep] = useState<'dialog' | 'sheet'>('dialog');
      return (
        <>
          <ConfirmDialog visible={step === 'dialog'} onClose={jest.fn()} onConfirm={() => setStep('sheet')} title="Vider ?" testID="dlg" />
          <Sheet visible={step === 'sheet'} onClose={jest.fn()} title="Filtres" />
        </>
      );
    }
    await render(<DialogThenSheet />);
    await fireEvent(screen.getByTestId('dlg'), 'show');
    const nativeDismiss = screen.getByTestId('dlg').props.onDismiss as () => void;
    await fireEvent.press(screen.getByRole('button', { name: 'Confirmer' }));
    await flush();
    expect(screen.queryByText('Filtres')).toBeNull();
    await act(async () => nativeDismiss());
    expect(screen.getByRole('header', { name: 'Filtres' })).toBeTruthy();
  });
});

describe('Sheet : clavier Android', () => {
  it('Android : suit la hauteur du clavier (fenêtre edge-to-edge) ; iOS : KeyboardAvoidingView seul', async () => {
    const spy = jest.spyOn(Keyboard, 'addListener');
    const os = Platform.OS;
    try {
      const { unmount } = await render(<Sheet visible onClose={jest.fn()} title="Ajouter une dépense" />);
      expect(spy.mock.calls.map((c) => c[0])).not.toContain('keyboardDidShow');
      await unmount();
      spy.mockClear();

      Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
      const { rerender } = await render(<Sheet visible onClose={jest.fn()} title="Ajouter une dépense" />);
      const events = spy.mock.calls.map((c) => c[0]);
      expect(events).toEqual(expect.arrayContaining(['keyboardDidShow', 'keyboardDidHide']));
      const subs = spy.mock.results.map((r) => r.value as { remove: () => void });
      const removes = subs.map((sub) => jest.spyOn(sub, 'remove'));
      await rerender(<Sheet visible={false} onClose={jest.fn()} title="Ajouter une dépense" />);
      for (const remove of removes) expect(remove).toHaveBeenCalled();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
      spy.mockRestore();
    }
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

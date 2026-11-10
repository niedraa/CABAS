import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button, Checkbox, ChipGroup, SegmentedControl, Stepper, Switch, TextField, type ChipOption } from '@/components/ui';

describe('Button', () => {
  it('rend le libellé et déclenche onPress', async () => {
    const onPress = jest.fn();
    await render(<Button label="Générer ma semaine" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Générer ma semaine' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("n'appelle pas onPress quand désactivé ou en chargement", async () => {
    const onPress = jest.fn();
    await render(
      <>
        <Button label="Off" disabled onPress={onPress} />
        <Button label="Busy" loading onPress={onPress} />
      </>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Off' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Busy' }));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Busy' })).toBeBusy();
    expect(screen.getByRole('button', { name: 'Busy' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Off' })).toBeDisabled();
  });

  it('applique bien l’opacité « désactivé » (non écrasée par l’animation)', async () => {
    await render(<Button label="Off" disabled onPress={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Off' })).toHaveStyle({ opacity: 0.45 });
  });
});

function StepperHarness({ initial = 2, min = 1, max = 3 }: { initial?: number; min?: number; max?: number }) {
  const [v, setV] = useState(initial);
  return <Stepper value={v} onChange={setV} min={min} max={max} accessibilityLabel="Adultes" testID="st" />;
}

describe('Stepper', () => {
  it('incrémente et décrémente dans les bornes', async () => {
    await render(<StepperHarness />);
    expect(screen.getByTestId('st-value')).toHaveTextContent('2');
    await fireEvent.press(screen.getByTestId('st-inc'));
    expect(screen.getByTestId('st-value')).toHaveTextContent('3');
    // Borne haute atteinte : le bouton + est désactivé, la valeur ne bouge plus.
    expect(screen.getByTestId('st-inc')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('st-inc'));
    expect(screen.getByTestId('st-value')).toHaveTextContent('3');
    await fireEvent.press(screen.getByTestId('st-dec'));
    await fireEvent.press(screen.getByTestId('st-dec'));
    expect(screen.getByTestId('st-value')).toHaveTextContent('1');
    expect(screen.getByTestId('st-dec')).toBeDisabled();
  });

  it('respecte le pas et expose une valeur accessible', async () => {
    const onChange = jest.fn();
    await render(<Stepper value={4} step={2} min={0} max={10} onChange={onChange} accessibilityLabel="Portions" testID="p" />);
    await fireEvent.press(screen.getByTestId('p-inc'));
    expect(onChange).toHaveBeenLastCalledWith(6);
    const adjustable = screen.getByTestId('p');
    expect(adjustable.props.accessibilityRole).toBe('adjustable');
    expect(adjustable.props.accessibilityValue).toEqual({ min: 0, max: 10, now: 4, text: '4' });
  });

  it('répond aux actions d’accessibilité increment / decrement', async () => {
    const onChange = jest.fn();
    await render(<Stepper value={1} min={1} max={5} onChange={onChange} accessibilityLabel="Enfants" testID="a" />);
    await fireEvent(screen.getByTestId('a'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith(2);
    await fireEvent(screen.getByTestId('a'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    // Déjà au minimum : aucun changement.
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

type Diet = 'vege' | 'halal' | 'gluten';
const OPTIONS: ChipOption<Diet>[] = [
  { value: 'vege', label: 'Végétarien' },
  { value: 'halal', label: 'Halal' },
  { value: 'gluten', label: 'Sans gluten' },
];

function MultiHarness({ max }: { max?: number }) {
  const [v, setV] = useState<Diet[]>(['vege']);
  return <ChipGroup mode="multi" options={OPTIONS} value={v} onChange={setV} max={max} testID="g" />;
}

describe('ChipGroup', () => {
  it('ajoute et retire en sélection multiple', async () => {
    await render(<MultiHarness />);
    expect(screen.getByRole('checkbox', { name: 'Végétarien' })).toBeChecked();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Halal' }));
    expect(screen.getByRole('checkbox', { name: 'Halal' })).toBeChecked();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Végétarien' }));
    expect(screen.getByRole('checkbox', { name: 'Végétarien' })).not.toBeChecked();
  });

  it('respecte le maximum de choix', async () => {
    await render(<MultiHarness max={1} />);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Halal' }));
    expect(screen.getByRole('checkbox', { name: 'Halal' })).not.toBeChecked();
  });

  it('sélection unique : un seul choix, rôle radio', async () => {
    const onChange = jest.fn();
    await render(<ChipGroup mode="single" options={OPTIONS} value="halal" onChange={onChange} />);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    await fireEvent.press(screen.getByRole('radio', { name: 'Halal' }));
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('radio', { name: 'Sans gluten' }));
    expect(onChange).toHaveBeenCalledWith('gluten');
  });
});

describe('Checkbox', () => {
  function Harness() {
    const [c, setC] = useState(false);
    return <Checkbox checked={c} onChange={setC} label="Tomates" strikeWhenChecked />;
  }
  it('bascule et expose l’état coché', async () => {
    await render(<Harness />);
    const box = screen.getByRole('checkbox', { name: 'Tomates' });
    expect(box).not.toBeChecked();
    await fireEvent.press(box);
    expect(screen.getByRole('checkbox', { name: 'Tomates' })).toBeChecked();
    expect(screen.getByText('Tomates')).toHaveStyle({ textDecorationLine: 'line-through' });
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Tomates' }));
    expect(screen.getByRole('checkbox', { name: 'Tomates' })).not.toBeChecked();
  });

  it('ne bascule pas quand désactivée', async () => {
    const onChange = jest.fn();
    await render(<Checkbox checked={false} onChange={onChange} label="Inactif" disabled />);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Inactif' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Switch & SegmentedControl', () => {
  it('Switch inverse la valeur', async () => {
    const onValueChange = jest.fn();
    await render(<Switch value={false} onValueChange={onValueChange} accessibilityLabel="Rappels" />);
    const sw = screen.getByRole('switch', { name: 'Rappels' });
    expect(sw).not.toBeChecked();
    await fireEvent.press(sw);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('SegmentedControl signale le segment choisi', async () => {
    const onChange = jest.fn();
    await render(
      <SegmentedControl
        options={[
          { value: 'a', label: 'Le moins cher' },
          { value: 'b', label: 'Un seul magasin' },
        ]}
        value="a"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Le moins cher' })).toBeSelected();
    await fireEvent.press(screen.getByRole('tab', { name: 'Le moins cher' }));
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('tab', { name: 'Un seul magasin' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('TextField', () => {
  it('affiche l’erreur et efface la saisie', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Budget" value="12" onChangeText={onChangeText} clearable error="Trop bas" />);
    expect(screen.getByText('Trop bas')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Effacer' }));
    expect(onChangeText).toHaveBeenCalledWith('');
  });

  it("n'affiche pas le bouton effacer pour un champ vide", async () => {
    await render(<TextField label="Nom" value="" onChangeText={() => undefined} clearable helper="Aide" />);
    expect(screen.queryByRole('button', { name: 'Effacer' })).toBeNull();
    expect(screen.getByText('Aide')).toBeTruthy();
  });
});

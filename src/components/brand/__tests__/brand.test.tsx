import React from 'react';
import { render, screen } from '@testing-library/react-native';

import {
  CabasLogo,
  Celebration,
  CircleDecor,
  CookingPot,
  EmptyBasket,
  EmptyList,
  Produce,
  ProduceSet,
  ReceiptCard,
  ReceiptEdge,
  TAGLINE,
  basketBodyWithHoles,
  basketGeometry,
  receiptEdgePath,
} from '@/components/brand';
import { Text } from '@/components/ui';
import { ThemeProvider } from '@/theme';

describe('CabasLogo', () => {
  it('se rend dans chaque variante avec un nom accessible', async () => {
    await render(
      <>
        <CabasLogo variant="color" />
        <CabasLogo variant="mono" withWordmark />
        <CabasLogo variant="reversed" withWordmark withTagline />
      </>,
    );
    expect(screen.getAllByLabelText('Cabas')).toHaveLength(2);
    expect(screen.getByLabelText(`Cabas. ${TAGLINE}`)).toBeTruthy();
    expect(screen.getAllByText('Cabas')).toHaveLength(2);
    expect(screen.getByText(TAGLINE)).toBeTruthy();
  });

  it('choisit automatiquement la variante inversée en sombre', async () => {
    await render(
      <ThemeProvider preference="dark">
        <CabasLogo withWordmark />
      </ThemeProvider>,
    );
    expect(screen.getByText('Cabas')).toHaveStyle({ color: '#F3EEE3' });
  });

  it('géométrie : 3 fentes ajourées dans la version mono', () => {
    expect(basketGeometry.slots).toHaveLength(3);
    // 1 sous-tracé pour le corps + 3 pour les fentes.
    expect(basketBodyWithHoles.match(/M/g)).toHaveLength(4);
  });
});

describe('ReceiptEdge', () => {
  it('construit des dents régulières qui couvrent toute la largeur', () => {
    const d = receiptEdgePath(140, 14, 7, 'bottom');
    expect(d.startsWith('M0 0')).toBe(true);
    // 10 dents → 20 segments « L ».
    expect(d.match(/L/g)).toHaveLength(20);
    expect(d).toContain('L140.00 0');
    const up = receiptEdgePath(100, 14, 7, 'top');
    expect(up.startsWith('M0 7')).toBe(true);
    expect(receiptEdgePath(5, 14, 7, 'bottom').match(/L/g)).toHaveLength(2);
  });

  it('ReceiptCard rend son contenu et son en-tête', async () => {
    await render(
      <ReceiptCard header="Ticket" edges="both">
        <Text>Total</Text>
        <ReceiptEdge />
      </ReceiptCard>,
    );
    expect(screen.getByText('Ticket')).toBeTruthy();
    expect(screen.getByText('Total')).toBeTruthy();
  });
});

describe('Illustrations & décor', () => {
  it('se rendent sans erreur, décoratives par défaut', async () => {
    await render(
      <>
        <CircleDecor />
        <CircleDecor tone="paper" placement="both" />
        <EmptyBasket />
        <EmptyList size={80} />
        <CookingPot accessibilityLabel="Marmite" />
        <ProduceSet />
        {(['leaf', 'carrot', 'tomato', 'baguette', 'lemon'] as const).map((k) => (
          <Produce key={k} kind={k} size={40} />
        ))}
      </>,
    );
    expect(screen.getByLabelText('Marmite')).toBeTruthy();
  });

  it('Celebration appelle onDone et se rejoue', async () => {
    const onDone = jest.fn();
    const { rerender } = await render(<Celebration playKey={1} onDone={onDone} haptic={false} />);
    expect(screen.getByLabelText('Bravo !')).toBeTruthy();
    expect(onDone).toHaveBeenCalledTimes(1);
    await rerender(<Celebration playKey={2} onDone={onDone} haptic={false} />);
    expect(onDone).toHaveBeenCalledTimes(2);
  });
});

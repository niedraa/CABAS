import React from 'react';
import { render, screen } from '@testing-library/react-native';

import {
  AnimatedPrice,
  Badge,
  EmptyState,
  KeyValueRow,
  PriceTag,
  ProgressBar,
  RecipeThumb,
  STORE_MONOGRAMS,
  StoreBadge,
  StoreBadgeStack,
  storeStackLabel,
  Text,
  pastelFor,
} from '@/components/ui';
import { STORE_CHAIN_LABELS, STORE_CHAINS } from '@/core';
import { formatCents, formatDiscount, initialsOf, splitCents } from '@/lib/format';
import { formatPrice } from '@/core/money';
import { ThemeProvider, darkColors, lightColors } from '@/theme';

const NNBSP = ' ';

describe('formatCents (lib/format)', () => {
  it('formate en français avec espace fine insécable', () => {
    expect(formatCents(499)).toBe(`4,99${NNBSP}€`);
    expect(formatCents(5)).toBe(`0,05${NNBSP}€`);
    expect(formatCents(123450)).toBe(`1${NNBSP}234,50${NNBSP}€`);
    expect(formatCents(-200)).toBe(`−2,00${NNBSP}€`);
    expect(formatCents(500, { compact: true })).toBe(`5${NNBSP}€`);
    expect(formatCents(250, { signed: true })).toBe(`+2,50${NNBSP}€`);
    expect(formatCents(250, { hideCurrency: true })).toBe('2,50');
    expect(formatCents(Number.NaN)).toBe(`0,00${NNBSP}€`);
  });

  it('est identique à core/money.formatPrice', () => {
    for (const c of [0, 1, 9, 10, 99, 100, 499, 1000, 99999, 100000, 1234567, -1, -499, -100000]) {
      expect(formatCents(c)).toBe(formatPrice(c));
      expect(formatCents(c, { compact: true })).toBe(formatPrice(c, { compact: true }));
      expect(formatCents(c, { signed: true })).toBe(formatPrice(c, { signed: true }));
    }
  });

  it('décompose, calcule la remise et les initiales', () => {
    expect(splitCents(4299)).toEqual({ sign: '', euros: '42', decimals: '99' });
    expect(formatDiscount(399, 349)).toBe(`−13${NNBSP}%`);
    expect(formatDiscount(399, 399)).toBe('');
    expect(initialsOf('Camille Martin')).toBe('CM');
    expect(initialsOf('léo')).toBe('L');
    expect(initialsOf('  ')).toBe('?');
  });
});

describe('PriceTag', () => {
  it('affiche le prix formaté et un libellé accessible', async () => {
    await render(<PriceTag cents={499} testID="p" />);
    expect(screen.getByText(`4,99${NNBSP}€`)).toBeTruthy();
    expect(screen.getByTestId('p')).toHaveAccessibleName('4 euros 99');
  });

  it('barre l’ancien prix, affiche la remise, le prix au kilo et « meilleur prix »', async () => {
    await render(<PriceTag cents={349} oldCents={399} perUnit={{ cents: 698, unit: 'kg' }} best testID="p" />);
    expect(screen.getByText(`3,99${NNBSP}€`)).toHaveStyle({ textDecorationLine: 'line-through' });
    expect(screen.getByText(`−13${NNBSP}%`)).toBeTruthy();
    expect(screen.getByText(`6,98${NNBSP}€/kg`)).toBeTruthy();
    expect(screen.getByText('Meilleur prix')).toBeTruthy();
    expect(screen.getByTestId('p')).toHaveAccessibleName(
      `3 euros 49 au lieu de 3 euros 99, meilleur prix, soit 6,98${NNBSP}€/kg`,
    );
  });

  it('style étiquette : euros et centimes séparés en grande taille', async () => {
    await render(<PriceTag cents={4299} size="xl" />);
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText(`,99${NNBSP}€`)).toBeTruthy();
  });

  it('utilise des chiffres tabulaires', async () => {
    await render(<PriceTag cents={120} />);
    expect(screen.getByText(`1,20${NNBSP}€`)).toHaveStyle({ fontVariant: ['tabular-nums'] });
  });
});

describe('AnimatedPrice', () => {
  it('affiche la valeur finale après changement', async () => {
    const { rerender } = await render(<AnimatedPrice cents={1000} testID="t" />);
    expect(screen.getByTestId('t')).toHaveTextContent(`10,00${NNBSP}€`);
    await rerender(<AnimatedPrice cents={1499} testID="t" />);
    expect(screen.getByTestId('t')).toHaveTextContent(`14,99${NNBSP}€`);
    expect(screen.getByTestId('t')).toHaveAccessibleName('14 euros 99');
  });
});

describe('StoreBadge', () => {
  it('affiche le monogramme et un libellé accessible', async () => {
    await render(
      <>
        <StoreBadge chain="lidl" />
        <StoreBadge chain="leclerc" />
        <StoreBadge chain="biocoop" name="Biocoop" />
      </>,
    );
    expect(screen.getByText('Li')).toBeTruthy();
    expect(screen.getByText('L')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByLabelText('Enseigne Lidl')).toBeTruthy();
    expect(screen.getByLabelText('Enseigne E.Leclerc')).toBeTruthy();
    expect(screen.getByLabelText('Enseigne Biocoop')).toBeTruthy();
  });

  it('empile au plus `max` badges et compte le reste', async () => {
    const view = await render(<StoreBadgeStack chains={['leclerc', 'lidl', 'auchan', 'carrefour', 'monoprix']} max={3} />);
    expect(screen.getByText('+2')).toBeTruthy();
    // Lu comme une seule image, TOUTES les enseignes nommées (même au-delà de `max`).
    expect(screen.getByLabelText('Enseignes : E.Leclerc, Lidl, Auchan, Carrefour et Monoprix')).toBeTruthy();
    await view.rerender(<StoreBadgeStack chains={['superu']} />);
    expect(screen.getByLabelText('Enseigne : Super U')).toBeTruthy();
    await view.rerender(<StoreBadgeStack chains={['leclerc', 'aldi']} accessibilityLabel="2 enseignes comparées" />);
    expect(screen.getByLabelText('2 enseignes comparées')).toBeTruthy();
  });

  it('un monogramme unique et un nom par enseigne (10 enseignes)', () => {
    expect(Object.keys(STORE_MONOGRAMS).sort()).toEqual([...STORE_CHAINS].sort());
    const initials = Object.values(STORE_MONOGRAMS).map((m) => m.initials);
    expect(new Set(initials).size).toBe(initials.length);
    for (const chain of STORE_CHAINS) expect(STORE_MONOGRAMS[chain].name).toBe(STORE_CHAIN_LABELS[chain]);
    expect(storeStackLabel([])).toBe('Aucune enseigne');
  });
});

describe('Divers', () => {
  it('RecipeThumb choisit un pastel déterministe', async () => {
    expect(pastelFor('lasagnes')).toBe(pastelFor('lasagnes'));
    await render(<RecipeThumb emoji="🍝" accessibilityLabel="Lasagnes" />);
    expect(screen.getByLabelText('Lasagnes')).toBeTruthy();
  });

  it('ProgressBar borne la valeur et expose un pourcentage', async () => {
    await render(<ProgressBar progress={1.4} accessibilityLabel="Budget" />);
    expect(screen.getByRole('progressbar', { name: 'Budget' })).toHaveAccessibilityValue({ now: 100, text: '100 pour cent' });
  });

  it('Badge, KeyValueRow, EmptyState se rendent', async () => {
    const onPress = jest.fn();
    await render(
      <>
        <Badge label="Premium" tone="premium" />
        <KeyValueRow label="Total" value="12,00 €" emphasis leader />
        <EmptyState title="Ton panier est vide" body="Génère ta semaine." action={{ label: 'Planifier', onPress }} />
      </>,
    );
    expect(screen.getByText('Premium')).toBeTruthy();
    expect(screen.getByLabelText('Total : 12,00 €')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Ton panier est vide' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Planifier' })).toBeTruthy();
  });

  it('Text suit le thème (clair / sombre)', async () => {
    await render(
      <>
        <Text testID="l">clair</Text>
        <ThemeProvider preference="dark">
          <Text testID="d" color="textSecondary">
            sombre
          </Text>
        </ThemeProvider>
      </>,
    );
    expect(screen.getByTestId('l')).toHaveStyle({ color: lightColors.text });
    expect(screen.getByTestId('d')).toHaveStyle({ color: darkColors.textSecondary });
  });
});

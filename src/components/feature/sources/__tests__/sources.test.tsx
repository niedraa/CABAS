/**
 * Sources et licences + provenance des prix : mentions dérivées de
 * `CatalogMeta` (dates, couverture, indices), libellés de provenance
 * (« Relevé le 5 nov. · 3 relevés », « Estimé »), lien vers la fiche Open Food
 * Facts, et l'écran `parametres/sources`.
 */
import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { CatalogMeta } from '@/core';
import { STORE_CHAINS } from '@/core';
import { catalogMeta, DATA_ATTRIBUTION, PRICE_DATA_NOTICE, stores } from '@/data';

import SourcesSettings from '@/app/parametres/sources';

import { observedDayLabel, offProductUrl, priceProvenance } from '../../basket/provenanceView';
import {
  chainRows,
  DATA_ATTRIBUTION_LINE,
  dataSources,
  ESTIMATE_METHODS,
  formatCount,
  indexComparison,
  ODBL,
  priceDataNotice,
  snapshotSummary,
} from '../sourcesView';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
}));

const NNBSP = ' ';

/** Instantané de test (indépendant de l'import réel). */
const META: CatalogMeta = {
  ...catalogMeta,
  snapshotAt: '2026-11-11',
  pricesFrom: '2025-11-11',
  pricesTo: '2026-11-11',
  observedPrices: 12345,
  estimatedPrices: 2345,
  chainIndex: {
    ...catalogMeta.chainIndex,
    leclerc: { value: 1, basis: 'measured', commonProducts: 20785 },
    carrefour: { value: 1.084, basis: 'measured', commonProducts: 3233 },
    lidl: { value: 0.98, basis: 'press', commonProducts: 24 },
  },
  coverage: {
    ...catalogMeta.coverage,
    leclerc: { observed: 1234, estimated: 0 },
    carrefour: { observed: 900, estimated: 56 },
    aldi: { observed: 0, estimated: 0 },
    lidl: { observed: 1, estimated: 1 },
  },
};

describe('mentions de provenance (CatalogMeta)', () => {
  it('pied de l’onglet Prix : même texte que PRICE_DATA_NOTICE pour l’instantané embarqué', () => {
    expect(priceDataNotice(catalogMeta)).toBe(PRICE_DATA_NOTICE);
    expect(priceDataNotice(META)).toBe(
      `Prix relevés en magasin par la communauté Open Prices entre novembre 2025 et novembre 2026. 16${NNBSP}% d’entre eux, faute de relevé, sont estimés et signalés « Estimé ». Ils sont indicatifs et peuvent varier selon ton magasin.`,
    );
    expect(priceDataNotice(null)).toMatch(/^Prix relevés en magasin par la communauté Open Prices\. Ils sont indicatifs/);
  });

  it('résume l’instantané : date, fenêtre des relevés, volumes', () => {
    expect(snapshotSummary(META)).toEqual({
      title: 'Instantané du 11 novembre 2026',
      window: 'Relevés du 11 nov. 2025 au 11 nov. 2026',
      counts: `12${NNBSP}345 prix relevés · 2${NNBSP}345 estimés (16${NNBSP}%)`,
    });
    expect(snapshotSummary({ ...META, estimatedPrices: 0, observedPrices: 1 })?.counts).toBe('1 prix relevé');
    expect(snapshotSummary({ ...META, estimatedPrices: 0, observedPrices: 0 })?.counts).toBe('Aucun prix dans cet instantané pour l’instant');
    expect(snapshotSummary(null)).toBeNull();
    expect(formatCount(1234567)).toBe(`1${NNBSP}234${NNBSP}567`);
  });

  it('une ligne par enseigne (ordre d’affichage) : couverture et indice mesuré / presse', () => {
    const rows = chainRows(META, stores);
    expect(rows.map((r) => r.chain)).toEqual([...STORE_CHAINS]);
    const byChain = Object.fromEntries(rows.map((r) => [r.chain, r]));
    expect(byChain.leclerc).toMatchObject({ name: 'E.Leclerc', index: 100, comparison: 'Référence', coverage: `1${NNBSP}234 relevés`, basisLabel: 'Référence des indices' });
    expect(byChain.carrefour).toMatchObject({ index: 108, comparison: `≈${NNBSP}8${NNBSP}% plus cher`, coverage: '900 relevés · 56 estimés' });
    expect(byChain.carrefour.basisLabel).toBe(`Mesuré sur 3${NNBSP}233 produits communs avec Leclerc`);
    expect(byChain.lidl).toMatchObject({ index: 98, basis: 'press', comparison: `≈${NNBSP}2${NNBSP}% moins cher`, coverage: '1 relevé · 1 estimé' });
    expect(byChain.lidl.basisLabel).toMatch(/presse/);
    expect(byChain.aldi.coverage).toBe('Aucun prix pour l’instant');
    expect(byChain.carrefour.a11y).toMatch(/^Carrefour : 900 relevés, 56 estimés\. Indice de prix 108, environ 8 % plus cher que Leclerc\./);
    expect(indexComparison(100, 'netto')).toBe('Comme Leclerc');
    expect(chainRows(null)).toEqual([]);
  });

  it('trois sources ouvertes sous ODbL, méthode des estimations expliquée', () => {
    const sources = dataSources(META);
    expect(sources.map((s) => s.name)).toEqual(['Open Food Facts', 'Open Prices', 'OpenStreetMap']);
    expect(sources.every((s) => s.license === 'ODbL 1.0' && s.url.startsWith('https://'))).toBe(true);
    expect(dataSources(null)).toHaveLength(3);
    expect(ESTIMATE_METHODS.map((m) => m.method)).toEqual(['chain_index', 'mdd_ratio', 'category_median']);
  });
});

describe('provenance d’un prix', () => {
  const TODAY = '2026-11-10';

  it('date relative courte d’un relevé', () => {
    expect(observedDayLabel('2026-11-10', TODAY)).toBe('aujourd’hui');
    expect(observedDayLabel('2026-11-09T18:00:00.000Z', TODAY)).toBe('hier');
    expect(observedDayLabel('2026-11-05', TODAY)).toBe('le 5 nov.');
    expect(observedDayLabel('2026-11-01', TODAY, true)).toBe('le 1er novembre');
    expect(observedDayLabel('2025-12-20', TODAY)).toBe('le 20 déc. 2025');
    expect(observedDayLabel('pas une date', TODAY)).toBeNull();
  });

  it('relevé, estimation, ancien catalogue', () => {
    expect(priceProvenance({ priceSource: 'open_prices', priceUpdatedAt: '2026-11-05', observationCount: 3 }, TODAY)).toEqual({
      kind: 'observed',
      text: 'Relevé le 5 nov. · 3 relevés',
      a11y: 'prix relevé en magasin le 5 novembre, 3 relevés',
    });
    expect(priceProvenance({ priceSource: 'open_prices', priceUpdatedAt: '2026-11-10', observationCount: 1 }, TODAY).text).toBe('Relevé aujourd’hui · 1 relevé');
    expect(priceProvenance({ priceSource: 'estimate', estimateMethod: 'mdd_ratio' }, TODAY)).toEqual({
      kind: 'estimate',
      text: 'D’après une marque distributeur équivalente',
      a11y: 'prix estimé, faute de relevé dans cette enseigne, d’après une marque distributeur équivalente',
    });
    expect(priceProvenance({ priceSource: 'estimate' }, TODAY)).toMatchObject({ kind: 'estimate', text: null });
    expect(priceProvenance({ priceSource: 'demo', priceUpdatedAt: '2026-11-09' }, TODAY)).toEqual({ kind: 'none', text: null, a11y: null });
    expect(priceProvenance({}, TODAY).kind).toBe('none');
  });

  it('fiche Open Food Facts : seulement pour un code-barres', () => {
    expect(offProductUrl({ ean: '3017620422003' })).toBe('https://world.openfoodfacts.org/product/3017620422003');
    expect(offProductUrl({ ean: '96385074' })).toBe('https://world.openfoodfacts.org/product/96385074');
    expect(offProductUrl({})).toBeNull();
    expect(offProductUrl({ ean: 'abc' })).toBeNull();
    expect(offProductUrl(undefined)).toBeNull();
  });
});

describe('écran « Sources et licences »', () => {
  it('liste les sources, l’instantané, les enseignes et la méthode ; ouvre les liens', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(<SourcesSettings />);
    expect(screen.getAllByRole('header', { name: 'Sources et licences' }).length).toBeGreaterThanOrEqual(1);
    for (const name of ['Open Food Facts', 'Open Prices', 'OpenStreetMap']) expect(screen.getByText(name)).toBeTruthy();
    const summary = snapshotSummary(catalogMeta);
    if (summary) expect(screen.getByText(summary.title)).toBeTruthy();
    for (const chain of STORE_CHAINS) expect(screen.getByTestId(`sources-chain-${chain}`)).toBeTruthy();
    expect(screen.getByText('Les prix « Estimé »')).toBeTruthy();
    expect(screen.getByText('Frais et services indicatifs')).toBeTruthy();
    await fireEvent.press(screen.getByRole('link', { name: /^Open Prices, licence ODbL 1\.0/ }));
    expect(open).toHaveBeenLastCalledWith('https://prices.openfoodfacts.org');
    await fireEvent.press(screen.getByTestId('sources-license'));
    expect(open).toHaveBeenLastCalledWith(ODBL.url);
    open.mockRestore();
  });
});

describe('attribution ODbL', () => {
  it('affiche exactement la mention exigée par DATA_LICENSE.md (constante DATA_ATTRIBUTION)', () => {
    expect(DATA_ATTRIBUTION_LINE).toBe(DATA_ATTRIBUTION);
    expect(DATA_ATTRIBUTION_LINE).toMatch(/Open Food Facts.*Open Prices.*© contributeurs OpenStreetMap.*Licence ODbL/);
  });
});

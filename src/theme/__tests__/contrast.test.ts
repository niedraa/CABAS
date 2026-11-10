/**
 * Garde-fou d'accessibilité : les paires texte / fond de la DA respectent
 * WCAG AA (4,5:1 texte courant, 3:1 texte large / éléments d'interface).
 * Les ratios sont documentés dans docs/brand/README.md.
 */
import { contrastRatio, darkColors, lightColors, withAlpha, type ColorScheme } from '@/theme';

type Pair = [keyof ColorScheme, keyof ColorScheme, number];

// [texte, fond, ratio minimal]
const PAIRS: Pair[] = [
  ['text', 'background', 4.5],
  ['text', 'surface', 4.5],
  ['text', 'backgroundAlt', 4.5],
  ['textSecondary', 'background', 4.5],
  ['textSecondary', 'surface', 4.5],
  ['textTertiary', 'background', 3],
  ['textTertiary', 'surface', 3],
  ['onAccent', 'accent', 4.5],
  ['onPrimary', 'primary', 4.5],
  ['onDanger', 'danger', 4.5],
  ['primary', 'background', 4.5],
  ['primary', 'primarySoft', 4.5],
  ['success', 'surface', 4.5],
  ['success', 'successSoft', 4.5],
  ['danger', 'background', 4.5],
  ['danger', 'dangerSoft', 4.5],
  ['savings', 'surface', 4.5],
  ['priceBest', 'surface', 4.5],
  ['accentText', 'accentSoft', 4.5],
  ['accentText', 'background', 4.5],
  ['info', 'infoSoft', 4.5],
  ['heroText', 'hero', 4.5],
  ['accent', 'hero', 4.5],
];

describe.each([
  ['clair', lightColors],
  ['sombre', darkColors],
])('contrastes WCAG — thème %s', (_name, colors) => {
  it.each(PAIRS)('%s sur %s ≥ %s:1', (fg, bg, min) => {
    expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(min);
  });
});

describe('utilitaires couleur', () => {
  it('calcule les ratios connus', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 5);
  });
  it('applique une transparence', () => {
    expect(withAlpha('#173A2C', 0.5)).toBe('rgba(23, 58, 44, 0.5)');
    expect(withAlpha('#173A2C', 2)).toBe('rgba(23, 58, 44, 1)');
    expect(() => withAlpha('nope', 1)).toThrow();
  });
});

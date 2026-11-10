import { buildTheme, darkColors, lightColors } from '@/theme';

describe('theme tokens', () => {
  it('exposes the same color keys in light and dark', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });
  it('builds a theme for each scheme', () => {
    expect(buildTheme('dark').colors).toBe(darkColors);
    expect(buildTheme('light').colors.primary).toBe('#173A2C');
  });
});

/// <reference types="jest" />
import { createId, uuid } from '../ids';
import { hashString, mulberry32, seededShuffle, seedToNumber } from '../random';
import { MINUS, NNBSP, formatPrice, formatPricePerUnit, parsePriceToCents, percent, sumCents } from '../money';
import { capitalize, compareFr, deOrElided, foldText, joinFr, lowerFirst, pluralize, pluralizeWord, startsWithVowelSound } from '../text';

describe('random', () => {
  it('hashString est stable et dispersé', () => {
    expect(hashString('cabas')).toBe(hashString('cabas'));
    expect(hashString('cabas')).not.toBe(hashString('cabaS'));
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('x')).toBeGreaterThanOrEqual(0);
  });

  it('mulberry32 est déterministe et dans [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(Array.from({ length: 1000 }, () => b())).toEqual(xs);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    // distribution grossièrement uniforme
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });

  it('seededShuffle est une permutation déterministe qui ne modifie pas l’entrée', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const s1 = seededShuffle(arr, mulberry32(7));
    const s2 = seededShuffle(arr, mulberry32(7));
    expect(s1).toEqual(s2);
    expect([...s1].sort()).toEqual(arr);
    expect(arr).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(seededShuffle([], mulberry32(1))).toEqual([]);
  });

  it('seedToNumber accepte texte et nombre', () => {
    expect(seedToNumber(5)).toBe(5);
    expect(seedToNumber('a')).toBe(hashString('a'));
    expect(seedToNumber(-1)).toBe(4294967295);
  });
});

describe('ids', () => {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it('createId préfixe et reste unique', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createId('meal')));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id.startsWith('meal_')).toBe(true);
    expect(createId()).toMatch(UUID_RE);
  });

  describe('replis sans crypto.randomUUID', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    afterEach(() => {
      if (original) Object.defineProperty(globalThis, 'crypto', original);
      else delete (globalThis as { crypto?: unknown }).crypto;
    });

    it('utilise getRandomValues', () => {
      const getRandomValues = jest.fn(<T extends Uint8Array>(a: T) => {
        for (let i = 0; i < a.length; i++) a[i] = i * 17;
        return a;
      });
      Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues }, configurable: true, writable: true });
      expect(uuid()).toMatch(UUID_RE);
      expect(getRandomValues).toHaveBeenCalled();
    });

    it('utilise Math.random en dernier recours', () => {
      Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
      const ids = new Set(Array.from({ length: 50 }, () => uuid()));
      expect(ids.size).toBe(50);
      for (const id of ids) expect(id).toMatch(UUID_RE);
    });
  });
});

describe('money', () => {
  it('formate avec U+202F et virgule', () => {
    expect(formatPrice(499)).toBe(`4,99${NNBSP}€`);
    expect(formatPrice(5)).toBe(`0,05${NNBSP}€`);
    expect(formatPrice(0)).toBe(`0,00${NNBSP}€`);
    expect(formatPrice(123450)).toBe(`1${NNBSP}234,50${NNBSP}€`);
    expect(formatPrice(123456789)).toBe(`1${NNBSP}234${NNBSP}567,89${NNBSP}€`);
    expect(formatPrice(100000)).toBe(`1${NNBSP}000,00${NNBSP}€`);
    expect(formatPrice(99999)).toBe(`999,99${NNBSP}€`);
  });

  it('gère signe, compact, négatifs et valeurs invalides', () => {
    expect(formatPrice(250, { signed: true })).toBe(`+2,50${NNBSP}€`);
    expect(formatPrice(-250)).toBe(`${MINUS}2,50${NNBSP}€`);
    expect(formatPrice(-250, { signed: true })).toBe(`${MINUS}2,50${NNBSP}€`);
    expect(formatPrice(0, { signed: true })).toBe(`0,00${NNBSP}€`);
    expect(formatPrice(500, { compact: true })).toBe(`5${NNBSP}€`);
    expect(formatPrice(550, { compact: true })).toBe(`5,50${NNBSP}€`);
    expect(formatPrice(NaN)).toBe(`0,00${NNBSP}€`);
    expect(formatPrice(4.6)).toBe(`0,05${NNBSP}€`);
  });

  it('prix de référence', () => {
    expect(formatPricePerUnit(320, 'kg')).toBe(`3,20${NNBSP}€/kg`);
    expect(formatPricePerUnit(45, 'piece')).toBe(`0,45${NNBSP}€/pièce`);
    expect(formatPricePerUnit(115, 'l')).toBe(`1,15${NNBSP}€/L`);
  });

  it('sumCents, percent, parsePriceToCents', () => {
    expect(sumCents([100, 250, NaN, Infinity])).toBe(350);
    expect(sumCents([])).toBe(0);
    expect(percent(25, 100)).toBe(25);
    expect(percent(1, 3)).toBe(33);
    expect(percent(5, 0)).toBe(0);
    expect(percent(NaN, 4)).toBe(0);
    expect(parsePriceToCents('4,99')).toBe(499);
    expect(parsePriceToCents(`1${NNBSP}234,5 €`)).toBe(123450);
    expect(parsePriceToCents('12')).toBe(1200);
    expect(parsePriceToCents('abc')).toBeNull();
  });
});

describe('text', () => {
  it('foldText / compareFr', () => {
    expect(foldText('Crème Fraîche Œuf')).toBe('creme fraiche oeuf');
    expect(['Épinards', 'carotte', 'Ail', 'éclair', 'Banane'].sort(compareFr)).toEqual(['Ail', 'Banane', 'carotte', 'éclair', 'Épinards']);
    expect(compareFr('a', 'A')).not.toBe(0);
    expect(compareFr('b', 'b')).toBe(0);
  });

  it('capitalize / lowerFirst / joinFr', () => {
    expect(capitalize('oignon')).toBe('Oignon');
    expect(capitalize('')).toBe('');
    expect(lowerFirst('Oignon')).toBe('oignon');
    expect(lowerFirst('AOP')).toBe('AOP');
    expect(lowerFirst('O')).toBe('o');
    expect(joinFr([])).toBe('');
    expect(joinFr(['a'])).toBe('a');
    expect(joinFr(['a', 'b', 'c'])).toBe('a, b et c');
  });

  it('élision', () => {
    expect(startsWithVowelSound('oignon')).toBe(true);
    expect(startsWithVowelSound('Œuf')).toBe(true);
    expect(startsWithVowelSound('huile')).toBe(true);
    expect(startsWithVowelSound('haricots')).toBe(false);
    expect(startsWithVowelSound('farine')).toBe(false);
    expect(startsWithVowelSound('')).toBe(false);
    expect(deOrElided('ail')).toBe("d'ail");
    expect(deOrElided('sel')).toBe('de sel');
  });

  it('pluriels', () => {
    expect(pluralizeWord('oignon')).toBe('oignons');
    expect(pluralizeWord('poireau')).toBe('poireaux');
    expect(pluralizeWord('chou')).toBe('choux');
    expect(pluralizeWord('pneu')).toBe('pneus');
    expect(pluralizeWord('noix')).toBe('noix');
    expect(pluralizeWord('bocal')).toBe('bocaux');
    expect(pluralizeWord('festival')).toBe('festivals');
    expect(pluralize('pomme de terre', 3)).toBe('pommes de terre');
    expect(pluralize("gousse d'ail", 2)).toBe("gousses d'ail");
    expect(pluralize('chou-fleur', 2)).toBe('choux-fleurs');
    expect(pluralize('tomate cerise', 4)).toBe('tomates cerises');
    expect(pluralize('oignon', 1.5)).toBe('oignon');
    expect(pluralize('oignon')).toBe('oignons');
  });
});

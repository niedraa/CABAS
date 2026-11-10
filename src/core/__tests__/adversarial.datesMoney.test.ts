/// <reference types="jest" />
/**
 * Tests ADVERSARIAUX — dates (changements d'heure, passage d'année, fuseaux)
 * et montants (négatifs, zéro, grands nombres, arrondis), plus alertes prix
 * et budget qui en dépendent.
 */
import {
  addDays,
  daysBetween,
  formatDayLabel,
  formatMonthLabel,
  formatWeekRange,
  isISODate,
  isInWeek,
  isWeekend,
  parseISODate,
  relativeDayLabel,
  startOfWeek,
  toISODate,
  todayISO,
  weekDates,
  weekdayIndex,
} from '../dates';
import { MINUS, NNBSP, formatPrice, formatPricePerUnit, parsePriceToCents, percent, sumCents } from '../money';
import { generateMealPlan } from '../mealEngine';
import { budgetStatus, spendingByMonth, spendingByWeek } from '../budget';
import { detectPriceDrops } from '../priceAlerts';
import { INGREDIENTS_BY_ID, RECIPES, makeProfile } from './fixtures';
import type { Price, SpendingEntry } from '../types';
import { execFileSync } from 'child_process';
import * as path from 'path';
import { pathToFileURL } from 'url';

const E = `${NNBSP}€`;

// ─── Dates ───────────────────────────────────────────────────────────────────

const TIMEZONES = ['Europe/Paris', 'America/New_York', 'Pacific/Auckland', 'Asia/Kolkata', 'UTC'];
const JANUARY_OFFSETS: Record<string, number> = {
  'Europe/Paris': -60,
  'America/New_York': 300,
  'Pacific/Auckland': -780,
  'Asia/Kolkata': -330,
  UTC: 0,
};

/**
 * Le bac à sable de Jest ignore un changement de `process.env.TZ` en cours
 * d'exécution (vérifié : getTimezoneOffset reste à 0). Les fonctions qui
 * dépendent de l'heure LOCALE sont donc exécutées dans un processus Node
 * enfant par fuseau (dates.ts n'a aucun import : chargeable tel quel grâce au
 * « type stripping » de Node ≥ 22.6).
 */
const DATES_URL = pathToFileURL(path.resolve(__dirname, '../dates.ts')).href;
const LOCAL_SCRIPT = `
import * as d from ${JSON.stringify(DATES_URL)};
const roundTrip = ['2026-03-29', '2026-03-30', '2026-10-25', '2026-10-26', '2026-12-31', '2027-01-01']
  .map((iso) => d.toISODate(d.parseISODate(iso)));
console.log(JSON.stringify({
  offset: new Date(Date.UTC(2026, 0, 15)).getTimezoneOffset(),
  roundTrip,
  sowSpring: d.startOfWeek(new Date(2026, 2, 29, 23, 30)),
  sowAutumn: d.startOfWeek(new Date(2026, 9, 25, 0, 30)),
  sowNewYear: d.startOfWeek(new Date(2027, 0, 1, 12)),
  todayAutumn: d.todayISO(new Date(2026, 9, 25, 2, 30)),
  weekSpring: d.weekDates('2026-03-23'),
  weekAutumn: d.weekDates('2026-10-19'),
  weekNewYear: d.weekDates('2026-12-28'),
  addSpring: d.addDays('2026-03-29', 1),
  addAutumn: d.addDays('2026-10-25', 1),
  between: [d.daysBetween('2026-03-28', '2026-03-30'), d.daysBetween('2026-10-24', '2026-10-26'), d.daysBetween('2026-12-28', '2027-01-03')],
}));
`;

function runInTimezone(tz: string): Record<string, unknown> | null {
  try {
    const out = execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', LOCAL_SCRIPT], {
      env: { ...process.env, TZ: tz },
      encoding: 'utf8',
      timeout: 20000,
    });
    return JSON.parse(out.trim().split('\n').pop() as string);
  } catch {
    return null; // Node sans type stripping : test ignoré (voir canRunChild)
  }
}

const canRunChild = runInTimezone('UTC') !== null;

describe('dates — semaines de changement d’heure, dans plusieurs fuseaux', () => {
  (canRunChild ? it.each(TIMEZONES) : it.skip.each(TIMEZONES))('fuseau %s (processus enfant) : heure locale', (tz) => {
    const r = runInTimezone(tz) as Record<string, unknown>;
    expect(r.offset).toBe(JANUARY_OFFSETS[tz]); // le fuseau est bien appliqué
    expect(r.roundTrip).toEqual(['2026-03-29', '2026-03-30', '2026-10-25', '2026-10-26', '2026-12-31', '2027-01-01']);
    expect(r.sowSpring).toBe('2026-03-23');
    expect(r.sowAutumn).toBe('2026-10-19');
    expect(r.sowNewYear).toBe('2026-12-28');
    expect(r.todayAutumn).toBe('2026-10-25');
    expect(r.weekSpring).toEqual(['2026-03-23', '2026-03-24', '2026-03-25', '2026-03-26', '2026-03-27', '2026-03-28', '2026-03-29']);
    expect((r.weekAutumn as string[])[6]).toBe('2026-10-25');
    expect(r.weekNewYear).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
    expect(r.addSpring).toBe('2026-03-30');
    expect(r.addAutumn).toBe('2026-10-26');
    expect(r.between).toEqual([2, 2, 6]);
  });

  it('semaines DST et passage d’année (fuseau du processus de test)', () => {
    expect(addDays('2026-03-30', -1)).toBe('2026-03-29');
    expect(startOfWeek('2026-10-25')).toBe('2026-10-19');
    expect(startOfWeek('2026-03-29')).toBe('2026-03-23');
    expect(startOfWeek('2027-01-03')).toBe('2026-12-28');
    expect(startOfWeek('2027-01-01')).toBe('2026-12-28');
    expect(isInWeek('2027-01-03', '2026-12-28')).toBe(true);
    expect(isInWeek('2027-01-04', '2026-12-28')).toBe(false);
    expect(isInWeek('2026-12-27', '2026-12-28')).toBe(false);
    expect(isWeekend('2027-01-02')).toBe(true);
    expect(isWeekend('2027-01-01')).toBe(false);
    expect(formatWeekRange('2026-12-28')).toBe('28 déc. 2026 – 3 janv. 2027');
    for (const iso of ['2026-03-29', '2026-10-25', '2027-01-01']) expect(toISODate(parseISODate(iso))).toBe(iso);
    expect(weekDates('2026-10-19')).toHaveLength(7);
    expect(daysBetween('2026-12-28', '2027-01-03')).toBe(6);
    expect(todayISO(new Date(2026, 9, 25, 2, 30))).toBe('2026-10-25');
  });

  it('planning d’une semaine DST / passage d’année : 7 jours distincts, bien rangés', () => {
    for (const weekStart of ['2026-03-23', '2026-10-19', '2026-12-28']) {
      const plan = generateMealPlan({
        profile: makeProfile(),
        recipes: RECIPES,
        ingredientsById: INGREDIENTS_BY_ID,
        weekStart,
        seed: 'dst',
        now: '2026-11-10T08:00:00.000Z',
      });
      const days = new Set(plan.meals.map((m) => m.date));
      expect(days).toEqual(new Set(weekDates(weekStart)));
      for (const m of plan.meals) expect(isInWeek(m.date, weekStart)).toBe(true);
      // Samedi + dimanche : déjeuner ET dîner.
      expect(plan.meals.filter((m) => isWeekend(m.date))).toHaveLength(4);
    }
  });

  it('libellés : 1er, passage d’année, relatif à travers l’année', () => {
    expect(formatDayLabel('2027-01-01')).toBe('vendredi 1er janvier');
    expect(formatDayLabel('2026-12-31', 'short')).toBe('jeu. 31');
    expect(formatDayLabel('2026-03-29', 'weekday')).toBe('Dimanche');
    expect(relativeDayLabel('2027-01-01', '2026-12-31')).toBe('Demain');
    expect(relativeDayLabel('2026-12-31', '2027-01-01T08:00:00Z')).toBe('Hier');
    expect(formatMonthLabel('2027-01')).toBe('janvier 2027');
    expect(formatWeekRange('2026-03-30')).toBe('30 mars – 5 avr.');
    expect(formatWeekRange('2026-11-09')).toBe('9 – 15 nov.');
  });

  it('années bissextiles et dates invalides', () => {
    expect(isISODate('2028-02-29')).toBe(true);
    expect(isISODate('2026-02-29')).toBe(false);
    expect(isISODate('2026-13-01')).toBe(false);
    expect(isISODate('2026-1-01')).toBe(false);
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(weekdayIndex('2026-11-09')).toBe(0);
    expect(isInWeek('n’importe quoi', '2026-11-09')).toBe(false);
    expect(() => addDays('nope', 1)).toThrow();
  });
});

// ─── Montants ────────────────────────────────────────────────────────────────

describe('formatPrice — cas extrêmes', () => {
  it('zéro, négatifs, signe', () => {
    expect(formatPrice(0)).toBe(`0,00${E}`);
    expect(formatPrice(-0)).toBe(`0,00${E}`);
    expect(formatPrice(0, { signed: true })).toBe(`0,00${E}`);
    expect(formatPrice(-1)).toBe(`${MINUS}0,01${E}`);
    expect(formatPrice(-123456)).toBe(`${MINUS}1${NNBSP}234,56${E}`);
    expect(formatPrice(-500, { signed: true, compact: true })).toBe(`${MINUS}5${E}`);
    expect(formatPrice(250, { signed: true })).toBe(`+2,50${E}`);
  });

  it('grands nombres : séparateurs de milliers', () => {
    expect(formatPrice(100000)).toBe(`1${NNBSP}000,00${E}`);
    expect(formatPrice(99999999)).toBe(`999${NNBSP}999,99${E}`);
    expect(formatPrice(123456789012)).toBe(`1${NNBSP}234${NNBSP}567${NNBSP}890,12${E}`);
  });

  it('arrondi SYMÉTRIQUE des centimes fractionnaires (−x = −(x))', () => {
    expect(formatPrice(150.5)).toBe(`1,51${E}`);
    expect(formatPrice(-150.5)).toBe(`${MINUS}1,51${E}`);
    expect(formatPrice(0.5)).toBe(`0,01${E}`);
    expect(formatPrice(-0.5)).toBe(`${MINUS}0,01${E}`);
    expect(formatPrice(-0.4)).toBe(`0,00${E}`); // pas de « −0,00 € »
    expect(formatPrice(199.4999)).toBe(`1,99${E}`);
    for (let c = -1000; c <= 1000; c += 0.25) {
      const pos = formatPrice(Math.abs(c));
      const neg = formatPrice(-Math.abs(c));
      expect(neg === pos || neg === `${MINUS}${pos}`).toBe(true);
    }
  });

  it('valeurs non finies → 0', () => {
    expect(formatPrice(Infinity)).toBe(`0,00${E}`);
    expect(formatPrice(-Infinity)).toBe(`0,00${E}`);
    expect(formatPricePerUnit(NaN, 'kg')).toBe(`0,00${E}/kg`);
  });

  it('parsePriceToCents : aller-retour et entrées hostiles', () => {
    for (const cents of [0, 1, 9, 10, 99, 100, 435, 1999, 123456]) {
      const text = formatPrice(cents);
      expect(parsePriceToCents(text)).toBe(cents);
    }
    expect(parsePriceToCents('4,35')).toBe(435); // 4.35 * 100 = 434.99999…
    expect(parsePriceToCents('1.005')).toBeNull();
    expect(parsePriceToCents('-4,99')).toBe(-499);
    for (const bad of ['', ' ', '€', 'abc', '1e3', '4,99,1', '0x10', 'Infinity', 'NaN', '--1', '1-']) {
      expect(parsePriceToCents(bad)).toBeNull();
    }
  });

  it('sumCents / percent : bruit flottant et divisions par zéro', () => {
    expect(sumCents([0.1, 0.2])).toBe(0);
    expect(sumCents([])).toBe(0);
    expect(sumCents([-100, 50])).toBe(-50);
    expect(percent(1, 3)).toBe(33);
    expect(percent(5, 0)).toBe(0);
    expect(percent(-5, 10)).toBe(-50);
  });
});

// ─── Alertes prix & budget ───────────────────────────────────────────────────

describe('alertes prix — données sales', () => {
  const price = (cents: number, o: Partial<Price> = {}): Price => ({ productId: 'p', storeId: 's', priceCents: cents, updatedAt: '2026-11-01', source: 'demo', ...o });

  it('prix à 0 / NaN / négatif : jamais une « baisse de 100 % »', () => {
    for (const bad of [0, NaN, -50]) {
      expect(detectPriceDrops([{ productId: 'p', storeId: 's', referenceCents: 300 }], [price(300, { updatedAt: '2026-10-01' }), price(bad, { updatedAt: '2026-11-01' })], { now: '2026-11-10' })).toEqual([]);
    }
  });

  it('promo expirée la veille ignorée, promo du jour comptée', () => {
    const watch = [{ productId: 'p', storeId: 's', referenceCents: 300 }];
    expect(detectPriceDrops(watch, [price(300, { promoPriceCents: 200, promoUntil: '2026-11-09' })], { now: '2026-11-10' })).toEqual([]);
    expect(detectPriceDrops(watch, [price(300, { promoPriceCents: 200, promoUntil: '2026-11-10' })], { now: '2026-11-10' })).toHaveLength(1);
  });

  it('prix récents à égalité de date : résultat indépendant de l’ordre', () => {
    const watch = [{ productId: 'p', storeId: 's', referenceCents: 300 }];
    const a = price(200);
    const b = price(250);
    expect(detectPriceDrops(watch, [a, b])).toEqual(detectPriceDrops(watch, [b, a]));
  });
});

describe('budget — passage d’année et valeurs extrêmes', () => {
  const entry = (date: string, totalCents: number, savingsCents = 0): SpendingEntry => ({ id: date + totalCents, date, storeId: 's', totalCents, savingsCents, source: 'manual' });

  it('dépenses du 31 décembre et du 2 janvier → même semaine, mois différents', () => {
    const entries = [entry('2026-12-31', 5000), entry('2027-01-02', 3000, 200)];
    expect(spendingByWeek(entries)).toEqual([
      { key: '2026-12-28', label: '28 déc. 2026 – 3 janv. 2027', totalCents: 8000, savingsCents: 200, count: 2 },
    ]);
    expect(spendingByMonth(entries).map((p) => p.label)).toEqual(['décembre 2026', 'janvier 2027']);
    expect(budgetStatus(entries, 6000, '2026-12-28')).toEqual({ spentCents: 8000, remainingCents: 0, ratio: 8000 / 6000, over: true });
  });

  it('budget nul, négatif ou NaN : pas de ratio infini', () => {
    for (const b of [0, -100, NaN]) {
      const s = budgetStatus([entry('2026-11-10', 100)], b, '2026-11-09');
      expect(Number.isFinite(s.ratio)).toBe(true);
      expect(s.remainingCents).toBe(0);
    }
  });
});

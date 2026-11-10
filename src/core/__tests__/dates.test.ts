/// <reference types="jest" />
import {
  addDays,
  daysBetween,
  formatDayLabel,
  formatMonthLabel,
  formatWeekRange,
  isISODate,
  isInWeek,
  isWeekend,
  monthOf,
  parseISODate,
  relativeDayLabel,
  startOfWeek,
  toISODate,
  todayISO,
  weekDates,
  weekdayIndex,
} from '../dates';

describe('dates', () => {
  it('toISODate utilise la date locale, parseISODate renvoie minuit local', () => {
    const d = new Date(2026, 8, 14, 23, 59);
    expect(toISODate(d)).toBe('2026-09-14');
    const p = parseISODate('2026-09-14');
    expect(p.getFullYear()).toBe(2026);
    expect(p.getMonth()).toBe(8);
    expect(p.getDate()).toBe(14);
    expect(p.getHours()).toBe(0);
    expect(toISODate(parseISODate('2026-03-29'))).toBe('2026-03-29');
    expect(() => parseISODate('14/09/2026')).toThrow();
  });

  it('isISODate', () => {
    expect(isISODate('2026-09-14')).toBe(true);
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('2026-9-14')).toBe(false);
  });

  it('startOfWeek renvoie le lundi', () => {
    expect(startOfWeek('2026-09-14')).toBe('2026-09-14'); // lundi
    expect(startOfWeek('2026-09-20')).toBe('2026-09-14'); // dimanche
    expect(startOfWeek('2026-09-16T18:00:00Z')).toBe('2026-09-14');
    expect(startOfWeek(new Date(2026, 9, 1))).toBe('2026-09-28'); // jeudi 1er oct.
    expect(startOfWeek('2027-01-01')).toBe('2026-12-28'); // changement d'année
  });

  it('semaines avec changement d’heure (DST)', () => {
    // Passage à l'heure d'été : dimanche 29 mars 2026.
    expect(startOfWeek('2026-03-29')).toBe('2026-03-23');
    expect(weekDates('2026-03-23')).toEqual([
      '2026-03-23',
      '2026-03-24',
      '2026-03-25',
      '2026-03-26',
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
    ]);
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    // Passage à l'heure d'hiver : dimanche 25 octobre 2026.
    expect(startOfWeek('2026-10-25')).toBe('2026-10-19');
    expect(weekDates('2026-10-19')[6]).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(daysBetween('2026-10-19', '2026-10-26')).toBe(7);
    expect(startOfWeek(parseISODate('2026-10-25'))).toBe('2026-10-19');
  });

  it('addDays traverse mois, années et années bissextiles', () => {
    expect(addDays('2026-09-28', 7)).toBe('2026-10-05');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('weekdayIndex / isWeekend / isInWeek / monthOf', () => {
    expect(weekdayIndex('2026-09-14')).toBe(0);
    expect(weekdayIndex('2026-09-20')).toBe(6);
    expect(isWeekend('2026-09-19')).toBe(true);
    expect(isWeekend('2026-09-18')).toBe(false);
    expect(isInWeek('2026-09-20', '2026-09-14')).toBe(true);
    expect(isInWeek('2026-09-21', '2026-09-14')).toBe(false);
    expect(isInWeek('2026-09-13', '2026-09-14')).toBe(false);
    expect(monthOf('2026-09-14')).toBe(9);
  });

  it('libellés de jour en français', () => {
    expect(formatDayLabel('2026-09-14', 'short')).toBe('lun. 14');
    expect(formatDayLabel('2026-09-14', 'long')).toBe('lundi 14 septembre');
    expect(formatDayLabel('2026-09-14')).toBe('lundi 14 septembre');
    expect(formatDayLabel('2026-09-14', 'weekday')).toBe('Lundi');
    expect(formatDayLabel('2026-10-01', 'long')).toBe('jeudi 1er octobre');
    expect(formatDayLabel('2026-08-16', 'short')).toBe('dim. 16');
  });

  it('plages de semaine', () => {
    expect(formatWeekRange('2026-09-07')).toBe('7 – 13 sept.');
    expect(formatWeekRange('2026-09-28')).toBe('28 sept. – 4 oct.');
    expect(formatWeekRange('2025-12-29')).toBe('29 déc. 2025 – 4 janv. 2026');
    expect(formatWeekRange('2026-07-27')).toBe('27 juil. – 2 août');
  });

  it('libellés relatifs', () => {
    expect(relativeDayLabel('2026-09-14', '2026-09-14')).toBe("Aujourd'hui");
    expect(relativeDayLabel('2026-09-15', '2026-09-14T22:00:00Z')).toBe('Demain');
    expect(relativeDayLabel('2026-09-13', '2026-09-14')).toBe('Hier');
    expect(relativeDayLabel('2026-09-17', '2026-09-14')).toBe('jeudi 17 septembre');
    expect(relativeDayLabel('2026-09-17', '2026-09-14', 'short')).toBe('jeu. 17');
  });

  it('todayISO / formatMonthLabel', () => {
    expect(todayISO('2026-09-14T10:00:00Z')).toBe('2026-09-14');
    expect(todayISO(new Date(2026, 0, 2))).toBe('2026-01-02');
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(formatMonthLabel('2026-09')).toBe('septembre 2026');
    expect(formatMonthLabel('2026-02-14')).toBe('février 2026');
    expect(() => formatMonthLabel('sept')).toThrow();
  });
});

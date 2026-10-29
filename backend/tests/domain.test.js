import { describe, expect, it } from 'vitest';
import { addDays, dateValid, datesBetween, requestedSlots } from '../src/domain.js';
describe('Datums- und Halbtagregeln', () => {
  it('validiert echte Kalendertage', () => {
    expect(dateValid('2028-02-29')).toBe(true);
    for (const day of [
      '2027-02-29',
      '2027-02-31',
      '2027-13-01',
      '2027-1-01',
      '2027-01-00',
      '1800-01-01',
    ])
      expect(dateValid(day)).toBe(false);
  });
  it('rechnet Sommerzeit und Jahreswechsel als Kalendertage', () => {
    expect(addDays('2027-03-28', 1)).toBe('2027-03-29');
    expect(addDays('2027-12-31', 1)).toBe('2028-01-01');
    expect(datesBetween('2028-02-28', '2028-03-01')).toHaveLength(3);
  });
  it('begrenzt Zeiträume und verhindert vertauschte Daten', () => {
    expect(() => datesBetween('2027-12-31', '2027-01-01')).toThrow();
    expect(() => datesBetween('2027-01-01', '2028-01-02')).toThrow();
  });
  it('teilt Tage genau in zwei Abschnitte', () => {
    const b = { startDate: '2027-03-01', endDate: '2027-03-03', startPart: 'PM', endPart: 'AM' };
    expect(requestedSlots(b, b.startDate)).toEqual(['PM']);
    expect(requestedSlots(b, '2027-03-02')).toEqual(['AM', 'PM']);
    expect(requestedSlots(b, b.endDate)).toEqual(['AM']);
  });
  it('lehnt nicht zusammenhängende Halbtagszeiträume ab', () => {
    expect(() =>
      requestedSlots(
        { startDate: '2027-03-01', endDate: '2027-03-01', startPart: 'AM', endPart: 'PM' },
        '2027-03-01',
      ),
    ).toThrow();
    expect(() =>
      requestedSlots(
        { startDate: '2027-03-01', endDate: '2027-03-02', startPart: 'AM', endPart: 'FULL' },
        '2027-03-01',
      ),
    ).toThrow();
  });
});

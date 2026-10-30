import { describe, expect, it } from 'vitest';
import { loadSchoolHolidays } from '../src/school-holidays.js';
const entry = {
  id: 'christmas',
  startDate: '2026-12-21',
  endDate: '2027-01-06',
  name: [{ language: 'DE', text: 'Weihnachtsferien' }],
  comment: [{ language: 'DE', text: 'Regionale Besonderheit' }],
};
describe('Online-Schulferien', () => {
  it('fragt Bundesland und Zeitraum ab und erhält jahresübergreifende Ferien und Hinweise', async () => {
    const result = await loadSchoolHolidays(
      'SH',
      '2027-01-01',
      '2028-01-01',
      async (url, options) => {
        expect(url.origin).toBe('https://openholidaysapi.org');
        expect(url.searchParams.get('subdivisionCode')).toBe('DE-SH');
        expect(url.searchParams.get('validTo')).toBe('2027-12-31');
        expect(options.signal).toBeInstanceOf(AbortSignal);
        return { ok: true, json: async () => [entry] };
      },
    );
    expect(result).toEqual([
      {
        id: 'christmas',
        startDate: '2026-12-21',
        endDate: '2027-01-06',
        name: 'Weihnachtsferien',
        note: 'Regionale Besonderheit',
      },
    ]);
  });
  it.each([
    [{ ...entry, startDate: '2027-02-30' }],
    [{ ...entry, endDate: '2026-01-01' }],
    [{ ...entry, name: [] }],
  ])('weist fehlerhafte Anbieter-Daten zurück', async (entry) => {
    await expect(
      loadSchoolHolidays('SH', '2027-01-01', '2028-01-01', async () => ({
        ok: true,
        json: async () => [entry],
      })),
    ).rejects.toMatchObject({ code: 'SCHOOL_HOLIDAYS_FAILED' });
  });
  it('meldet fehlende Daten und Netzwerkausfälle', async () => {
    await expect(
      loadSchoolHolidays('SH', '2027-01-01', '2028-01-01', async () => ({
        ok: true,
        json: async () => [],
      })),
    ).rejects.toMatchObject({ code: 'SCHOOL_HOLIDAYS_UNAVAILABLE' });
    await expect(
      loadSchoolHolidays('SH', '2027-01-01', '2028-01-01', async () => {
        throw new Error('offline');
      }),
    ).rejects.toMatchObject({ code: 'SCHOOL_HOLIDAYS_FAILED' });
  });
  it('erlaubt Monate ohne Ferien', async () => {
    await expect(
      loadSchoolHolidays('SH', '2027-02-01', '2027-03-01', async () => ({
        ok: true,
        json: async () => [],
      })),
    ).resolves.toEqual([]);
  });
  it('verhindert ungültige Bundesländer und zu große Zeiträume vor dem Abruf', async () => {
    await expect(loadSchoolHolidays('NATIONAL', '2027-01-01', '2028-01-01')).rejects.toThrow();
    await expect(loadSchoolHolidays('SH', '2027-01-01', '2029-01-01')).rejects.toMatchObject({
      code: 'INVALID_RANGE',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { importHolidays } from '../src/holiday-import.js';

describe('Online-Feiertagsimport', () => {
  it('fragt Jahr und Bundesland ab und übernimmt Hinweise und ganze Tage', async () => {
    const result = await importHolidays(2027, 'BY', async (url, options) => {
      expect(url.searchParams.get('jahr')).toBe('2027');
      expect(url.searchParams.get('nur_land')).toBe('BY');
      expect(options.signal).toBeInstanceOf(AbortSignal);
      return {
        ok: true,
        json: async () => ({ Neujahr: { datum: '2027-01-01', hinweis: 'Örtlich prüfen' } }),
      };
    });
    expect(result.holidays).toEqual([
      { date: '2027-01-01', name: 'Neujahr', blockedSlots: 'FULL' },
    ]);
    expect(result.notes).toEqual(['Neujahr: Örtlich prüfen']);
  });
  it.each([
    {},
    { Test: { datum: '2026-01-01' } },
    { Test: { datum: '2027-02-30' } },
    { A: { datum: '2027-01-01' }, B: { datum: '2027-01-01' } },
  ])('weist fehlerhafte Daten zurück', async (data) => {
    await expect(
      importHolidays(2027, 'NW', async () => ({ ok: true, json: async () => data })),
    ).rejects.toMatchObject({ code: 'HOLIDAY_IMPORT_FAILED', status: 502 });
  });
  it('behandelt Netzwerkausfälle verständlich', async () => {
    await expect(
      importHolidays(2027, 'NW', async () => {
        throw new Error('timeout');
      }),
    ).rejects.toMatchObject({ code: 'HOLIDAY_IMPORT_FAILED' });
  });
});

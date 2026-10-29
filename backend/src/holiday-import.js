import { z } from 'zod';
import { date, fail, year } from './domain.js';

export const holidayRegions = {
  NATIONAL: 'Deutschland · bundesweit',
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thüringen',
};
const responseSchema = z.record(
  z.string().trim().min(1).max(100),
  z.object({
    datum: date,
    hinweis: z.string().max(2000).optional(),
  }),
);

export async function importHolidays(requestedYear, region, fetcher = fetch) {
  const y = year.parse(requestedYear);
  z.enum(Object.keys(holidayRegions)).parse(region);
  try {
    const url = new URL('https://feiertage-api.de/api/');
    url.searchParams.set('jahr', y);
    url.searchParams.set('nur_land', region);
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(10000),
      headers: { Accept: 'application/json' },
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Provider unavailable');
    const entries = Object.entries(responseSchema.parse(await response.json()));
    if (
      !entries.length ||
      entries.length > 100 ||
      entries.some(([, h]) => Number(h.datum.slice(0, 4)) !== y)
    )
      throw new Error('Invalid holiday year');
    const holidays = entries
      .map(([name, h]) => ({ date: h.datum, name, blockedSlots: 'FULL' }))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (new Set(holidays.map((h) => h.date)).size !== holidays.length)
      throw new Error('Duplicate dates');
    return {
      holidays,
      notes: entries
        .filter(([, h]) => h.hinweis?.trim())
        .map(([name, h]) => `${name}: ${h.hinweis.trim()}`),
    };
  } catch {
    fail(
      502,
      'HOLIDAY_IMPORT_FAILED',
      'Feiertage konnten nicht online geladen werden. Bitte später erneut versuchen oder manuell eintragen.',
    );
  }
}

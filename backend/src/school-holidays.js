import { z } from 'zod';
import { addDays, date, fail } from './domain.js';
import { holidayRegions } from './holiday-import.js';

export const schoolRegion = z.enum(
  Object.keys(holidayRegions).filter((code) => code !== 'NATIONAL'),
);
const schema = z
  .array(
    z.object({
      id: z.string().min(1).max(100),
      startDate: date,
      endDate: date,
      name: z.array(z.object({ language: z.string(), text: z.string().min(1).max(200) })).min(1),
      comment: z.array(z.object({ language: z.string(), text: z.string().max(2000) })).optional(),
    }),
  )
  .max(200);
const cache = new Map();

export async function loadSchoolHolidays(region, start, end, fetcher = fetch) {
  schoolRegion.parse(region);
  date.parse(start);
  date.parse(end);
  if (end <= start || (Date.parse(end) - Date.parse(start)) / 86400000 > 366)
    fail(400, 'INVALID_RANGE', 'Ungültiger Zeitraum.');
  const key = `${region}:${start}:${end}`;
  const cached = cache.get(key);
  if (fetcher === fetch && cached?.expires > Date.now()) return cached.items;
  try {
    const url = new URL('https://openholidaysapi.org/SchoolHolidays');
    url.search = new URLSearchParams({
      countryIsoCode: 'DE',
      subdivisionCode: `DE-${region}`,
      languageIsoCode: 'DE',
      validFrom: start,
      validTo: addDays(end, -1),
    });
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('Provider unavailable');
    const items = schema
      .parse(await response.json())
      .map((h) => {
        if (h.endDate < h.startDate) throw new Error('Invalid dates');
        return {
          id: h.id,
          startDate: h.startDate,
          endDate: h.endDate,
          name: (h.name.find((n) => n.language === 'DE') || h.name[0]).text,
          note: h.comment?.map((n) => n.text).join(' · ') || '',
        };
      })
      .filter((h) => h.startDate < end && h.endDate >= start);
    if (!items.length && (Date.parse(end) - Date.parse(start)) / 86400000 >= 365)
      fail(
        502,
        'SCHOOL_HOLIDAYS_UNAVAILABLE',
        'Für diesen Zeitraum sind noch keine Schulferien verfügbar.',
      );
    if (fetcher === fetch) {
      if (cache.size >= 64) cache.delete(cache.keys().next().value);
      cache.set(key, { items, expires: Date.now() + 6 * 3600000 });
    }
    return items;
  } catch (error) {
    if (error.code === 'SCHOOL_HOLIDAYS_UNAVAILABLE') throw error;
    fail(
      502,
      'SCHOOL_HOLIDAYS_FAILED',
      'Schulferien konnten nicht online geladen werden. Bitte später erneut versuchen.',
    );
  }
}

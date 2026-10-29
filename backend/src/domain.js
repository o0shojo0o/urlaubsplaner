import { z } from 'zod';
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}
export const fail = (status, code, message, details) => {
  throw new HttpError(status, code, message, details);
};
export function dateValid(s) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number(s.slice(0, 4)) >= 1900 &&
    !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) &&
    new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s
  );
}
export const date = z
  .string()
  .refine(dateValid, 'Gültiges Datum im Format JJJJ-MM-TT erforderlich.');
export const year = z.coerce.number().int().min(1900).max(9999);
export const part = z.enum(['FULL', 'AM', 'PM']);
export const reason = z.string().trim().min(3, 'Bitte eine Begründung angeben.').max(500);
export const password = z
  .string()
  .min(12, 'Das Passwort muss mindestens 12 Zeichen enthalten.')
  .max(256);
export const version = z.number().int().positive();
export const booking = z
  .object({
    startDate: date,
    endDate: date,
    startPart: part.default('FULL'),
    endPart: part.default('FULL'),
    privateNote: z.string().trim().max(1000).default(''),
    userId: z.string().optional(),
    reason: reason.optional(),
  })
  .strict();
export const addDays = (day, n) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const today = (timezone = 'Europe/Berlin') =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export function datesBetween(start, end, max = 366) {
  if (end < start) fail(422, 'INVALID_RANGE', 'Das Enddatum liegt vor dem Startdatum.');
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    out.push(d);
    if (out.length > max) fail(422, 'RANGE_TOO_LONG', `Maximal ${max} Kalendertage pro Buchung.`);
  }
  return out;
}
export function requestedSlots(input, day) {
  if (input.startDate === input.endDate) {
    if (input.startPart !== input.endPart)
      fail(
        422,
        'INVALID_PART',
        'Bei einem einzelnen Tag müssen die Tagesabschnitte übereinstimmen.',
      );
    return input.startPart === 'FULL' ? ['AM', 'PM'] : [input.startPart];
  }
  if (!['FULL', 'PM'].includes(input.startPart) || !['FULL', 'AM'].includes(input.endPart))
    fail(
      422,
      'INVALID_PART',
      'Mehrere Tage: Beginn ganztags oder nachmittags, Ende ganztags oder vormittags.',
    );
  if (day === input.startDate && input.startPart === 'PM') return ['PM'];
  if (day === input.endDate && input.endPart === 'AM') return ['AM'];
  return ['AM', 'PM'];
}
export const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  role: u.role,
  departmentId: u.departmentId,
  department: u.department,
  isActive: u.isActive,
  employmentStart: u.employmentStart,
  employmentEnd: u.employmentEnd,
  version: u.version,
});
export function assertAdmin(actor) {
  if (actor.role !== 'ADMIN') fail(403, 'FORBIDDEN', 'Administratorrechte erforderlich.');
}
export function assertOwner(actor, resource) {
  if (actor.role !== 'ADMIN' && resource.userId !== actor.id)
    fail(404, 'NOT_FOUND', 'Eintrag nicht gefunden.');
}
export function targetUser(actor, id) {
  if (id && actor.role !== 'ADMIN')
    fail(403, 'FORBIDDEN', 'Buchungen für andere Mitarbeiter sind nicht erlaubt.');
  return id || actor.id;
}
export function assertVersion(resource, expected) {
  if (resource.version !== expected)
    fail(409, 'VERSION_CONFLICT', 'Der Eintrag wurde inzwischen geändert. Bitte neu laden.');
}
export function pageArgs(query) {
  return {
    take: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .parse(query.limit || 100),
    skip: z.coerce
      .number()
      .int()
      .min(0)
      .max(1000000)
      .parse(query.offset || 0),
  };
}

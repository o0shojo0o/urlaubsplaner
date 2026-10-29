import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import request from 'supertest';
import argon2 from 'argon2';
import { addDays, today } from '../src/domain.js';
let db, app, dir, fixtures, passwordHash;
const y = Number(today().slice(0, 4)) + 1;
const monday = (() => {
  let d = `${y}-03-01`;
  while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 1) d = addDays(d, 1);
  return d;
})();
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'urlaubsplaner-test-'));
  process.env.DATABASE_URL = `file:${join(dir, 'test.db')}`;
  process.env.APP_ORIGIN = 'http://localhost:3000';
  const sqlite = new Database(join(dir, 'test.db'));
  sqlite.exec(await readFile('prisma/migrations/20261029000000_initial/migration.sql', 'utf8'));
  sqlite.close();
  ({ db } = await import('../src/db.js'));
  await (await import('../src/db.js')).initializeDatabase();
  app = (await import('../src/app.js')).createApp({ rateLimits: false });
  passwordHash = await argon2.hash('Test-Passphrase-2027');
});
beforeEach(async () => {
  const tables = [
    'idempotencyKey',
    'auditLog',
    'session',
    'passwordToken',
    'vacationSlot',
    'dayAllocation',
    'vacationDay',
    'vacation',
    'grantChange',
    'balanceGrant',
    'vacationBalance',
    'scheduleDay',
    'workSchedule',
    'user',
    'holiday',
    'holidayYear',
    'holidayCalendar',
    'department',
  ];
  for (const table of tables) await db[table].deleteMany();
  const d1 = await db.department.create({ data: { name: 'Design', nameKey: 'design' } });
  const d2 = await db.department.create({ data: { name: 'Engineering', nameKey: 'engineering' } });
  const calendar = await db.holidayCalendar.create({
    data: { name: 'Teststandort', code: 'TEST' },
  });
  for (const yr of [y - 2, y - 1, y, y + 1])
    await db.holidayYear.create({
      data: {
        calendarId: calendar.id,
        year: yr,
        state: 'READY',
        confirmedAt: new Date(),
        confirmedBy: 'fixture',
      },
    });
  const users = [];
  for (const [name, dept, role] of [
    ['Admin', d1.id, 'ADMIN'],
    ['Mia', d1.id, 'EMPLOYEE'],
    ['Lea', d2.id, 'EMPLOYEE'],
  ]) {
    const u = await db.user.create({
      data: {
        displayName: name,
        email: `${name.toLowerCase()}@example.test`,
        emailKey: `${name.toLowerCase()}@example.test`,
        departmentId: dept,
        role,
        passwordHash,
        employmentStart: `${y - 2}-01-01`,
        schedules: {
          create: {
            validFrom: `${y - 2}-01-01`,
            calendarId: calendar.id,
            days: {
              create: Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, isWorkday: i < 5 })),
            },
          },
        },
      },
    });
    for (const yr of [y - 2, y - 1, y, y + 1])
      await db.vacationBalance.create({
        data: {
          userId: u.id,
          year: yr,
          grants: {
            create: {
              kind: 'ANNUAL',
              grantedUnits: 60,
              validFrom: `${yr}-01-01`,
              reason: 'Testanspruch',
              createdBy: u.id,
            },
          },
        },
      });
    users.push(u);
  }
  fixtures = { admin: users[0], mia: users[1], lea: users[2], d1, d2, calendar };
});
afterAll(async () => {
  await db?.$disconnect();
  if (dir) await rm(dir, { recursive: true, force: true });
});
async function client(user = fixtures.mia) {
  const agent = request.agent(app);
  let csrf = (await agent.get('/api/v1/auth/csrf')).body.csrfToken;
  const login = await agent
    .post('/api/v1/auth/login')
    .set('Origin', 'http://localhost:3000')
    .set('X-CSRF-Token', csrf)
    .send({ email: user.email, password: 'Test-Passphrase-2027' });
  expect(login.status).toBe(200);
  csrf = login.body.csrfToken;
  return {
    agent,
    get: (path) => agent.get(`/api/v1${path}`),
    send: (path, body = {}, method = 'post', key = randomUUID()) =>
      agent[method](`/api/v1${path}`)
        .set('Origin', 'http://localhost:3000')
        .set('X-CSRF-Token', csrf)
        .set('Idempotency-Key', key)
        .send(body),
  };
}
const body = (start = monday, end = start) => ({
  startDate: start,
  endDate: end,
  startPart: 'FULL',
  endPart: 'FULL',
  privateNote: 'Privat und unsichtbar',
});
describe('Anmeldung, Sicherheit und Rechte', () => {
  it('verlangt Anmeldung und schützt Schreibzugriffe vor CSRF und falscher Origin', async () => {
    expect((await request(app).get('/api/v1/me')).status).toBe(401);
    const c = await client();
    expect((await c.agent.post('/api/v1/vacations').send(body())).status).toBe(403);
    expect(
      (await c.agent.post('/api/v1/vacations').set('Origin', 'https://evil.test').send(body()))
        .status,
    ).toBe(403);
    expect((await c.send('/admin/departments', { name: 'Fremd', color: '#123456' })).status).toBe(
      403,
    );
  });
  it('setzt HttpOnly/SameSite und beendet die Session bei Logout', async () => {
    const agent = request.agent(app);
    const r = await agent.get('/api/v1/auth/csrf');
    expect(r.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(r.headers['set-cookie'][0]).toContain('SameSite=Lax');
    const c = await client();
    expect((await c.send('/auth/logout')).status).toBe(200);
    expect((await c.get('/me')).status).toBe(401);
  });
  it('liefert keine HTML-Seite für unbekannte API-Routen', async () => {
    const c = await client();
    const r = await c.get('/does-not-exist');
    expect(r.status).toBe(404);
    expect(r.type).toBe('application/json');
  });
  it('begrenzt Teamkalender auf aktuelle Abteilung und verbirgt private Details', async () => {
    const admin = await client(fixtures.admin),
      mia = await client();
    const id = (
      await admin.send('/vacations', {
        ...body(),
        userId: fixtures.lea.id,
        reason: 'Admin Testbuchung',
      })
    ).body.id;
    const ownDept = await mia.get(`/calendar?start=${y}-01-01&endExclusive=${y + 1}-01-01`);
    expect(ownDept.body.items).toHaveLength(0);
    expect((await mia.get(`/vacations/${id}`)).status).toBe(404);
    expect(
      (
        await mia.get(
          `/calendar?start=${y}-01-01&endExclusive=${y + 1}-01-01&departmentId=${fixtures.d2.id}`,
        )
      ).status,
    ).toBe(403);
    const a = await admin.get(`/calendar?start=${y}-01-01&endExclusive=${y + 1}-01-01`);
    expect(a.body.items).toHaveLength(1);
    expect(a.body.items[0]).not.toHaveProperty('privateNote');
    expect(a.body.items[0]).not.toHaveProperty('email');
    expect((await mia.send('/vacations', { ...body(), userId: fixtures.lea.id })).status).toBe(403);
  });
  it('entzieht bei Deaktivierung den Zugriff und schützt letzten Admin', async () => {
    const c = await client();
    await db.user.update({ where: { id: fixtures.mia.id }, data: { isActive: false } });
    expect((await c.get('/me')).status).toBe(401);
    const admin = await client(fixtures.admin);
    const u = fixtures.admin;
    const r = await admin.send(
      `/admin/users/${u.id}`,
      {
        email: u.email,
        displayName: u.displayName,
        role: 'EMPLOYEE',
        departmentId: u.departmentId,
        employmentStart: u.employmentStart,
        employmentEnd: null,
        isActive: true,
        version: u.version,
        reason: 'Test Rollenwechsel',
      },
      'patch',
    );
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('LAST_ADMIN');
  });
  it('verbraucht Resetlinks nur einmal und speichert kein Klartexttoken', async () => {
    const admin = await client(fixtures.admin);
    const token = await admin.send(`/admin/users/${fixtures.mia.id}/password-reset-token`);
    expect(token.status).toBe(200);
    const row = await db.passwordToken.findFirst();
    expect(row.tokenHash).not.toBe(token.body.token);
    expect(await db.idempotencyKey.count()).toBe(0);
    const c = await client();
    const input = { token: token.body.token, password: 'Neue-Passphrase-2027' };
    expect((await c.send('/auth/reset-password', input)).status).toBe(200);
    expect((await c.send('/auth/reset-password', input)).status).toBe(403);
    const fresh = request.agent(app);
    const csrf = (await fresh.get('/api/v1/auth/csrf')).body.csrfToken;
    const retry = await fresh
      .post('/api/v1/auth/reset-password')
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrf)
      .send(input);
    expect(retry.status).toBe(422);
  });
});
describe('Buchung, Berechnung und Kontierung', () => {
  it('bucht sofort und belastet nur fünf Arbeitstage', async () => {
    const c = await client();
    const r = await c.send('/vacations', body(monday, addDays(monday, 6)));
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('BOOKED');
    expect(r.body.days).toHaveLength(5);
    const b = await c.get(`/me/balances?year=${y}`);
    expect(b.body.bookedUnits).toBe(10);
    expect(b.body.remainingUnits).toBe(50);
  });
  it('zieht Feiertage ab und berücksichtigt einen freien Halbtag', async () => {
    const hy = await db.holidayYear.findUnique({
      where: { calendarId_year: { calendarId: fixtures.calendar.id, year: y } },
    });
    await db.holiday.createMany({
      data: [
        { holidayYearId: hy.id, date: monday, name: 'Voll', blockedSlots: 'FULL' },
        { holidayYearId: hy.id, date: addDays(monday, 1), name: 'Halb', blockedSlots: 'AM' },
      ],
    });
    const c = await client();
    const r = await c.send('/vacations/preview', body(monday, addDays(monday, 4)));
    expect(r.status).toBe(200);
    expect(r.body.totalUnits).toBe(7);
  });
  it('berücksichtigt individuelle Mo/Mi/Fr-Arbeitstage', async () => {
    const schedule = await db.workSchedule.findFirst({ where: { userId: fixtures.mia.id } });
    await db.scheduleDay.updateMany({
      where: { scheduleId: schedule.id, weekday: { in: [2, 4] } },
      data: { isWorkday: false },
    });
    const c = await client();
    expect(
      (await c.send('/vacations/preview', body(monday, addDays(monday, 6)))).body.totalUnits,
    ).toBe(6);
  });
  it('erlaubt AM und PM getrennt, aber keine Doppelbelegung', async () => {
    const c = await client();
    for (const p of ['AM', 'PM'])
      expect((await c.send('/vacations', { ...body(), startPart: p, endPart: p })).status).toBe(
        201,
      );
    expect((await c.send('/vacations', body())).status).toBe(409);
    expect(await db.vacationSlot.count()).toBe(2);
  });
  it('lehnt reine Wochenenden und fehlende Feiertagsjahre ab', async () => {
    const c = await client();
    expect(
      (await c.send('/vacations', body(addDays(monday, 5), addDays(monday, 6)))).body.error.code,
    ).toBe('NO_CHARGEABLE_DAYS');
    await db.holidayYear.updateMany({ where: { year: y }, data: { state: 'DRAFT' } });
    expect((await c.send('/vacations', body())).body.error.code).toBe('HOLIDAYS_MISSING');
  });
  it('verbietet veraltete Versionen und rollt fehlgeschlagene Änderungen zurück', async () => {
    const c = await client();
    const old = (await c.send('/vacations', body())).body;
    const changed = await c.send(
      `/vacations/${old.id}`,
      { ...body(monday, addDays(monday, 1)), version: 999 },
      'patch',
    );
    expect(changed.status).toBe(409);
    const fail = await c.send(
      `/vacations/${old.id}`,
      { ...body(monday, addDays(monday, 80)), version: old.version },
      'patch',
    );
    expect(fail.status).toBe(409);
    const current = (await c.get(`/vacations/${old.id}`)).body;
    expect(current.endDate).toBe(monday);
    expect(current.days).toHaveLength(1);
    expect(await db.vacationSlot.count()).toBe(2);
  });
  it('erstattet bei wiederholtem Storno genau einmal', async () => {
    const c = await client();
    const v = (await c.send('/vacations', body())).body;
    const key = randomUUID();
    const a = await c.send(`/vacations/${v.id}/cancel`, { version: v.version }, 'post', key);
    const b = await c.send(`/vacations/${v.id}/cancel`, { version: v.version }, 'post', key);
    expect(a.status).toBe(200);
    expect(b.body.id).toBe(a.body.id);
    expect((await c.get(`/me/balances?year=${y}`)).body.remainingUnits).toBe(60);
    expect(await db.vacationSlot.count()).toBe(0);
    expect(await db.vacationDay.count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: 'VACATION_CANCELLED' } })).toBe(1);
  });
  it('verhindert doppelte Buchung durch Idempotenz und erkennt andere Nutzlast', async () => {
    const c = await client();
    const key = randomUUID();
    const a = await c.send('/vacations', body(), 'post', key),
      b = await c.send('/vacations', body(), 'post', key);
    expect(a.body.id).toBe(b.body.id);
    expect(await db.vacation.count()).toBe(1);
    expect(
      (await c.send('/vacations', body(addDays(monday, 1)), 'post', key)).body.error.code,
    ).toBe('IDEMPOTENCY_CONFLICT');
  });
  it('verhindert Überziehung durch zwei parallele Buchungen', async () => {
    const b = await db.vacationBalance.findUnique({
      where: { userId_year: { userId: fixtures.mia.id, year: y } },
    });
    await db.balanceGrant.updateMany({ where: { balanceId: b.id }, data: { grantedUnits: 2 } });
    const c1 = await client(),
      c2 = await client();
    const result = await Promise.all([
      c1.send('/vacations', body()),
      c2.send('/vacations', body(addDays(monday, 1))),
    ]);
    expect(result.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await c1.get(`/me/balances?year=${y}`)).body.remainingUnits).toBe(0);
  });
  it('ordnet Jahreswechsel den richtigen Konten zu', async () => {
    const c = await client();
    const r = await c.send('/vacations', body(`${y}-12-28`, `${y + 1}-01-08`));
    expect(r.status).toBe(201);
    const b1 = (await c.get(`/me/balances?year=${y}`)).body,
      b2 = (await c.get(`/me/balances?year=${y + 1}`)).body;
    expect(b1.bookedUnits).toBeGreaterThan(0);
    expect(b2.bookedUnits).toBeGreaterThan(0);
    expect(b1.bookedUnits + b2.bookedUnits).toBe(r.body.days.reduce((n, d) => n + d.units, 0));
  });
  it('nutzt abgelaufenes Guthaben nicht für spätere Tage', async () => {
    const b = await db.vacationBalance.findUnique({
      where: { userId_year: { userId: fixtures.mia.id, year: y } },
    });
    await db.balanceGrant.updateMany({
      where: { balanceId: b.id },
      data: { expiresOn: `${y}-02-28` },
    });
    const c = await client();
    expect((await c.send('/vacations', body())).body.error.code).toBe('INSUFFICIENT_BALANCE');
  });
});
describe('Administration und Datenbankintegrität', () => {
  it('prüft und speichert Feiertagsänderung ohne Preview-Seiteneffekte', async () => {
    const c = await client();
    await c.send('/vacations', body(monday, addDays(monday, 4)));
    const admin = await client(fixtures.admin);
    const hy = await db.holidayYear.findUnique({
      where: { calendarId_year: { calendarId: fixtures.calendar.id, year: y } },
    });
    const input = {
      version: hy.version,
      holidays: [{ date: monday, name: 'Testfeiertag', blockedSlots: 'FULL' }],
      reason: 'Feiertage ergänzt',
    };
    const url = `/admin/holiday-calendars/${fixtures.calendar.id}/years/${y}`;
    const preview = await admin.send(`${url}/preview`, input);
    expect(preview.status).toBe(200);
    expect(preview.body.impacts[0].afterUnits).toBe(8);
    expect(await db.holiday.count()).toBe(0);
    expect((await c.get(`/me/balances?year=${y}`)).body.bookedUnits).toBe(10);
    const result = await admin.send(
      url,
      { ...input, previewHash: preview.body.previewHash },
      'put',
    );
    expect(result.status).toBe(200);
    expect((await c.get(`/me/balances?year=${y}`)).body.bookedUnits).toBe(8);
  });
  it('weist veraltete Änderungsvorschau zurück', async () => {
    const admin = await client(fixtures.admin);
    const hy = await db.holidayYear.findUnique({
      where: { calendarId_year: { calendarId: fixtures.calendar.id, year: y } },
    });
    const url = `/admin/holiday-calendars/${fixtures.calendar.id}/years/${y}`;
    const input = { version: hy.version, holidays: [], reason: 'Feiertage geprüft' };
    const preview = await admin.send(`${url}/preview`, input);
    await db.holidayYear.update({ where: { id: hy.id }, data: { version: { increment: 1 } } });
    expect(
      (await admin.send(url, { ...input, previewHash: preview.body.previewHash }, 'put')).status,
    ).toBe(409);
  });
  it('ändert den Arbeitsplan mit atomarer Neuberechnung', async () => {
    const c = await client();
    await c.send('/vacations', body(monday, addDays(monday, 4)));
    const admin = await client(fixtures.admin);
    const input = {
      validFrom: monday,
      validTo: null,
      calendarId: fixtures.calendar.id,
      workdays: [1, 3, 5],
      reason: 'Wechsel in Teilzeit',
    };
    const url = `/admin/users/${fixtures.mia.id}/work-schedules`;
    const preview = await admin.send(`${url}/preview`, input);
    expect(preview.status).toBe(200);
    expect(preview.body.impacts[0].afterUnits).toBe(6);
    expect(
      (await admin.send(url, { ...input, previewHash: preview.body.previewHash })).status,
    ).toBe(200);
    expect((await c.get(`/me/balances?year=${y}`)).body.bookedUnits).toBe(6);
  });
  it('schließt das Vorjahr mit einmaligem Übertrag', async () => {
    const admin = await client(fixtures.admin);
    const b = await db.vacationBalance.findUnique({
      where: { userId_year: { userId: fixtures.mia.id, year: y - 2 } },
    });
    const input = {
      version: b.version,
      carryover: true,
      expiresOn: null,
      reason: 'Jahresabschluss Test',
    };
    expect((await admin.send(`/admin/balances/${b.id}/close`, input)).status).toBe(200);
    expect((await admin.send(`/admin/balances/${b.id}/close`, input)).status).toBe(409);
    expect(await db.balanceGrant.count({ where: { sourceBalanceId: b.id } })).toBe(1);
  });
  it('lässt Kontokorrekturen keine gebuchten Tage entziehen', async () => {
    const c = await client();
    await c.send('/vacations', body());
    const admin = await client(fixtures.admin);
    const b = (await c.get(`/me/balances?year=${y}`)).body;
    const r = await admin.send(`/admin/balances/${b.id}/adjustments`, {
      units: -60,
      validFrom: `${y}-01-01`,
      reason: 'Zu großer Abzug',
      version: b.version,
    });
    expect(r.status).toBe(409);
    expect((await c.get(`/me/balances?year=${y}`)).body.remainingUnits).toBe(58);
  });
  it('erzwingt Constraints, Foreign Keys und Überschneidungsschutz direkt in SQLite', async () => {
    await expect(
      db.user.update({ where: { id: fixtures.mia.id }, data: { role: 'SUPERUSER' } }),
    ).rejects.toThrow();
    await expect(db.department.delete({ where: { id: fixtures.d1.id } })).rejects.toThrow();
    await expect(
      db.workSchedule.create({
        data: { userId: fixtures.mia.id, validFrom: monday, calendarId: fixtures.calendar.id },
      }),
    ).rejects.toThrow();
    const result = await db.$queryRawUnsafe('PRAGMA foreign_key_check');
    expect(result).toEqual([]);
  });
});
describe('Physisch getrennte SQLite-Verbindungen', () => {
  it('serialisiert Buchungen aus zwei Prisma-Clients ohne Überziehung', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3');
    const { transaction } = await import('../src/transactions.js');
    const { bookVacation } = await import('../src/vacations.js');
    const second = new PrismaClient({
      adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL }),
    });
    const b = await db.vacationBalance.findUnique({
      where: { userId_year: { userId: fixtures.mia.id, year: y } },
    });
    await db.balanceGrant.updateMany({ where: { balanceId: b.id }, data: { grantedUnits: 2 } });
    try {
      const results = await Promise.allSettled([
        transaction((tx) => bookVacation(tx, fixtures.mia, body()), db),
        transaction((tx) => bookVacation(tx, fixtures.mia, body(addDays(monday, 1))), second),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((r) => r.status === 'rejected').reason.code).toBe('INSUFFICIENT_BALANCE');
      expect(await db.vacationSlot.count()).toBe(2);
    } finally {
      await second.$disconnect();
    }
  });
});

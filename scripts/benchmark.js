// Reproducible, isolated synthetic fixture; never connects to the configured company database.
import Database from 'better-sqlite3';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir, cpus, platform, arch } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import argon2 from 'argon2';
import { addDays } from '../backend/src/domain.js';
const folder = await mkdtemp(join(tmpdir(), 'freiraum-benchmark-'));
let server;
try {
  const filename = join(folder, 'load.db');
  const sqlite = new Database(filename);
  sqlite.exec(await readFile('prisma/migrations/20261029000000_initial/migration.sql', 'utf8'));
  const password = randomUUID(),
    passwordHash = await argon2.hash(password);
  const insert = (table, data) =>
    sqlite
      .prepare(
        `INSERT INTO "${table}" (${Object.keys(data)
          .map((k) => `"${k}"`)
          .join(',')}) VALUES (${Object.keys(data)
          .map(() => '?')
          .join(',')})`,
      )
      .run(...Object.values(data));
  const timestamp = Date.now();
  sqlite.transaction(() => {
    insert('settings', { id: 'company', updatedAt: timestamp });
    insert('departments', {
      id: 'team',
      name: 'Synthetic test department',
      nameKey: 'load',
      updatedAt: timestamp,
    });
    insert('holiday_calendars', { id: 'calendar', code: 'LOAD', name: 'Synthetic calendar' });
    insert('holiday_years', {
      id: 'year',
      calendarId: 'calendar',
      year: 2090,
      state: 'READY',
      confirmedAt: timestamp,
      confirmedBy: 'u0',
    });
    for (let u = 0; u < 500; u++) {
      const id = `u${u}`,
        scheduleId = `s${u}`,
        balanceId = `b${u}`,
        grantId = `g${u}`;
      insert('users', {
        id,
        email: `${id}@example.test`,
        emailKey: `${id}@example.test`,
        displayName: `Testperson ${u}`,
        passwordHash,
        departmentId: 'team',
        employmentStart: '2090-01-01',
        updatedAt: timestamp,
      });
      insert('work_schedules', {
        id: scheduleId,
        userId: id,
        validFrom: '2090-01-01',
        calendarId: 'calendar',
      });
      for (let w = 1; w <= 7; w++)
        insert('schedule_days', {
          id: `${scheduleId}-${w}`,
          scheduleId,
          weekday: w,
          isWorkday: w < 6 ? 1 : 0,
        });
      insert('vacation_balances', { id: balanceId, userId: id, year: 2090 });
      insert('balance_grants', {
        id: grantId,
        balanceId,
        kind: 'ANNUAL',
        grantedUnits: 120,
        validFrom: '2090-01-01',
        reason: 'Synthetic fixture',
        createdBy: id,
      });
      let day = '2090-01-02';
      for (let n = 0; n < 50; n++) {
        while ([0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay())) day = addDays(day, 1);
        const vacationId = `v${u}-${n}`,
          dayId = `d${u}-${n}`;
        insert('vacations', {
          id: vacationId,
          userId: id,
          startDate: day,
          endDate: day,
          createdBy: id,
          updatedBy: id,
          updatedAt: timestamp,
        });
        insert('vacation_days', {
          id: dayId,
          vacationId,
          date: day,
          scheduleId,
          holidayYearVersion: 1,
          units: 2,
        });
        insert('day_allocations', { id: `a${u}-${n}`, vacationDayId: dayId, grantId, units: 2 });
        for (const slot of ['AM', 'PM'])
          insert('vacation_slots', {
            id: `${dayId}-${slot}`,
            vacationDayId: dayId,
            userId: id,
            date: day,
            slot,
          });
        day = addDays(day, 1);
      }
    }
  })();
  sqlite.close();
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['backend/src/server.js'], {
    env: {
      ...process.env,
      DATABASE_URL: `file:${filename}`,
      PORT: String(port),
      APP_ORIGIN: origin,
      COOKIE_SECURE: 'false',
      NODE_ENV: 'test',
    },
    stdio: 'ignore',
  });
  for (let n = 0; n < 50; n++) {
    try {
      if ((await fetch(`${origin}/health/ready`)).ok) break;
    } catch {
      /* Server is still starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const clients = [];
  for (let n = 0; n < 20; n++) {
    let res = await fetch(`${origin}/api/v1/auth/csrf`);
    let cookie = res.headers.getSetCookie()[0].split(';')[0];
    let csrfToken = (await res.json()).csrfToken;
    res = await fetch(`${origin}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        Origin: origin,
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({ email: `u${n}@example.test`, password }),
    });
    if (!res.ok) throw new Error(`Login failed: ${res.status}`);
    cookie = res.headers.getSetCookie()[0].split(';')[0];
    csrfToken = (await res.json()).csrfToken;
    clients.push({ cookie, csrfToken });
  }
  const calendar = [],
    bookings = [];
  await Promise.all(
    clients.map(async (c) => {
      for (let i = 0; i < 8; i++) {
        const start = performance.now();
        const res = await fetch(
          `${origin}/api/v1/calendar?start=2090-01-01&endExclusive=2090-02-01`,
          { headers: { Cookie: c.cookie } },
        );
        await res.json();
        if (!res.ok) throw new Error(`Calendar: ${res.status}`);
        calendar.push(performance.now() - start);
      }
    }),
  );
  let bookingDay = '2090-06-01';
  while ([0, 6].includes(new Date(`${bookingDay}T12:00:00Z`).getUTCDay()))
    bookingDay = addDays(bookingDay, 1);
  await Promise.all(
    clients.map(async (c) => {
      const start = performance.now();
      const res = await fetch(`${origin}/api/v1/vacations`, {
        method: 'POST',
        headers: {
          Cookie: c.cookie,
          Origin: origin,
          'Content-Type': 'application/json',
          'X-CSRF-Token': c.csrfToken,
          'Idempotency-Key': randomUUID(),
        },
        body: JSON.stringify({ startDate: bookingDay, endDate: bookingDay }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(`Booking: ${JSON.stringify(body)}`);
      bookings.push(performance.now() - start);
    }),
  );
  const p95 = (values) =>
    Math.round(values.sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]);
  const result = {
    fixture: { users: 500, vacations: 25000, concurrentSessions: 20 },
    hardware: { platform: platform(), arch: arch(), cpu: cpus()[0].model, node: process.version },
    calendar: { samples: calendar.length, p95ms: p95(calendar) },
    bookings: { samples: bookings.length, p95ms: p95(bookings) },
  };
  console.log(JSON.stringify(result, null, 2));
  if (result.calendar.p95ms >= 500 || result.bookings.p95ms >= 1000) process.exitCode = 1;
} finally {
  if (server) {
    const exit = once(server, 'exit');
    server.kill('SIGTERM');
    await exit;
  }
  await rm(folder, { recursive: true, force: true });
}

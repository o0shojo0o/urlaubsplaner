// Temporary, localhost-only test app. Never uses the company's configured database.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import argon2 from 'argon2';
const folder = await mkdtemp(join(tmpdir(), 'freiraum-e2e-'));
process.env.DATABASE_URL = `file:${join(folder, 'test.db')}`;
process.env.APP_ORIGIN = 'http://127.0.0.1:4173';
process.env.COOKIE_SECURE = 'false';
const native = new Database(join(folder, 'test.db'));
native.exec(await readFile('prisma/migrations/20261029000000_initial/migration.sql', 'utf8'));
native.close();
const { db, initializeDatabase } = await import('../backend/src/db.js');
const { createApp } = await import('../backend/src/app.js');
const { createBalance } = await import('../backend/src/admin.js');
const { bookVacation } = await import('../backend/src/vacations.js');
const { today } = await import('../backend/src/domain.js');
await initializeDatabase();
const year = Number(today().slice(0, 4)) + 1;
const passwordHash = await argon2.hash('E2E-only-passphrase-2026');
const dept = await db.department.create({ data: { name: 'Designteam', nameKey: 'design' } });
const other = await db.department.create({ data: { name: 'Andere Abteilung', nameKey: 'other' } });
const calendar = await db.holidayCalendar.create({ data: { code: 'TEST', name: 'Testkalender' } });
await db.holidayYear.create({
  data: {
    calendarId: calendar.id,
    year,
    state: 'READY',
    confirmedAt: new Date(),
    confirmedBy: 'e2e',
  },
});
let admin;
for (const [name, email, departmentId, role] of [
  ['Test Admin', 'admin@example.test', dept.id, 'ADMIN'],
  ['Test Mia', 'mia@example.test', dept.id, 'EMPLOYEE'],
  ['Private Kollegin', 'private@example.test', other.id, 'EMPLOYEE'],
]) {
  const u = await db.user.create({
    data: {
      displayName: name,
      email,
      emailKey: email,
      passwordHash,
      role,
      departmentId,
      employmentStart: `${year - 1}-01-01`,
      schedules: {
        create: {
          validFrom: `${year - 1}-01-01`,
          calendarId: calendar.id,
          days: {
            create: Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, isWorkday: i < 5 })),
          },
        },
      },
    },
  });
  admin ||= u;
  await createBalance(db, admin, u.id, year, 60);
  if (role === 'EMPLOYEE' && departmentId === other.id)
    await bookVacation(db, admin, {
      startDate: `${year}-07-01`,
      endDate: `${year}-07-07`,
      startPart: 'FULL',
      endPart: 'FULL',
      privateNote: 'Darf nicht im Team sichtbar sein',
      userId: u.id,
      reason: 'E2E-Fixture',
    });
}
const server = createApp().listen(4173, '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () =>
    server.close(async () => {
      await db.$disconnect();
      await rm(folder, { recursive: true, force: true });
      process.exit(0);
    }),
  );

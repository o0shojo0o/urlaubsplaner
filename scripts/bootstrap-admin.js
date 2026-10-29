import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import argon2 from 'argon2';
import { db, initializeDatabase } from '../backend/src/db.js';
import { password, today } from '../backend/src/domain.js';
import { z } from 'zod';
import { createBalance } from '../backend/src/admin.js';
import { audit, transaction } from '../backend/src/transactions.js';
let hide = false;
const output = new Writable({
  write(chunk, encoding, cb) {
    if (!hide) process.stdout.write(chunk, encoding);
    cb();
  },
});
const rl = createInterface({
  input: process.stdin,
  output,
  terminal: Boolean(process.stdin.isTTY),
});
try {
  await initializeDatabase();
  if (await db.user.count({ where: { role: 'ADMIN' } }))
    throw new Error('Ein Administrator existiert bereits.');
  const displayName = z
    .string()
    .min(2)
    .parse(await rl.question('Name: '));
  const email = z.email().parse((await rl.question('E-Mail: ')).trim().toLowerCase());
  process.stdout.write('Passwort (mindestens 12 Zeichen, Eingabe verborgen): ');
  hide = true;
  const secret = password.parse(await rl.question(''));
  hide = false;
  process.stdout.write('\n');
  const passwordHash = await argon2.hash(secret, { type: argon2.argon2id });
  await transaction(async (tx) => {
    if (await tx.user.count({ where: { role: 'ADMIN' } }))
      throw new Error('Ein Administrator existiert bereits.');
    const dept = await tx.department.create({
      data: { name: 'Verwaltung', nameKey: 'verwaltung', color: '#0d9488' },
    });
    const calendar = await tx.holidayCalendar.create({
      data: { code: 'HQ', name: 'Hauptstandort' },
    });
    const user = await tx.user.create({
      data: {
        displayName,
        email,
        emailKey: email,
        passwordHash,
        role: 'ADMIN',
        departmentId: dept.id,
        employmentStart: today(),
        schedules: {
          create: {
            validFrom: today(),
            calendarId: calendar.id,
            days: {
              create: Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, isWorkday: i < 5 })),
            },
          },
        },
      },
    });
    await createBalance(tx, user, user.id, Number(today().slice(0, 4)), 60);
    await audit(tx, user, 'ADMIN_BOOTSTRAPPED', 'user', user.id, null, {
      userId: user.id,
      displayName,
    });
  });
  console.log('Admin erstellt. Vor der ersten Buchung Feiertage im Adminbereich bestätigen.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  rl.close();
  await db.$disconnect();
}

import argon2 from 'argon2';
import { z } from 'zod';
import { password, today, fail } from './domain.js';
import { createBalance } from './admin.js';
import { audit, transaction } from './transactions.js';
export async function createFirstAdmin(input) {
  const {
    displayName,
    email,
    password: secret,
  } = z
    .object({
      displayName: z.string().trim().min(2).max(100),
      email: z
        .email()
        .max(254)
        .transform((value) => value.trim().toLowerCase()),
      password,
    })
    .strict()
    .parse(input);
  const passwordHash = await argon2.hash(secret, { type: argon2.argon2id });
  return transaction(async (tx) => {
    if (await tx.user.count({ where: { role: 'ADMIN' } }))
      fail(409, 'SETUP_COMPLETE', 'Die Einrichtung ist bereits abgeschlossen.');
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
    return user;
  });
}

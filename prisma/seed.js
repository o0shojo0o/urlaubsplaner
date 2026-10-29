import argon2 from 'argon2';
import { db, initializeDatabase } from '../backend/src/db.js';
import { addDays, today } from '../backend/src/domain.js';
import { createBalance } from '../backend/src/admin.js';
import { bookVacation } from '../backend/src/vacations.js';
import { transaction } from '../backend/src/transactions.js';
import { randomToken } from '../backend/src/auth.js';
try {
  await initializeDatabase();
  if (await db.user.count()) throw new Error('Demo nur auf einer leeren Datenbank zulässig.');
  const demoPassword = randomToken().slice(0, 20);
  const passwordHash = await argon2.hash(demoPassword);
  const clock = today(),
    currentYear = Number(clock.slice(0, 4));
  await transaction(async (tx) => {
    await tx.setting.update({
      where: { id: 'company' },
      data: { companyName: 'Nordlicht Studio' },
    });
    const departments = [];
    for (const [name, color] of [
      ['Design & Produkt', '#0d9488'],
      ['Engineering', '#6366f1'],
      ['People & Operations', '#d97706'],
    ])
      departments.push(
        await tx.department.create({ data: { name, nameKey: name.toLowerCase(), color } }),
      );
    const calendar = await tx.holidayCalendar.create({
      data: { code: 'DE-DEMO', name: 'Demo · nur bundeseinheitliche Feiertage' },
    });
    // Demo calendar intentionally explicit; production calendars must be reviewed per location.
    for (const y of [currentYear, currentYear + 1]) {
      const hy = await tx.holidayYear.create({
        data: { calendarId: calendar.id, year: y, state: 'DRAFT' },
      });
      const easter = (year) => {
        const a = year % 19,
          b = Math.floor(year / 100),
          c = year % 100,
          d = Math.floor(b / 4),
          e = b % 4,
          f = Math.floor((b + 8) / 25),
          g = Math.floor((b - f + 1) / 3),
          h = (19 * a + b - d - g + 15) % 30,
          i = Math.floor(c / 4),
          k = c % 4,
          l = (32 + 2 * e + 2 * i - h - k) % 7,
          m = Math.floor((a + 11 * h + 22 * l) / 451),
          month = Math.floor((h + l - 7 * m + 114) / 31),
          day = ((h + l - 7 * m + 114) % 31) + 1;
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      };
      const es = easter(y);
      const holidays = [
        [`${y}-01-01`, 'Neujahr'],
        [addDays(es, -2), 'Karfreitag'],
        [addDays(es, 1), 'Ostermontag'],
        [`${y}-05-01`, 'Tag der Arbeit'],
        [addDays(es, 39), 'Christi Himmelfahrt'],
        [addDays(es, 50), 'Pfingstmontag'],
        [`${y}-10-03`, 'Tag der Deutschen Einheit'],
        [`${y}-12-25`, '1. Weihnachtstag'],
        [`${y}-12-26`, '2. Weihnachtstag'],
      ];
      await tx.holiday.createMany({
        data: holidays.map(([date, name]) => ({ holidayYearId: hy.id, date, name })),
      });
    }
    const users = [];
    for (const [index, [displayName, email, departmentIndex, role]] of [
      ['Alex Morgan', 'admin@example.test', 0, 'ADMIN'],
      ['Mia Weber', 'mia@example.test', 0, 'EMPLOYEE'],
      ['Jonas Fischer', 'jonas@example.test', 0, 'EMPLOYEE'],
      ['Lea Hoffmann', 'lea@example.test', 1, 'EMPLOYEE'],
      ['Noah Becker', 'noah@example.test', 2, 'EMPLOYEE'],
    ].entries()) {
      const u = await tx.user.create({
        data: {
          displayName,
          email,
          emailKey: email,
          passwordHash,
          departmentId: departments[departmentIndex].id,
          role,
          employmentStart: `${currentYear}-01-01`,
          schedules: {
            create: {
              validFrom: `${currentYear}-01-01`,
              calendarId: calendar.id,
              days: {
                create: Array.from({ length: 7 }, (_, i) => ({
                  weekday: i + 1,
                  isWorkday: index === 2 ? [0, 2, 4].includes(i) : i < 5,
                })),
              },
            },
          },
        },
      });
      users.push(u);
      for (const y of [currentYear, currentYear + 1])
        await createBalance(tx, users[0], u.id, y, index === 2 ? 36 : 60);
    }
    await tx.holidayYear.updateMany({
      data: { state: 'READY', confirmedBy: users[0].id, confirmedAt: new Date() },
    });
    for (let i = 0; i < users.length; i++) {
      let start = addDays(clock, 4 + i * 4);
      while ([0, 6].includes(new Date(`${start}T12:00:00Z`).getUTCDay())) start = addDays(start, 1);
      await bookVacation(tx, users[0], {
        startDate: start,
        endDate: addDays(start, 3),
        startPart: 'FULL',
        endPart: 'FULL',
        privateNote: '',
        userId: users[i].id,
        reason: 'Demonstrationsbuchung',
      });
    }
  });
  console.log(
    `Demo angelegt. Anmeldung: admin@example.test oder mia@example.test\nEinmalig erzeugtes Demopasswort: ${demoPassword}\nNur für lokale Demonstration, keine Produktionsdaten.`,
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}

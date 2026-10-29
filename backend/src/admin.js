import { Router } from 'express';
import { z } from 'zod';
import argon2 from 'argon2';
import { db } from './db.js';
import {
  assertAdmin,
  assertVersion,
  date,
  fail,
  pageArgs,
  part,
  publicUser,
  reason,
  today,
  version,
  year,
} from './domain.js';
import { audit, hash, mutate, transaction } from './transactions.js';
import { randomToken } from './auth.js';
import { balanceView, calculate, vacationInclude } from './vacations.js';
const scheduleSchema = z
  .object({
    validFrom: date,
    validTo: date.nullable().default(null),
    calendarId: z.string(),
    workdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    reason,
    previewHash: z.string().optional(),
  })
  .strict();
const holidaysSchema = z
  .object({
    version: version.optional(),
    holidays: z
      .array(
        z
          .object({
            date,
            name: z.string().trim().min(1).max(100),
            blockedSlots: part.default('FULL'),
          })
          .strict(),
      )
      .max(100),
    reason,
    previewHash: z.string().optional(),
  })
  .strict();
async function grant(
  tx,
  actor,
  balanceId,
  kind,
  units,
  validFrom,
  expiresOn,
  explanation,
  sourceBalanceId,
) {
  if (!units) return null;
  return tx.balanceGrant.create({
    data: {
      balanceId,
      kind,
      grantedUnits: units,
      validFrom,
      expiresOn,
      sourceBalanceId,
      reason: explanation,
      createdBy: actor.id,
      changes: { create: { deltaGrantedUnits: units, actorId: actor.id, reason: explanation } },
    },
  });
}
export async function createBalance(tx, actor, userId, y, units) {
  const b = await tx.vacationBalance.create({ data: { userId, year: y } });
  await grant(tx, actor, b.id, 'ANNUAL', units, `${y}-01-01`, null, 'Jahresanspruch');
  return b;
}
async function reallocate(tx, actor, affected, explanation, requestId) {
  const clock = today();
  if (affected.some((v) => v.startDate <= clock && v.endDate >= clock))
    fail(
      409,
      'ONGOING_BOOKING',
      'Laufender Urlaub muss vor einer betroffenen Konfigurationsänderung ausdrücklich korrigiert werden.',
    );
  const future = affected.filter((v) => v.startDate > clock);
  const ids = future.map((v) => v.id);
  await tx.vacationSlot.deleteMany({ where: { vacationDay: { vacationId: { in: ids } } } });
  await tx.dayAllocation.deleteMany({ where: { vacationDay: { vacationId: { in: ids } } } });
  await tx.vacationDay.deleteMany({ where: { vacationId: { in: ids } } });
  const impacts = [];
  for (const v of future.sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id),
  )) {
    const calculated = await calculate(tx, actor, {
      startDate: v.startDate,
      endDate: v.endDate,
      startPart: v.startPart,
      endPart: v.endPart,
      userId: v.userId,
      reason: explanation,
    });
    for (const d of calculated.days)
      await tx.vacationDay.create({
        data: {
          vacationId: v.id,
          date: d.date,
          units: d.units,
          scheduleId: d.scheduleId,
          holidayYearVersion: d.holidayYearVersion,
          slots: { create: d.slots.map((slot) => ({ userId: v.userId, date: d.date, slot })) },
          allocations: { create: d.allocations },
        },
      });
    await tx.vacationBalance.updateMany({
      where: {
        userId: v.userId,
        year: {
          in: [...new Set([...v.days, ...calculated.days].map((d) => Number(d.date.slice(0, 4))))],
        },
      },
      data: { version: { increment: 1 } },
    });
    await tx.vacation.update({
      where: { id: v.id },
      data: { version: { increment: 1 }, updatedBy: actor.id },
    });
    impacts.push({
      id: v.id,
      displayName: v.user.displayName,
      startDate: v.startDate,
      beforeUnits: v.days.reduce((n, d) => n + d.units, 0),
      afterUnits: calculated.totalUnits,
    });
    await audit(
      tx,
      actor,
      'VACATION_RECALCULATED',
      'vacation',
      v.id,
      v,
      { userId: v.userId, years: calculated.years, units: calculated.totalUnits },
      explanation,
      requestId,
    );
  }
  return impacts;
}
class PreviewResult extends Error {
  constructor(value) {
    super('preview rollback');
    this.value = value;
  }
}
async function configurationChange(req, operation, input, preview, change) {
  const run = async (tx, actor) => {
    assertAdmin(actor);
    const result = await change(tx, actor);
    const previewHash = hash(JSON.stringify(result.fingerprint));
    if (preview) throw new PreviewResult({ impacts: result.impacts, previewHash });
    if (input.previewHash !== previewHash)
      fail(409, 'PREVIEW_STALE', 'Bitte die Änderungsvorschau erneut laden und bestätigen.');
    return { ok: true, impacts: result.impacts };
  };
  if (!preview) return mutate(req, operation, run);
  try {
    await transaction(async (tx) => {
      const actor = await tx.user.findUnique({ where: { id: req.user.id } });
      if (!actor?.isActive || actor.authVersion !== req.session.authVersion)
        fail(401, 'SESSION_EXPIRED', 'Bitte erneut anmelden.');
      return run(tx, actor);
    });
  } catch (e) {
    if (e instanceof PreviewResult) return e.value;
    throw e;
  }
}
export function adminRoutes() {
  const r = Router();
  const mutation = (req, operation, fn) =>
    mutate(req, operation, (tx, actor) => {
      assertAdmin(actor);
      return fn(tx, actor);
    });
  r.get('/users', async (req, res) => {
    const q = z
      .string()
      .max(100)
      .parse(req.query.q || '');
    const where = q
      ? { OR: [{ displayName: { contains: q } }, { emailKey: { contains: q.toLowerCase() } }] }
      : {};
    res.json({
      items: (
        await db.user.findMany({
          where,
          include: { department: true },
          orderBy: { displayName: 'asc' },
          ...pageArgs(req.query),
        })
      ).map(publicUser),
      total: await db.user.count({ where }),
    });
  });
  r.get('/users/:id', async (req, res) =>
    res.json(
      publicUser(
        await db.user.findUniqueOrThrow({
          where: { id: req.params.id },
          include: { department: true },
        }),
      ),
    ),
  );
  const userFields = {
    email: z
      .email()
      .max(254)
      .transform((s) => s.trim().toLowerCase()),
    displayName: z.string().trim().min(2).max(100),
    role: z.enum(['EMPLOYEE', 'ADMIN']),
    departmentId: z.string(),
    employmentStart: date,
    employmentEnd: date.nullable().default(null),
  };
  r.post('/users', async (req, res) => {
    const input = z
      .object({
        ...userFields,
        calendarId: z.string(),
        workdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
        allowanceUnits: z.number().int().min(0).max(732),
        year,
      })
      .strict()
      .parse(req.body);
    if (input.employmentEnd && input.employmentEnd < input.employmentStart)
      fail(422, 'INVALID_RANGE', 'Ungültiger Beschäftigungszeitraum.');
    const passwordHash = await argon2.hash(randomToken(), { type: argon2.argon2id });
    const result = await mutation(req, 'user:create', async (tx, actor) => {
      const department = await tx.department.findUniqueOrThrow({
        where: { id: input.departmentId },
      });
      if (department.archived) fail(422, 'DEPARTMENT_ARCHIVED', 'Diese Abteilung ist archiviert.');
      const { calendarId, workdays, allowanceUnits, year: y, ...fields } = input;
      const user = await tx.user.create({
        data: {
          ...fields,
          emailKey: fields.email,
          passwordHash,
          schedules: {
            create: {
              validFrom: input.employmentStart,
              calendarId,
              days: {
                create: Array.from({ length: 7 }, (_, i) => ({
                  weekday: i + 1,
                  isWorkday: workdays.includes(i + 1),
                })),
              },
            },
          },
        },
        include: { department: true },
      });
      await createBalance(tx, actor, user.id, y, allowanceUnits);
      await audit(
        tx,
        actor,
        'USER_CREATED',
        'user',
        user.id,
        null,
        publicUser(user),
        undefined,
        req.id,
      );
      return publicUser(user);
    });
    res.status(201).json(result);
  });
  r.patch('/users/:id', async (req, res) => {
    const input = z
      .object({ ...userFields, isActive: z.boolean(), version, reason })
      .strict()
      .parse(req.body);
    res.json(
      await mutation(req, `user:update:${req.params.id}`, async (tx, actor) => {
        const before = await tx.user.findUniqueOrThrow({
          where: { id: req.params.id },
          include: { department: true },
        });
        assertVersion(before, input.version);
        if (input.employmentEnd && input.employmentEnd < input.employmentStart)
          fail(422, 'INVALID_RANGE', 'Ungültiger Beschäftigungszeitraum.');
        if (
          before.role === 'ADMIN' &&
          before.isActive &&
          (input.role !== 'ADMIN' || !input.isActive) &&
          (await tx.user.count({ where: { role: 'ADMIN', isActive: true } })) <= 1
        )
          fail(409, 'LAST_ADMIN', 'Der letzte aktive Administrator kann nicht entfernt werden.');
        if (
          input.isActive &&
          (await tx.department.findUniqueOrThrow({ where: { id: input.departmentId } })).archived
        )
          fail(422, 'DEPARTMENT_ARCHIVED', 'Abteilung ist archiviert.');
        const collision = await tx.vacation.count({
          where: {
            userId: before.id,
            status: 'BOOKED',
            OR: [
              { startDate: { lt: input.employmentStart } },
              ...(input.employmentEnd ? [{ endDate: { gt: input.employmentEnd } }] : []),
            ],
          },
        });
        if (collision)
          fail(
            409,
            'EMPLOYMENT_CONFLICT',
            'Bestehende Buchungen liegen außerhalb der neuen Beschäftigung.',
          );
        const { version: _v, reason: explanation, ...fields } = input;
        const user = await tx.user.update({
          where: { id: before.id },
          data: {
            ...fields,
            emailKey: fields.email,
            version: { increment: 1 },
            authVersion: { increment: 1 },
          },
          include: { department: true },
        });
        await tx.session.deleteMany({ where: { userId: before.id } });
        await audit(
          tx,
          actor,
          'USER_UPDATED',
          'user',
          user.id,
          publicUser(before),
          publicUser(user),
          explanation,
          req.id,
        );
        return publicUser(user);
      }),
    );
  });
  for (const [path, purpose] of [
    ['activation-token', 'ACTIVATE'],
    ['password-reset-token', 'RESET'],
  ])
    r.post(`/users/:id/${path}`, async (req, res) => {
      z.object({}).strict().parse(req.body);
      const token = randomToken();
      // Do not persist the plaintext token in an idempotency response or audit.
      await transaction(async (tx) => {
        const actor = await tx.user.findUniqueOrThrow({ where: { id: req.user.id } });
        assertAdmin(actor);
        if (!actor.isActive || actor.authVersion !== req.session.authVersion)
          fail(401, 'SESSION_EXPIRED', 'Bitte erneut anmelden.');
        const user = await tx.user.findUniqueOrThrow({ where: { id: req.params.id } });
        if (!user.isActive) fail(422, 'USER_INACTIVE', 'Mitarbeiter nicht aktiv.');
        await tx.passwordToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        await tx.passwordToken.create({
          data: {
            tokenHash: hash(token),
            userId: user.id,
            purpose,
            expiresAt: new Date(Date.now() + (purpose === 'RESET' ? 3600000 : 86400000)),
          },
        });
        await audit(
          tx,
          actor,
          `${purpose}_TOKEN_CREATED`,
          'user',
          user.id,
          null,
          null,
          undefined,
          req.id,
        );
      });
      res.json({
        token,
        purpose,
        url: `${process.env.APP_ORIGIN || 'http://localhost:3000'}/#activate=${token}`,
      });
    });
  r.post('/users/:id/revoke-sessions', async (req, res) =>
    res.json(
      await mutation(req, `sessions:revoke:${req.params.id}`, async (tx, actor) => {
        await tx.user.update({
          where: { id: req.params.id },
          data: { authVersion: { increment: 1 } },
        });
        await tx.session.deleteMany({ where: { userId: req.params.id } });
        await audit(
          tx,
          actor,
          'SESSIONS_REVOKED',
          'user',
          req.params.id,
          null,
          null,
          undefined,
          req.id,
        );
        return { ok: true };
      }),
    ),
  );
  r.get('/departments', async (req, res) =>
    res.json(
      await db.department.findMany({
        include: { _count: { select: { users: true } } },
        orderBy: { name: 'asc' },
      }),
    ),
  );
  const departmentSchema = z
    .object({
      name: z.string().trim().min(2).max(100),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      archived: z.boolean().default(false),
    })
    .strict();
  for (const method of ['post', 'patch'])
    r[method](`/departments${method === 'patch' ? '/:id' : ''}`, async (req, res) => {
      const input = departmentSchema.parse(req.body);
      res.json(
        await mutation(req, `department:${method}:${req.params.id || ''}`, async (tx, actor) => {
          if (
            input.archived &&
            req.params.id &&
            (await tx.user.count({ where: { departmentId: req.params.id, isActive: true } }))
          )
            fail(409, 'DEPARTMENT_NOT_EMPTY', 'Abteilung enthält aktive Mitarbeiter.');
          const before = req.params.id
            ? await tx.department.findUniqueOrThrow({ where: { id: req.params.id } })
            : null;
          const data = { ...input, nameKey: input.name.toLocaleLowerCase('de-DE') };
          const after = before
            ? await tx.department.update({ where: { id: before.id }, data })
            : await tx.department.create({ data });
          await audit(
            tx,
            actor,
            'DEPARTMENT_CHANGED',
            'department',
            after.id,
            before,
            after,
            undefined,
            req.id,
          );
          return after;
        }),
      );
    });
  r.get('/holiday-calendars', async (req, res) =>
    res.json(
      await db.holidayCalendar.findMany({
        include: { years: { include: { holidays: true }, orderBy: { year: 'desc' } } },
        orderBy: { name: 'asc' },
      }),
    ),
  );
  r.post('/holiday-calendars', async (req, res) => {
    const input = z
      .object({ code: z.string().trim().min(2).max(30), name: z.string().trim().min(2).max(100) })
      .strict()
      .parse(req.body);
    res.status(201).json(
      await mutation(req, 'calendar:create', async (tx, actor) => {
        const c = await tx.holidayCalendar.create({ data: input });
        await audit(
          tx,
          actor,
          'CALENDAR_CREATED',
          'holiday_calendar',
          c.id,
          null,
          c,
          undefined,
          req.id,
        );
        return c;
      }),
    );
  });
  const holidaysChange = (req, input, y) => async (tx, actor) => {
    const before = await tx.holidayYear.findUnique({
      where: { calendarId_year: { calendarId: req.params.id, year: y } },
      include: { holidays: true },
    });
    if (before && input.version !== before.version)
      fail(409, 'VERSION_CONFLICT', 'Feiertage wurden inzwischen geändert.');
    if (
      new Set(input.holidays.map((h) => h.date)).size !== input.holidays.length ||
      input.holidays.some((h) => Number(h.date.slice(0, 4)) !== y)
    )
      fail(422, 'HOLIDAY_INVALID', 'Feiertage müssen eindeutig sein und zum Jahr gehören.');
    const schedules = await tx.workSchedule.findMany({ where: { calendarId: req.params.id } });
    const affected = await tx.vacation.findMany({
      where: {
        userId: { in: schedules.map((s) => s.userId) },
        status: 'BOOKED',
        startDate: { lte: `${y}-12-31` },
        endDate: { gte: `${y}-01-01` },
      },
      include: vacationInclude,
    });
    if (
      affected.length &&
      (await tx.vacationBalance.count({
        where: { userId: { in: affected.map((v) => v.userId) }, year: y, state: 'CLOSED' },
      }))
    )
      fail(409, 'YEAR_CLOSED', 'Betroffene Kontojahre sind geschlossen.');
    if (before?.state === 'READY') {
      const pastOld = before.holidays
        .filter((h) => h.date <= today())
        .map((h) => [h.date, h.name, h.blockedSlots])
        .sort();
      const pastNew = input.holidays
        .filter((h) => h.date <= today())
        .map((h) => [h.date, h.name, h.blockedSlots])
        .sort();
      if (JSON.stringify(pastOld) !== JSON.stringify(pastNew))
        fail(
          409,
          'HISTORICAL_CHANGE',
          'Bestätigte vergangene Feiertage können nicht stillschweigend verändert werden.',
        );
    }
    const hy =
      before || (await tx.holidayYear.create({ data: { calendarId: req.params.id, year: y } }));
    await tx.holiday.deleteMany({ where: { holidayYearId: hy.id } });
    await tx.holiday.createMany({
      data: input.holidays.map((h) => ({ ...h, holidayYearId: hy.id })),
    });
    await tx.holidayYear.update({
      where: { id: hy.id },
      data: {
        state: 'READY',
        version: { increment: 1 },
        confirmedAt: new Date(),
        confirmedBy: actor.id,
      },
    });
    const impacts = await reallocate(tx, actor, affected, input.reason, req.id);
    await audit(
      tx,
      actor,
      'HOLIDAYS_CHANGED',
      'holiday_year',
      hy.id,
      before,
      { year: y, holidays: input.holidays },
      input.reason,
      req.id,
    );
    return {
      impacts,
      fingerprint: {
        beforeVersion: before?.version || 0,
        holidays: input.holidays,
        reason: input.reason,
        bookings: affected.map((v) => [v.id, v.version]),
        impacts,
      },
    };
  };
  r.post('/holiday-calendars/:id/years/:year/preview', async (req, res) => {
    const input = holidaysSchema.parse(req.body),
      y = year.parse(req.params.year);
    res.json(
      await configurationChange(
        req,
        `holidays:${req.params.id}:${y}`,
        input,
        true,
        holidaysChange(req, input, y),
      ),
    );
  });
  r.put('/holiday-calendars/:id/years/:year', async (req, res) => {
    const input = holidaysSchema.parse(req.body),
      y = year.parse(req.params.year);
    res.json(
      await configurationChange(
        req,
        `holidays:${req.params.id}:${y}`,
        input,
        false,
        holidaysChange(req, input, y),
      ),
    );
  });
  r.get('/users/:id/work-schedules', async (req, res) =>
    res.json(
      await db.workSchedule.findMany({
        where: { userId: req.params.id },
        include: { days: true, calendar: true },
        orderBy: { validFrom: 'asc' },
      }),
    ),
  );
  const scheduleChange = (req, input) => async (tx, actor) => {
    if (input.validTo && input.validTo <= input.validFrom)
      fail(422, 'INVALID_RANGE', 'Ungültiger Gültigkeitszeitraum.');
    const before = await tx.workSchedule.findMany({
      where: { userId: req.params.id },
      include: { days: true },
      orderBy: { validFrom: 'asc' },
    });
    const existing = before.find(
      (s) => s.validFrom <= input.validFrom && (!s.validTo || s.validTo > input.validFrom),
    );
    if (before.length && input.validFrom <= today())
      fail(409, 'HISTORICAL_CHANGE', 'Ein neuer Arbeitsplan muss in der Zukunft beginnen.');
    if (existing?.validFrom === input.validFrom)
      fail(409, 'OVERLAP', 'Zu diesem Startdatum existiert bereits ein Arbeitsplan.');
    const affected = await tx.vacation.findMany({
      where: {
        userId: req.params.id,
        status: 'BOOKED',
        endDate: { gte: input.validFrom },
        ...(input.validTo ? { startDate: { lt: input.validTo } } : {}),
      },
      include: vacationInclude,
    });
    if (existing)
      await tx.workSchedule.update({
        where: { id: existing.id },
        data: { validTo: input.validFrom, version: { increment: 1 } },
      });
    const overlap = before.some(
      (s) =>
        s.id !== existing?.id &&
        s.validFrom < (input.validTo || '9999-12-31') &&
        (!s.validTo || s.validTo > input.validFrom),
    );
    if (overlap) fail(409, 'SCHEDULE_OVERLAP', 'Der Arbeitsplan überschneidet einen anderen Plan.');
    const after = await tx.workSchedule.create({
      data: {
        userId: req.params.id,
        validFrom: input.validFrom,
        validTo: input.validTo,
        calendarId: input.calendarId,
        days: {
          create: Array.from({ length: 7 }, (_, i) => ({
            weekday: i + 1,
            isWorkday: input.workdays.includes(i + 1),
          })),
        },
      },
    });
    const impacts = await reallocate(tx, actor, affected, input.reason, req.id);
    await audit(
      tx,
      actor,
      'SCHEDULE_CHANGED',
      'user',
      req.params.id,
      { schedules: before },
      { userId: req.params.id, validFrom: after.validFrom, workdays: input.workdays },
      input.reason,
      req.id,
    );
    return {
      impacts,
      fingerprint: {
        before: before.map((s) => [s.id, s.version]),
        input: {
          validFrom: input.validFrom,
          validTo: input.validTo,
          calendarId: input.calendarId,
          workdays: input.workdays,
          reason: input.reason,
        },
        bookings: affected.map((v) => [v.id, v.version]),
        impacts,
      },
    };
  };
  r.post('/users/:id/work-schedules/preview', async (req, res) => {
    const input = scheduleSchema.parse(req.body);
    res.json(
      await configurationChange(
        req,
        `schedule:${req.params.id}`,
        input,
        true,
        scheduleChange(req, input),
      ),
    );
  });
  r.post('/users/:id/work-schedules', async (req, res) => {
    const input = scheduleSchema.parse(req.body);
    res.json(
      await configurationChange(
        req,
        `schedule:${req.params.id}`,
        input,
        false,
        scheduleChange(req, input),
      ),
    );
  });
  r.get('/users/:id/balances', async (req, res) =>
    res.json(
      await balanceView(
        db,
        req.params.id,
        year.parse(req.query.year || today().slice(0, 4)),
        date.parse(req.query.asOf || today()),
      ),
    ),
  );
  r.post('/users/:id/balances', async (req, res) => {
    const input = z
      .object({ year, allowanceUnits: z.number().int().min(0).max(732), reason })
      .strict()
      .parse(req.body);
    res.status(201).json(
      await mutation(req, `balance:create:${req.params.id}`, async (tx, actor) => {
        const b = await createBalance(tx, actor, req.params.id, input.year, input.allowanceUnits);
        await audit(tx, actor, 'BALANCE_CREATED', 'balance', b.id, null, b, input.reason, req.id);
        return b;
      }),
    );
  });
  r.post('/balances/:id/adjustments', async (req, res) => {
    const input = z
      .object({
        units: z
          .number()
          .int()
          .min(-732)
          .max(732)
          .refine((n) => n !== 0),
        validFrom: date,
        expiresOn: date.nullable().default(null),
        reason,
        version,
      })
      .strict()
      .parse(req.body);
    res.json(
      await mutation(req, `balance:adjust:${req.params.id}`, async (tx, actor) => {
        const b = await tx.vacationBalance.findUniqueOrThrow({
          where: { id: req.params.id },
          include: { grants: { include: { allocations: { where: { releasedAt: null } } } } },
        });
        assertVersion(b, input.version);
        if (b.state !== 'OPEN') fail(409, 'YEAR_CLOSED', 'Kontojahr ist geschlossen.');
        if (
          Number(input.validFrom.slice(0, 4)) !== b.year ||
          (input.expiresOn &&
            (input.expiresOn < input.validFrom || Number(input.expiresOn.slice(0, 4)) !== b.year))
        )
          fail(422, 'INVALID_RANGE', 'Guthaben muss innerhalb des Kontojahres gültig sein.');
        if (input.units > 0)
          await grant(
            tx,
            actor,
            b.id,
            'ADJUSTMENT',
            input.units,
            input.validFrom,
            input.expiresOn,
            input.reason,
          );
        else {
          let remaining = -input.units;
          for (const g of b.grants) {
            if (g.validFrom > input.validFrom || (g.expiresOn && g.expiresOn < input.validFrom))
              continue;
            const units = Math.min(
              remaining,
              g.grantedUnits - g.withdrawnUnits - g.allocations.reduce((n, a) => n + a.units, 0),
            );
            if (units > 0) {
              await tx.balanceGrant.update({
                where: { id: g.id },
                data: { withdrawnUnits: { increment: units } },
              });
              await tx.grantChange.create({
                data: {
                  grantId: g.id,
                  deltaWithdrawnUnits: units,
                  actorId: actor.id,
                  reason: input.reason,
                },
              });
              remaining -= units;
            }
          }
          if (remaining)
            fail(
              409,
              'INSUFFICIENT_BALANCE',
              'Die Korrektur würde bereits gebuchtes oder nicht verfügbares Guthaben entziehen.',
            );
        }
        await tx.vacationBalance.update({
          where: { id: b.id },
          data: { version: { increment: 1 } },
        });
        await audit(
          tx,
          actor,
          'BALANCE_ADJUSTED',
          'balance',
          b.id,
          null,
          { userId: b.userId, units: input.units },
          input.reason,
          req.id,
        );
        return balanceView(tx, b.userId, b.year, today());
      }),
    );
  });
  const closingSchema = z
    .object({
      version,
      carryover: z.boolean().default(false),
      expiresOn: date.nullable().default(null),
      reason,
    })
    .strict();
  async function closePreview(tx, id, input) {
    const b = await tx.vacationBalance.findUniqueOrThrow({ where: { id } });
    assertVersion(b, input.version);
    if (b.state !== 'OPEN') fail(409, 'YEAR_CLOSED', 'Dieses Jahr ist bereits geschlossen.');
    if (today() <= `${b.year}-12-31`)
      fail(409, 'YEAR_NOT_ENDED', 'Das Jahr kann erst nach Jahresende abgeschlossen werden.');
    const view = await balanceView(tx, b.userId, b.year, `${b.year}-12-31`);
    const units = view.grants
      .filter((g) => !g.expiresOn || g.expiresOn >= `${b.year + 1}-01-01`)
      .reduce((n, g) => n + g.remainingUnits, 0);
    return { b, units, remainingUnits: view.remainingUnits };
  }
  r.post('/balances/:id/close-preview', async (req, res) => {
    const input = closingSchema.parse(req.body);
    const result = await closePreview(db, req.params.id, input);
    res.json({
      remainingUnits: result.remainingUnits,
      carryoverUnits: result.units,
      version: result.b.version,
    });
  });
  r.post('/balances/:id/close', async (req, res) => {
    const input = closingSchema.parse(req.body);
    res.json(
      await mutation(req, `balance:close:${req.params.id}`, async (tx, actor) => {
        const { b, units } = await closePreview(tx, req.params.id, input);
        if (input.expiresOn && Number(input.expiresOn.slice(0, 4)) !== b.year + 1)
          fail(422, 'INVALID_RANGE', 'Übertrag muss im Folgejahr ablaufen.');
        if (input.carryover && units) {
          const next = await tx.vacationBalance.findUnique({
            where: { userId_year: { userId: b.userId, year: b.year + 1 } },
          });
          if (!next || next.state !== 'OPEN')
            fail(422, 'BALANCE_MISSING', 'Ein offenes Folgejahreskonto ist erforderlich.');
          await grant(
            tx,
            actor,
            next.id,
            'CARRYOVER',
            units,
            `${b.year + 1}-01-01`,
            input.expiresOn,
            input.reason,
            b.id,
          );
          await tx.vacationBalance.update({
            where: { id: next.id },
            data: { version: { increment: 1 } },
          });
        }
        await tx.vacationBalance.update({
          where: { id: b.id },
          data: { state: 'CLOSED', version: { increment: 1 } },
        });
        await audit(
          tx,
          actor,
          'BALANCE_CLOSED',
          'balance',
          b.id,
          b,
          { userId: b.userId, carriedUnits: input.carryover ? units : 0 },
          input.reason,
          req.id,
        );
        return { ok: true, carriedUnits: input.carryover ? units : 0 };
      }),
    );
  });
  r.get('/audit-logs', async (req, res) => {
    const where = {
      ...(req.query.entityId ? { entityId: z.string().parse(req.query.entityId) } : {}),
      ...(req.query.subjectUserId
        ? { subjectUserId: z.string().parse(req.query.subjectUserId) }
        : {}),
    };
    const items = await db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...pageArgs(req.query),
    });
    const people = await db.user.findMany({
      where: {
        id: {
          in: [...new Set(items.flatMap((a) => [a.actorId, a.subjectUserId]).filter(Boolean))],
        },
      },
      select: { id: true, displayName: true },
    });
    const names = new Map(people.map((p) => [p.id, p.displayName]));
    res.json({
      items: items.map((a) => ({
        ...a,
        actorName: names.get(a.actorId) || 'System',
        subjectName: names.get(a.subjectUserId) || null,
      })),
      total: await db.auditLog.count({ where }),
    });
  });
  r.get('/settings', async (req, res) =>
    res.json(await db.setting.findUniqueOrThrow({ where: { id: 'company' } })),
  );
  r.patch('/settings', async (req, res) => {
    const input = z
      .object({
        companyName: z.string().trim().min(2).max(100),
        defaultAllowanceUnits: z.number().int().min(0).max(732),
        maxBookingDays: z.number().int().min(1).max(366),
      })
      .strict()
      .parse(req.body);
    res.json(
      await mutation(req, 'settings:update', async (tx, actor) => {
        const before = await tx.setting.findUniqueOrThrow({ where: { id: 'company' } });
        const after = await tx.setting.update({ where: { id: 'company' }, data: input });
        await audit(
          tx,
          actor,
          'SETTINGS_UPDATED',
          'settings',
          'company',
          before,
          after,
          undefined,
          req.id,
        );
        return after;
      }),
    );
  });
  return r;
}

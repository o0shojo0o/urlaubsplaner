import express from 'express';
import { systemInfo } from './system-info.js';
import { loadSchoolHolidays, schoolRegion } from './school-holidays.js';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { db } from './db.js';
import { authRoutes, loadSession, csrf, requireAuth } from './auth.js';
import {
  assertAdmin,
  assertOwner,
  booking,
  date,
  fail,
  pageArgs,
  publicUser,
  today,
  version,
  year,
} from './domain.js';
import { mutate } from './transactions.js';
import {
  balanceView,
  bookVacation,
  calculate,
  changeVacation,
  vacationInclude,
} from './vacations.js';
import { adminRoutes } from './admin.js';
import { employeeColor } from './employee-colors.js';
export function createApp({ rateLimits = true } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'style-src': ["'self'", "'unsafe-inline'"],
          'script-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'upgrade-insecure-requests': process.env.COOKIE_SECURE === 'true' ? [] : null,
        },
      },
    }),
  );
  app.use((req, res, next) => {
    req.id = randomUUID();
    res.set('X-Request-Id', req.id);
    next();
  });
  app.get('/health/live', (req, res) => res.json({ status: 'ok' }));
  app.get('/health/ready', async (req, res) => {
    try {
      await db.setting.findUniqueOrThrow({ where: { id: 'company' } });
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });
  app.use(express.json({ limit: '64kb' }), cookieParser());
  const api = express.Router();
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  if (rateLimits)
    api.use(
      rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }),
    );
  api.use(loadSession, csrf);
  const loginLimit = rateLimits
    ? [
        rateLimit({
          windowMs: 15 * 60000,
          limit: 60,
          standardHeaders: 'draft-8',
          legacyHeaders: false,
        }),
        rateLimit({
          windowMs: 15 * 60000,
          limit: 15,
          keyGenerator: (req) =>
            `${ipKeyGenerator(req.ip)}:${String(req.body?.email || '')
              .trim()
              .toLowerCase()}`,
          standardHeaders: 'draft-8',
          legacyHeaders: false,
        }),
      ]
    : (req, res, next) => next();
  authRoutes(api, loginLimit);
  api.use(requireAuth);
  api.get('/openapi', (req, res) =>
    res.type('application/yaml').sendFile(resolve('docs/openapi.yaml')),
  );
  api.get('/me', async (req, res) => {
    res.json({
      user: publicUser(req.user),
      settings: await db.setting.findUnique({ where: { id: 'company' } }),
    });
  });
  api.get('/system-info', (req, res) => res.json(systemInfo()));
  api.get('/me/work-schedules', async (req, res) =>
    res.json(
      await db.workSchedule.findMany({
        where: { userId: req.user.id },
        include: { days: true, calendar: true },
        orderBy: { validFrom: 'asc' },
      }),
    ),
  );
  api.get('/me/balances', async (req, res) =>
    res.json(
      await balanceView(
        db,
        req.user.id,
        year.parse(req.query.year || today().slice(0, 4)),
        date.parse(req.query.asOf || today()),
      ),
    ),
  );
  api.get('/me/vacations', async (req, res) => {
    const y = year.parse(req.query.year || today().slice(0, 4));
    const status = z.enum(['BOOKED', 'CANCELLED']).optional().parse(req.query.status);
    const where = {
      userId: req.user.id,
      startDate: { lte: `${y}-12-31` },
      endDate: { gte: `${y}-01-01` },
      ...(status ? { status } : {}),
    };
    res.json({
      items: await db.vacation.findMany({
        where,
        include: vacationInclude,
        orderBy: { startDate: 'desc' },
        ...pageArgs(req.query),
      }),
      total: await db.vacation.count({ where }),
    });
  });
  api.get('/calendar', async (req, res) => {
    const start = date.parse(req.query.start),
      end = date.parse(req.query.endExclusive);
    if (end <= start || (Date.parse(end) - Date.parse(start)) / 86400000 > 366)
      fail(400, 'INVALID_RANGE', 'Kalenderzeitraum muss 1–366 Tage umfassen.');
    if (
      req.user.role !== 'ADMIN' &&
      req.query.departmentId &&
      req.query.departmentId !== req.user.departmentId
    )
      fail(403, 'FORBIDDEN', 'Nur die eigene Abteilung ist sichtbar.');
    const departmentId =
      req.user.role === 'ADMIN'
        ? z.string().optional().parse(req.query.departmentId)
        : req.user.departmentId;
    const where = {
      status: 'BOOKED',
      startDate: { lt: end },
      endDate: { gte: start },
      user: departmentId ? { departmentId } : {},
    };
    const items = await db.vacation.findMany({
      where,
      include: { user: { include: { department: true } }, days: { select: { units: true } } },
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      ...pageArgs(req.query),
    });
    res.json({
      items: items.map((v) => ({
        id: v.id,
        userId: v.userId,
        displayName: v.user.displayName,
        departmentName: v.user.department.name,
        startDate: v.startDate,
        endDate: v.endDate,
        startPart: v.startPart,
        endPart: v.endPart,
        color: employeeColor(v.userId),
        own: v.userId === req.user.id,
        units: v.days.reduce((n, d) => n + d.units, 0),
      })),
      total: await db.vacation.count({ where }),
    });
  });
  api.get('/school-holidays', async (req, res) => {
    res.json(
      await loadSchoolHolidays(
        schoolRegion.parse(req.query.region),
        date.parse(req.query.start),
        date.parse(req.query.endExclusive),
      ),
    );
  });
  api.get('/holidays', async (req, res) => {
    const start = date.parse(req.query.start),
      end = date.parse(req.query.endExclusive);
    if (end <= start || (Date.parse(end) - Date.parse(start)) / 86400000 > 366)
      fail(400, 'INVALID_RANGE', 'Ungültiger Zeitraum.');
    const schedules = await db.workSchedule.findMany({
      where: {
        userId: req.user.id,
        validFrom: { lt: end },
        OR: [{ validTo: null }, { validTo: { gt: start } }],
      },
    });
    const items = await db.holiday.findMany({
      where: {
        date: { gte: start, lt: end },
        holidayYear: { state: 'READY', calendarId: { in: schedules.map((s) => s.calendarId) } },
      },
    });
    res.json(
      items.filter((h) =>
        schedules.some((s) => h.date >= s.validFrom && (!s.validTo || h.date < s.validTo)),
      ),
    );
  });
  api.post('/vacations/preview', async (req, res) => {
    const input = booking.extend({ vacationId: z.string().optional() }).parse(req.body);
    const { vacationId, ...fields } = input;
    if (vacationId) {
      const old = await db.vacation.findUnique({ where: { id: vacationId } });
      if (!old) fail(404, 'NOT_FOUND', 'Urlaub nicht gefunden.');
      assertOwner(req.user, old);
      if (req.user.role === 'ADMIN') fields.userId = old.userId;
    }
    res.json(await calculate(db, req.user, fields, vacationId));
  });
  api.post('/vacations', async (req, res) => {
    const input = booking.parse(req.body);
    res
      .status(201)
      .json(
        await mutate(req, 'vacation:create', (tx, actor) => bookVacation(tx, actor, input, req.id)),
      );
  });
  api.get('/vacations/:id', async (req, res) => {
    const v = await db.vacation.findUnique({
      where: { id: req.params.id },
      include: vacationInclude,
    });
    if (!v) fail(404, 'NOT_FOUND', 'Urlaub nicht gefunden.');
    assertOwner(req.user, v);
    res.json(v);
  });
  api.patch('/vacations/:id', async (req, res) => {
    const { version: v, ...input } = booking.extend({ version }).parse(req.body);
    res.json(
      await mutate(req, `vacation:update:${req.params.id}`, (tx, actor) =>
        changeVacation(tx, actor, req.params.id, input, v, false, req.id),
      ),
    );
  });
  api.post('/vacations/:id/cancel', async (req, res) => {
    const { version: v, ...input } = z
      .object({ version, reason: z.string().trim().min(3).max(500).optional() })
      .strict()
      .parse(req.body);
    res.json(
      await mutate(req, `vacation:cancel:${req.params.id}`, (tx, actor) =>
        changeVacation(tx, actor, req.params.id, input, v, true, req.id),
      ),
    );
  });
  api.use(
    '/admin',
    (req, res, next) => {
      try {
        assertAdmin(req.user);
        next();
      } catch (e) {
        next(e);
      }
    },
    adminRoutes(),
  );
  api.use((req, res) =>
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'API-Route nicht gefunden.', requestId: req.id },
    }),
  );
  app.use('/api/v1', api);
  app.use('/api', (req, res) =>
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API-Route nicht gefunden.' } }),
  );
  const dist = resolve('frontend/dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('/{*path}', (req, res) => res.sendFile(resolve(dist, 'index.html')));
  }
  app.use((err, req, res, _next) => {
    let status = err.status || 500,
      code = err.code || 'INTERNAL_ERROR',
      message = err.message;
    if (err instanceof z.ZodError) {
      status = 400;
      code = 'VALIDATION_ERROR';
      message = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' ');
    } else if (err.code === 'P2002') {
      status = 409;
      code = 'CONFLICT';
      message = 'Eintrag existiert bereits oder überschneidet eine Buchung.';
    } else if (err.code === 'P2025') {
      status = 404;
      code = 'NOT_FOUND';
      message = 'Eintrag nicht gefunden.';
    } else if (err.code === 'P2003') {
      status = 409;
      code = 'REFERENCE_CONFLICT';
      message = 'Der Eintrag wird noch verwendet.';
    }
    if (status >= 500) {
      console.error(JSON.stringify({ requestId: req.id, code: err.code || 'INTERNAL_ERROR' }));
      message =
        status === 503
          ? 'Datenbank ausgelastet. Bitte erneut versuchen.'
          : 'Ein interner Fehler ist aufgetreten.';
    }
    if (status === 503) res.set('Retry-After', '2');
    res.status(status).json({
      error: {
        code,
        message,
        ...(err.details ? { details: err.details } : {}),
        requestId: req.id,
      },
    });
  });
  return app;
}

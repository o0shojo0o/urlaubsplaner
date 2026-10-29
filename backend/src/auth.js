import { createFirstAdmin } from './setup.js';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import { z } from 'zod';
import { db } from './db.js';
import { fail, password, publicUser } from './domain.js';
import { hash, transaction, audit } from './transactions.js';
const secure = process.env.COOKIE_SECURE === 'true';
export const cookieName = secure ? '__Host-session' : 'urlaubsplaner_dev';
const cookieOptions = { httpOnly: true, secure, sameSite: 'lax', path: '/' };
export const randomToken = () => randomBytes(32).toString('hex');
export async function makeSession(res, user) {
  const token = randomToken();
  const now = Date.now();
  const session = await db.session.create({
    data: {
      id: hash(token),
      userId: user?.id,
      authVersion: user?.authVersion || 0,
      csrfSecret: randomToken(),
      expiresAt: new Date(now + 30 * 60000),
      absoluteExpiresAt: new Date(now + 12 * 3600000),
    },
  });
  res.cookie(cookieName, token, { ...cookieOptions, maxAge: 12 * 3600000 });
  return session;
}
export async function loadSession(req, res, next) {
  try {
    const token = req.cookies[cookieName];
    if (token) {
      const s = await db.session.findUnique({
        where: { id: hash(token) },
        include: { user: { include: { department: true } } },
      });
      if (
        s &&
        s.expiresAt > new Date() &&
        s.absoluteExpiresAt > new Date() &&
        (!s.userId || (s.user?.isActive && s.authVersion === s.user.authVersion))
      ) {
        req.session = s;
        req.user = s.user;
        if (Date.now() - s.lastSeenAt.getTime() > 5 * 60000)
          await db.session.update({
            where: { id: s.id },
            data: {
              lastSeenAt: new Date(),
              expiresAt: new Date(Math.min(Date.now() + 30 * 60000, s.absoluteExpiresAt.getTime())),
            },
          });
      }
    }
    next();
  } catch (e) {
    next(e);
  }
}
export function csrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
  if (req.get('Origin') !== origin)
    return next(
      Object.assign(new Error('Ungültiger Anfrageursprung.'), {
        status: 403,
        code: 'ORIGIN_INVALID',
      }),
    );
  const token = req.get('X-CSRF-Token') || '';
  if (
    !req.session ||
    Buffer.byteLength(token) !== Buffer.byteLength(req.session.csrfSecret) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(req.session.csrfSecret))
  )
    return next(
      Object.assign(new Error('Sitzung abgelaufen. Bitte Seite neu laden.'), {
        status: 403,
        code: 'CSRF_INVALID',
      }),
    );
  next();
}
export function requireAuth(req, res, next) {
  if (!req.user)
    return next(
      Object.assign(new Error('Bitte anmelden.'), { status: 401, code: 'UNAUTHENTICATED' }),
    );
  next();
}
export function authRoutes(router, loginLimit) {
  router.get('/auth/setup', async (req, res) => {
    res.json({ setupRequired: (await db.user.count({ where: { role: 'ADMIN' } })) === 0 });
  });
  router.post('/auth/setup', loginLimit, async (req, res) => {
    const user = await createFirstAdmin(req.body);
    await db.session.deleteMany({ where: { id: req.session.id } });
    const session = await makeSession(res, user);
    res.status(201).json({ user: publicUser(user), csrfToken: session.csrfSecret });
  });
  router.get('/auth/csrf', async (req, res) => {
    const s = req.session || (await makeSession(res));
    res.json({ csrfToken: s.csrfSecret });
  });
  router.post('/auth/login', loginLimit, async (req, res) => {
    const input = z
      .object({ email: z.email().max(254), password: z.string().min(1).max(256) })
      .strict()
      .parse(req.body);
    const user = await db.user.findUnique({
      where: { emailKey: input.email.trim().toLowerCase() },
      include: { department: true },
    });
    // A real hash is also evaluated for unknown users to reduce account enumeration.
    const dummy =
      '$argon2id$v=19$m=65536,t=3,p=4$Q0t6N1dRM2p0YVJ4WUZTcw$KO7PwT+rrbZbA9cXxN8Fbk1GDf5ksRl4eEXLcu1/dJI';
    const valid = await argon2
      .verify(user?.passwordHash || dummy, input.password)
      .catch(() => false);
    if (!user?.isActive || !valid)
      fail(401, 'LOGIN_FAILED', 'E-Mail oder Passwort ist nicht korrekt.');
    const current = await db.user.findUnique({ where: { id: user.id } });
    if (!current.isActive || current.passwordHash !== user.passwordHash)
      fail(401, 'LOGIN_FAILED', 'E-Mail oder Passwort ist nicht korrekt.');
    await db.session.deleteMany({ where: { id: req.session.id } });
    const session = await makeSession(res, current);
    res.json({ user: publicUser(user), csrfToken: session.csrfSecret });
  });
  router.post('/auth/logout', async (req, res) => {
    if (req.session) await db.session.deleteMany({ where: { id: req.session.id } });
    res.clearCookie(cookieName, cookieOptions);
    res.json({ ok: true });
  });
  const useToken = async (req, res) => {
    const input = z
      .object({ token: z.string().min(32).max(128), password })
      .strict()
      .parse(req.body);
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    await transaction(async (tx) => {
      const token = await tx.passwordToken.findUnique({
        where: { tokenHash: hash(input.token) },
        include: { user: true },
      });
      if (!token || token.usedAt || token.expiresAt < new Date() || !token.user.isActive)
        fail(422, 'TOKEN_INVALID', 'Der Link ist ungültig oder abgelaufen.');
      await tx.passwordToken.updateMany({
        where: { userId: token.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.user.update({
        where: { id: token.userId },
        data: { passwordHash, authVersion: { increment: 1 } },
      });
      await tx.session.deleteMany({ where: { userId: token.userId } });
      await audit(
        tx,
        token.user,
        'PASSWORD_SET',
        'user',
        token.userId,
        null,
        null,
        undefined,
        req.id,
      );
    });
    res.json({ ok: true });
  };
  router.post('/auth/activate', loginLimit, useToken);
  router.post('/auth/reset-password', loginLimit, useToken);
  router.post('/auth/change-password', requireAuth, loginLimit, async (req, res) => {
    const input = z
      .object({ oldPassword: z.string().max(256), password })
      .strict()
      .parse(req.body);
    if (!(await argon2.verify(req.user.passwordHash, input.oldPassword)))
      fail(401, 'PASSWORD_INVALID', 'Das bisherige Passwort ist nicht korrekt.');
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    await transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: req.user.id } });
      if (user.passwordHash !== req.user.passwordHash)
        fail(409, 'VERSION_CONFLICT', 'Passwort wurde inzwischen geändert.');
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, authVersion: { increment: 1 } },
      });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.passwordToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await audit(tx, user, 'PASSWORD_CHANGED', 'user', user.id, null, null, undefined, req.id);
    });
    res.clearCookie(cookieName, cookieOptions);
    res.json({ ok: true });
  });
}

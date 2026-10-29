import { db, initializeDatabase } from './db.js';
import { createApp } from './app.js';
if (process.env.APP_ORIGIN) process.env.APP_ORIGIN = new URL(process.env.APP_ORIGIN).origin;
if (process.env.NODE_ENV === 'production') {
  if (!process.env.APP_ORIGIN) throw new Error('APP_ORIGIN muss gesetzt sein.');
  const origin = new URL(process.env.APP_ORIGIN);
  if (origin.protocol === 'https:' && process.env.COOKIE_SECURE !== 'true')
    throw new Error('HTTPS benötigt COOKIE_SECURE=true.');
  if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname))
    throw new Error('Produktionsbetrieb benötigt HTTPS.');
}
await initializeDatabase();
const server = createApp().listen(Number(process.env.PORT || 3000), '0.0.0.0', () =>
  console.log(`Urlaubsplaner läuft auf Port ${process.env.PORT || 3000}`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close(async () => {
      await db.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
// Bounded cleanup of expired credentials; no request-body logging.
setInterval(async () => {
  try {
    const now = new Date();
    await db.session.deleteMany({
      where: { OR: [{ expiresAt: { lt: now } }, { absoluteExpiresAt: { lt: now } }] },
    });
    await db.passwordToken.deleteMany({ where: { expiresAt: { lt: now } } });
    await db.idempotencyKey.deleteMany({ where: { expiresAt: { lt: now } } });
  } catch {
    console.error('Credential cleanup failed');
  }
}, 3600000).unref();

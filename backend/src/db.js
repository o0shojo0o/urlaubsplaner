import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
export const databaseUrl = process.env.DATABASE_URL || `file:${resolve('data/urlaubsplaner.db')}`;
export const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl }) });
export async function initializeDatabase() {
  await mkdir(resolve('data'), { recursive: true });
  await db.$queryRawUnsafe('PRAGMA journal_mode=WAL');
  await db.$executeRawUnsafe('PRAGMA foreign_keys=ON');
  await db.$executeRawUnsafe('PRAGMA busy_timeout=5000');
  await db.$executeRawUnsafe('PRAGMA synchronous=FULL');
  const foreignKeys = await db.$queryRawUnsafe('PRAGMA foreign_keys');
  if (Number(foreignKeys[0].foreign_keys) !== 1)
    throw new Error('SQLite Foreign Keys sind nicht aktiviert.');
  await db.setting.upsert({ where: { id: 'company' }, create: {}, update: {} });
}

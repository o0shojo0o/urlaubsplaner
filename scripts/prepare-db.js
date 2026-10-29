import 'dotenv/config';
import Database from 'better-sqlite3';
import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const path = resolve(
  (process.env.DATABASE_URL || 'file:data/urlaubsplaner.db').replace(/^file:/, ''),
);
try {
  await mkdir(dirname(path), { recursive: true });
  const database = new Database(path);
  database.close();
} catch (error) {
  console.error(
    `Datenbank kann nicht geöffnet werden: ${path}. ` +
      `Der Datenordner und eine vorhandene Datenbank müssen für UID ${process.getuid?.() ?? 'unbekannt'} ` +
      `beschreibbar sein. Volume-Mount, Dateirechte und das verwendete Release-Image prüfen.`,
  );
  throw error;
}

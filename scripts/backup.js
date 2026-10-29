import 'dotenv/config';
import Database from 'better-sqlite3';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const source = resolve(
  (process.env.DATABASE_URL || 'file:data/urlaubsplaner.db').replace(/^file:/, ''),
);
const folder = resolve(process.env.BACKUP_DIR || 'backups');
await mkdir(folder, { recursive: true });
const destination = resolve(
  folder,
  `urlaubsplaner-${new Date().toISOString().replace(/[:.]/g, '-')}.db`,
);
const database = new Database(source, { readonly: true });
try {
  await database.backup(destination);
  const copy = new Database(destination, { readonly: true });
  try {
    const integrity = copy.pragma('integrity_check');
    const foreignKeys = copy.pragma('foreign_key_check');
    if (integrity[0].integrity_check !== 'ok' || foreignKeys.length)
      throw new Error('Backup-Prüfung fehlgeschlagen.');
  } finally {
    copy.close();
  }
  console.log(`Backup geprüft: ${destination}`);
} finally {
  database.close();
}

import Database from 'better-sqlite3';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
if (!process.argv[2]) throw new Error('Aufruf: npm run restore:check -- /pfad/zur/sicherung.db');
const folder = await mkdtemp(join(tmpdir(), 'freiraum-restore-'));
try {
  const filename = join(folder, 'restored.db');
  await copyFile(resolve(process.argv[2]), filename);
  const database = new Database(filename, { readonly: true });
  try {
    const result = database.pragma('integrity_check');
    if (result[0].integrity_check !== 'ok' || database.pragma('foreign_key_check').length)
      throw new Error('Integritätsprüfung fehlgeschlagen.');
    const counts = {};
    for (const table of [
      'users',
      'vacations',
      'vacation_balances',
      'vacation_slots',
      'day_allocations',
    ])
      counts[table] = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
    const overdraft = database
      .prepare(
        'SELECT g.id FROM balance_grants g LEFT JOIN day_allocations a ON a.grantId=g.id AND a.releasedAt IS NULL GROUP BY g.id HAVING COALESCE(SUM(a.units),0)>g.grantedUnits-g.withdrawnUnits',
      )
      .all();
    if (overdraft.length) throw new Error('Inkonsistente Urlaubskonten in der Sicherung.');
    console.log(JSON.stringify({ restored: true, integrity: 'ok', foreignKeys: 'ok', counts }));
  } finally {
    database.close();
  }
} finally {
  await rm(folder, { recursive: true, force: true });
}

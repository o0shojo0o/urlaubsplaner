import 'dotenv/config';
import Database from 'better-sqlite3';
import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const path = resolve(
  (process.env.DATABASE_URL || 'file:data/urlaubsplaner.db').replace(/^file:/, ''),
);
await mkdir(dirname(path), { recursive: true });
const database = new Database(path);
database.close();

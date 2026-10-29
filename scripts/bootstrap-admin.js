import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { db, initializeDatabase } from '../backend/src/db.js';
import { password } from '../backend/src/domain.js';
import { z } from 'zod';
import { createFirstAdmin } from '../backend/src/setup.js';
let hide = false;
const output = new Writable({
  write(chunk, encoding, cb) {
    if (!hide) process.stdout.write(chunk, encoding);
    cb();
  },
});
const rl = createInterface({
  input: process.stdin,
  output,
  terminal: Boolean(process.stdin.isTTY),
});
try {
  await initializeDatabase();
  if (await db.user.count({ where: { role: 'ADMIN' } }))
    throw new Error('Ein Administrator existiert bereits.');
  const displayName = z
    .string()
    .min(2)
    .parse(await rl.question('Name: '));
  const email = z.email().parse((await rl.question('E-Mail: ')).trim().toLowerCase());
  process.stdout.write('Passwort (mindestens 12 Zeichen, Eingabe verborgen): ');
  hide = true;
  const secret = password.parse(await rl.question(''));
  hide = false;
  process.stdout.write('\n');
  await createFirstAdmin({ displayName, email, password: secret });
  console.log('Admin erstellt. Vor der ersten Buchung Feiertage im Adminbereich bestätigen.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  rl.close();
  await db.$disconnect();
}

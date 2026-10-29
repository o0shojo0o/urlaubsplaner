import { createHash, randomUUID } from 'node:crypto';
import { db } from './db.js';
import { fail } from './domain.js';
export const hash = (s) => createHash('sha256').update(s).digest('hex');
export async function transaction(fn, client = db) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.$transaction(
        async (tx) => {
          await tx.setting.update({
            where: { id: 'company' },
            data: { version: { increment: 1 } },
          });
          return fn(tx);
        },
        { maxWait: 8000, timeout: 20000 },
      );
    } catch (e) {
      const busy =
        ['P1008', 'P2028', 'P2034'].includes(e.code) ||
        /database is locked|SQLITE_BUSY/.test(e.message);
      if (!busy) throw e;
      if (attempt >= 3)
        fail(503, 'DATABASE_BUSY', 'Die Datenbank ist kurz ausgelastet. Bitte erneut versuchen.');
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1) + Math.random() * 80));
    }
  }
}
export async function audit(
  tx,
  actor,
  action,
  entityType,
  entityId,
  before,
  after,
  reason,
  requestId = randomUUID(),
) {
  await tx.auditLog.create({
    data: {
      actorId: actor?.id,
      action,
      entityType,
      entityId,
      subjectUserId: after?.userId || before?.userId,
      beforeJson: before ? JSON.stringify(before) : null,
      afterJson: after ? JSON.stringify(after) : null,
      reason,
      requestId,
    },
  });
}
export async function mutate(req, operation, fn) {
  const key = req.get('Idempotency-Key');
  if (!key || key.length < 8 || key.length > 128)
    fail(400, 'IDEMPOTENCY_REQUIRED', 'Ein gültiger Idempotency-Key ist erforderlich.');
  const requestHash = hash(JSON.stringify({ operation, body: req.body }));
  return transaction(async (tx) => {
    const actor = await tx.user.findUnique({
      where: { id: req.user.id },
      include: { department: true },
    });
    if (!actor?.isActive || actor.authVersion !== req.session.authVersion)
      fail(401, 'SESSION_EXPIRED', 'Bitte erneut anmelden.');
    const cached = await tx.idempotencyKey.findUnique({
      where: { actorId_key: { actorId: actor.id, key } },
    });
    if (cached) {
      if (cached.requestHash !== requestHash || cached.operation !== operation)
        fail(
          409,
          'IDEMPOTENCY_CONFLICT',
          'Dieser Wiederholungsschlüssel gehört zu einer anderen Anfrage.',
        );
      return JSON.parse(cached.resultJson);
    }
    const result = await fn(tx, actor);
    await tx.idempotencyKey.create({
      data: {
        actorId: actor.id,
        key,
        operation,
        requestHash,
        resultJson: JSON.stringify(result),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    return result;
  });
}

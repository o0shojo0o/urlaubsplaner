import {
  assertOwner,
  assertVersion,
  datesBetween,
  fail,
  requestedSlots,
  targetUser,
  today,
} from './domain.js';
import { audit } from './transactions.js';
export const vacationInclude = {
  days: { include: { allocations: true } },
  user: { select: { displayName: true, departmentId: true } },
};
export async function calculate(tx, actor, input, excludeId) {
  const userId = targetUser(actor, input.userId);
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user?.isActive) fail(422, 'USER_INACTIVE', 'Mitarbeiter nicht aktiv.');
  const settings = await tx.setting.findUnique({ where: { id: 'company' } });
  if (actor.role !== 'ADMIN' && input.startDate < today(settings.timezone))
    fail(
      403,
      'PAST_BOOKING',
      'Vergangener Urlaub kann nur durch einen Administrator korrigiert werden.',
    );
  if (
    actor.role === 'ADMIN' &&
    (userId !== actor.id || input.startDate < today(settings.timezone)) &&
    !input.reason
  )
    fail(422, 'REASON_REQUIRED', 'Für diese Adminbuchung ist eine Begründung erforderlich.');
  const dates = datesBetween(input.startDate, input.endDate, settings.maxBookingDays);
  const schedules = await tx.workSchedule.findMany({
    where: { userId },
    include: { days: true, calendar: { include: { years: { include: { holidays: true } } } } },
  });
  const balances = await tx.vacationBalance.findMany({
    where: { userId },
    include: {
      grants: {
        include: { allocations: { where: { releasedAt: null }, include: { vacationDay: true } } },
      },
    },
  });
  const occupied = await tx.vacationSlot.findMany({
    where: {
      userId,
      date: { gte: input.startDate, lte: input.endDate },
      ...(excludeId ? { vacationDay: { vacationId: { not: excludeId } } } : {}),
    },
  });
  const free = new Map();
  for (const b of balances)
    for (const g of b.grants)
      free.set(
        g.id,
        g.grantedUnits -
          g.withdrawnUnits -
          g.allocations
            .filter((a) => a.vacationDay.vacationId !== excludeId)
            .reduce((n, a) => n + a.units, 0),
      );
  const days = [];
  for (const day of dates) {
    const wanted = requestedSlots(input, day);
    if (day < user.employmentStart || (user.employmentEnd && day > user.employmentEnd))
      fail(422, 'OUTSIDE_EMPLOYMENT', 'Der Zeitraum liegt außerhalb der Beschäftigung.');
    const active = schedules.filter((s) => s.validFrom <= day && (!s.validTo || day < s.validTo));
    if (active.length !== 1 || active[0].days.length !== 7)
      fail(422, 'SCHEDULE_MISSING', `Kein eindeutiger Arbeitsplan für ${day}.`);
    const schedule = active[0];
    const y = Number(day.slice(0, 4));
    const hy = schedule.calendar.years.find((h) => h.year === y && h.state === 'READY');
    if (!hy) fail(422, 'HOLIDAYS_MISSING', `Feiertage für ${y} sind noch nicht bestätigt.`);
    if (
      !schedule.days.find((d) => d.weekday === (new Date(`${day}T12:00:00Z`).getUTCDay() || 7))
        ?.isWorkday
    )
      continue;
    const holiday = hy.holidays.find((h) => h.date === day);
    const slots = wanted.filter(
      (s) => !holiday || (holiday.blockedSlots !== 'FULL' && holiday.blockedSlots !== s),
    );
    if (!slots.length) continue;
    if (slots.some((s) => occupied.some((o) => o.date === day && o.slot === s)))
      fail(409, 'OVERLAP', `Für ${day} ist bereits Urlaub gebucht.`);
    const balance = balances.find((b) => b.year === y);
    if (!balance || balance.state !== 'OPEN')
      fail(422, 'BALANCE_MISSING', `Ein offenes Urlaubskonto für ${y} fehlt.`);
    const grants = balance.grants
      .filter((g) => g.validFrom <= day && (!g.expiresOn || g.expiresOn >= day))
      .sort(
        (a, b) =>
          (a.expiresOn || '9999-12-31').localeCompare(b.expiresOn || '9999-12-31') ||
          a.validFrom.localeCompare(b.validFrom) ||
          a.id.localeCompare(b.id),
      );
    let required = slots.length;
    const allocations = [];
    for (const g of grants) {
      const units = Math.min(required, free.get(g.id));
      if (units > 0) {
        allocations.push({ grantId: g.id, units });
        free.set(g.id, free.get(g.id) - units);
        required -= units;
      }
      if (!required) break;
    }
    if (required)
      fail(
        409,
        'INSUFFICIENT_BALANCE',
        `Für ${y} ist nicht genügend gültiges Urlaubsguthaben vorhanden.`,
        { year: y, missingUnits: required },
      );
    days.push({
      date: day,
      scheduleId: schedule.id,
      holidayYearVersion: hy.version,
      units: slots.length,
      slots,
      allocations,
    });
  }
  if (!days.length)
    fail(422, 'NO_CHARGEABLE_DAYS', 'Der Zeitraum enthält keine buchbaren Arbeitstage.');
  const years = {};
  for (const d of days) years[d.date.slice(0, 4)] = (years[d.date.slice(0, 4)] || 0) + d.units;
  return { userId, totalUnits: days.reduce((n, d) => n + d.units, 0), years, days };
}
async function persistDays(tx, vacationId, userId, days) {
  await tx.vacationBalance.updateMany({
    where: { userId, year: { in: [...new Set(days.map((d) => Number(d.date.slice(0, 4))))] } },
    data: { version: { increment: 1 } },
  });
  for (const d of days) {
    await tx.vacationDay.create({
      data: {
        vacationId,
        date: d.date,
        scheduleId: d.scheduleId,
        holidayYearVersion: d.holidayYearVersion,
        units: d.units,
        slots: { create: d.slots.map((slot) => ({ userId, date: d.date, slot })) },
        allocations: { create: d.allocations },
      },
    });
  }
}
export async function bookVacation(tx, actor, input, requestId) {
  const result = await calculate(tx, actor, input);
  const { userId: _user, reason, ...fields } = input;
  const vacation = await tx.vacation.create({
    data: { ...fields, userId: result.userId, createdBy: actor.id, updatedBy: actor.id },
  });
  await persistDays(tx, vacation.id, result.userId, result.days);
  const after = await tx.vacation.findUnique({
    where: { id: vacation.id },
    include: vacationInclude,
  });
  await audit(
    tx,
    actor,
    'VACATION_BOOKED',
    'vacation',
    vacation.id,
    null,
    after,
    reason,
    requestId,
  );
  return after;
}
export async function changeVacation(tx, actor, id, input, expectedVersion, cancel, requestId) {
  const before = await tx.vacation.findUnique({ where: { id }, include: vacationInclude });
  if (!before) fail(404, 'NOT_FOUND', 'Urlaub nicht gefunden.');
  assertOwner(actor, before);
  assertVersion(before, expectedVersion);
  if (before.status !== 'BOOKED')
    fail(409, 'ALREADY_CANCELLED', 'Dieser Urlaub wurde bereits storniert.');
  const settings = await tx.setting.findUnique({ where: { id: 'company' } });
  if (actor.role !== 'ADMIN' && before.startDate <= today(settings.timezone))
    fail(403, 'PAST_BOOKING', 'Nur vollständig zukünftiger Urlaub kann selbst geändert werden.');
  if (
    actor.role === 'ADMIN' &&
    (before.userId !== actor.id || before.startDate <= today(settings.timezone)) &&
    !input.reason
  )
    fail(422, 'REASON_REQUIRED', 'Bitte die Adminänderung begründen.');
  const years = [...new Set(before.days.map((d) => Number(d.date.slice(0, 4))))];
  if (
    await tx.vacationBalance.count({
      where: { userId: before.userId, year: { in: years }, state: 'CLOSED' },
    })
  )
    fail(409, 'YEAR_CLOSED', 'Ein betroffenes Kontojahr ist geschlossen.');
  await tx.vacationBalance.updateMany({
    where: { userId: before.userId, year: { in: years } },
    data: { version: { increment: 1 } },
  });
  await tx.vacationSlot.deleteMany({ where: { vacationDay: { vacationId: id } } });
  if (cancel) {
    await tx.dayAllocation.updateMany({
      where: { vacationDay: { vacationId: id }, releasedAt: null },
      data: { releasedAt: new Date() },
    });
    await tx.vacation.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledBy: actor.id,
        cancelledAt: new Date(),
        cancelReason: input.reason || 'Selbst storniert',
        updatedBy: actor.id,
        version: { increment: 1 },
      },
    });
  } else {
    const result = await calculate(
      tx,
      actor,
      { ...input, ...(actor.role === 'ADMIN' ? { userId: before.userId } : {}) },
      id,
    );
    await tx.dayAllocation.deleteMany({ where: { vacationDay: { vacationId: id } } });
    await tx.vacationDay.deleteMany({ where: { vacationId: id } });
    const { userId: _user, reason: _reason, ...fields } = input;
    await tx.vacation.update({
      where: { id },
      data: { ...fields, updatedBy: actor.id, version: { increment: 1 } },
    });
    await persistDays(tx, id, before.userId, result.days);
  }
  const after = await tx.vacation.findUnique({ where: { id }, include: vacationInclude });
  await audit(
    tx,
    actor,
    cancel ? 'VACATION_CANCELLED' : 'VACATION_UPDATED',
    'vacation',
    id,
    before,
    after,
    input.reason,
    requestId,
  );
  return after;
}
export async function balanceView(tx, userId, year, asOf) {
  const b = await tx.vacationBalance.findUnique({
    where: { userId_year: { userId, year } },
    include: {
      grants: {
        include: { allocations: { where: { releasedAt: null }, include: { vacationDay: true } } },
      },
    },
  });
  if (!b)
    return {
      year,
      missing: true,
      grants: [],
      annualUnits: 0,
      carryoverUnits: 0,
      adjustmentUnits: 0,
      bookedUnits: 0,
      takenUnits: 0,
      upcomingUnits: 0,
      remainingUnits: 0,
      expiredUnits: 0,
    };
  const grants = b.grants.map((g) => ({
    id: g.id,
    kind: g.kind,
    grantedUnits: g.grantedUnits,
    withdrawnUnits: g.withdrawnUnits,
    validFrom: g.validFrom,
    expiresOn: g.expiresOn,
    usedUnits: g.allocations.reduce((n, a) => n + a.units, 0),
    remainingUnits:
      g.grantedUnits - g.withdrawnUnits - g.allocations.reduce((n, a) => n + a.units, 0),
    takenUnits: g.allocations
      .filter((a) => a.vacationDay.date < asOf)
      .reduce((n, a) => n + a.units, 0),
  }));
  const sum = (fn) => grants.reduce((n, g) => n + fn(g), 0);
  return {
    id: b.id,
    year,
    state: b.state,
    version: b.version,
    grants,
    annualUnits: sum((g) => (g.kind === 'ANNUAL' ? g.grantedUnits : 0)),
    carryoverUnits: sum((g) => (g.kind === 'CARRYOVER' ? g.grantedUnits : 0)),
    adjustmentUnits: sum((g) => (g.kind === 'ADJUSTMENT' ? g.grantedUnits : 0) - g.withdrawnUnits),
    bookedUnits: sum((g) => g.usedUnits),
    takenUnits: sum((g) => g.takenUnits),
    upcomingUnits: sum((g) => g.usedUnits - g.takenUnits),
    remainingUnits: sum((g) => g.remainingUnits),
    availableUnits: sum((g) =>
      g.validFrom <= asOf && (!g.expiresOn || g.expiresOn >= asOf) ? g.remainingUnits : 0,
    ),
    expiredUnits: sum((g) => (g.expiresOn && g.expiresOn < asOf ? g.remainingUnits : 0)),
  };
}

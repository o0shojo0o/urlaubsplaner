-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#0d9488',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CHECK (archived IN (0,1))
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "emailKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "departmentId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "employmentStart" TEXT NOT NULL,
    "employmentEnd" TEXT,
    "authVersion" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK (role IN ('EMPLOYEE','ADMIN')),
    CHECK (isActive IN (0,1)),
    CHECK (employmentEnd IS NULL OR employmentEnd >= employmentStart),
    CHECK (version > 0 AND authVersion > 0)
);

-- CreateTable
CREATE TABLE "holiday_calendars" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "archived" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "holiday_years" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "calendarId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "confirmedAt" DATETIME,
    "confirmedBy" TEXT,
    CONSTRAINT "holiday_years_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "holiday_calendars" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK (state IN ('DRAFT','READY')),
    CHECK (year BETWEEN 1900 AND 9999),
    CHECK (state != 'READY' OR (confirmedAt IS NOT NULL AND confirmedBy IS NOT NULL))
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "holidayYearId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "blockedSlots" TEXT NOT NULL DEFAULT 'FULL',
    CONSTRAINT "holidays_holidayYearId_fkey" FOREIGN KEY ("holidayYearId") REFERENCES "holiday_years" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK (blockedSlots IN ('FULL','AM','PM'))
);

-- CreateTable
CREATE TABLE "work_schedules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "validFrom" TEXT NOT NULL,
    "validTo" TEXT,
    "calendarId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "work_schedules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "work_schedules_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "holiday_calendars" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK (validTo IS NULL OR validTo > validFrom)
);

-- CreateTable
CREATE TABLE "schedule_days" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "isWorkday" BOOLEAN NOT NULL,
    CONSTRAINT "schedule_days_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "work_schedules" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK (weekday BETWEEN 1 AND 7),
    CHECK (isWorkday IN (0,1))
);

-- CreateTable
CREATE TABLE "vacation_balances" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "vacation_balances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK (state IN ('OPEN','CLOSED')),
    CHECK (year BETWEEN 1900 AND 9999)
);

-- CreateTable
CREATE TABLE "balance_grants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "balanceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "grantedUnits" INTEGER NOT NULL,
    "withdrawnUnits" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TEXT NOT NULL,
    "expiresOn" TEXT,
    "sourceBalanceId" TEXT,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "balance_grants_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "vacation_balances" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "balance_grants_sourceBalanceId_fkey" FOREIGN KEY ("sourceBalanceId") REFERENCES "vacation_balances" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK (kind IN ('ANNUAL','CARRYOVER','ADJUSTMENT')),
    CHECK (typeof(grantedUnits) = 'integer' AND grantedUnits > 0),
    CHECK (typeof(withdrawnUnits) = 'integer' AND withdrawnUnits BETWEEN 0 AND grantedUnits),
    CHECK (expiresOn IS NULL OR expiresOn >= validFrom),
    CHECK ((kind = 'CARRYOVER' AND sourceBalanceId IS NOT NULL) OR (kind != 'CARRYOVER' AND sourceBalanceId IS NULL))
);

-- CreateTable
CREATE TABLE "balance_grant_changes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "grantId" TEXT NOT NULL,
    "deltaGrantedUnits" INTEGER NOT NULL DEFAULT 0,
    "deltaWithdrawnUnits" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "balance_grant_changes_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "balance_grants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK (deltaGrantedUnits != 0 OR deltaWithdrawnUnits != 0)
);

-- CreateTable
CREATE TABLE "vacations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "startPart" TEXT NOT NULL DEFAULT 'FULL',
    "endPart" TEXT NOT NULL DEFAULT 'FULL',
    "status" TEXT NOT NULL DEFAULT 'BOOKED',
    "privateNote" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "cancelledBy" TEXT,
    "cancelledAt" DATETIME,
    "cancelReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "vacations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK (endDate >= startDate),
    CHECK (status IN ('BOOKED','CANCELLED')),
    CHECK (startPart IN ('FULL','AM','PM') AND endPart IN ('FULL','AM','PM')),
    CHECK ((status = 'BOOKED' AND cancelledAt IS NULL AND cancelledBy IS NULL) OR (status = 'CANCELLED' AND cancelledAt IS NOT NULL AND cancelledBy IS NOT NULL))
);

-- CreateTable
CREATE TABLE "vacation_days" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vacationId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "holidayYearVersion" INTEGER NOT NULL,
    "calculationVersion" INTEGER NOT NULL DEFAULT 1,
    "units" INTEGER NOT NULL,
    CONSTRAINT "vacation_days_vacationId_fkey" FOREIGN KEY ("vacationId") REFERENCES "vacations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "vacation_days_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "work_schedules" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK (units IN (1,2))
);

-- CreateTable
CREATE TABLE "day_allocations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vacationDayId" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "releasedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "day_allocations_vacationDayId_fkey" FOREIGN KEY ("vacationDayId") REFERENCES "vacation_days" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "day_allocations_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "balance_grants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK (units IN (1,2))
);

-- CreateTable
CREATE TABLE "vacation_slots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vacationDayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    CONSTRAINT "vacation_slots_vacationDayId_fkey" FOREIGN KEY ("vacationDayId") REFERENCES "vacation_days" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "vacation_slots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK (slot IN ('AM','PM'))
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "authVersion" INTEGER NOT NULL DEFAULT 0,
    "csrfSecret" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "absoluteExpiresAt" DATETIME NOT NULL,
    CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "password_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CHECK (purpose IN ('ACTIVATE','RESET'))
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "idempotency_keys_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "subjectUserId" TEXT,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "reason" TEXT,
    "requestId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (beforeJson IS NULL OR json_valid(beforeJson)),
    CHECK (afterJson IS NULL OR json_valid(afterJson))
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'company',
    "companyName" TEXT NOT NULL DEFAULT 'Urlaubsplaner',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "defaultAllowanceUnits" INTEGER NOT NULL DEFAULT 60,
    "maxBookingDays" INTEGER NOT NULL DEFAULT 366,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL,
    CHECK (id = 'company'),
    CHECK (defaultAllowanceUnits BETWEEN 0 AND 732),
    CHECK (maxBookingDays BETWEEN 1 AND 366)
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_nameKey_key" ON "departments"("nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "users_emailKey_key" ON "users"("emailKey");

-- CreateIndex
CREATE INDEX "users_departmentId_isActive_idx" ON "users"("departmentId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "holiday_calendars_code_key" ON "holiday_calendars"("code");

-- CreateIndex
CREATE UNIQUE INDEX "holiday_years_calendarId_year_key" ON "holiday_years"("calendarId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_holidayYearId_date_key" ON "holidays"("holidayYearId", "date");

-- CreateIndex
CREATE INDEX "work_schedules_userId_validFrom_validTo_idx" ON "work_schedules"("userId", "validFrom", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "work_schedules_userId_validFrom_key" ON "work_schedules"("userId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_days_scheduleId_weekday_key" ON "schedule_days"("scheduleId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "vacation_balances_userId_year_key" ON "vacation_balances"("userId", "year");

-- CreateIndex
CREATE INDEX "balance_grants_balanceId_expiresOn_validFrom_idx" ON "balance_grants"("balanceId", "expiresOn", "validFrom");

-- CreateIndex
CREATE INDEX "balance_grant_changes_grantId_createdAt_idx" ON "balance_grant_changes"("grantId", "createdAt");

-- CreateIndex
CREATE INDEX "vacations_userId_status_startDate_endDate_idx" ON "vacations"("userId", "status", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "vacations_status_startDate_endDate_idx" ON "vacations"("status", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "vacation_days_date_idx" ON "vacation_days"("date");

-- CreateIndex
CREATE UNIQUE INDEX "vacation_days_vacationId_date_key" ON "vacation_days"("vacationId", "date");

-- CreateIndex
CREATE INDEX "day_allocations_grantId_releasedAt_idx" ON "day_allocations"("grantId", "releasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "day_allocations_vacationDayId_grantId_key" ON "day_allocations"("vacationDayId", "grantId");

-- CreateIndex
CREATE UNIQUE INDEX "vacation_slots_userId_date_slot_key" ON "vacation_slots"("userId", "date", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "vacation_slots_vacationDayId_slot_key" ON "vacation_slots"("vacationDayId", "slot");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "password_tokens_tokenHash_key" ON "password_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_tokens_userId_purpose_idx" ON "password_tokens"("userId", "purpose");

-- CreateIndex
CREATE INDEX "password_tokens_expiresAt_idx" ON "password_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "idempotency_keys_expiresAt_idx" ON "idempotency_keys"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_actorId_key_key" ON "idempotency_keys"("actorId", "key");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_createdAt_idx" ON "audit_logs"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_subjectUserId_createdAt_idx" ON "audit_logs"("subjectUserId", "createdAt");


CREATE UNIQUE INDEX one_annual_grant ON balance_grants(balanceId) WHERE kind='ANNUAL';
CREATE UNIQUE INDEX one_carryover_per_source ON balance_grants(balanceId,sourceBalanceId) WHERE kind='CARRYOVER';

CREATE TRIGGER schedule_overlap_insert BEFORE INSERT ON work_schedules
WHEN EXISTS (SELECT 1 FROM work_schedules s WHERE s.userId=NEW.userId AND s.id!=NEW.id AND s.validFrom<COALESCE(NEW.validTo,'9999-12-31') AND COALESCE(s.validTo,'9999-12-31')>NEW.validFrom)
BEGIN SELECT RAISE(ABORT,'schedule overlap'); END;
CREATE TRIGGER slot_consistency_insert BEFORE INSERT ON vacation_slots
WHEN NOT EXISTS (SELECT 1 FROM vacation_days d JOIN vacations v ON v.id=d.vacationId WHERE d.id=NEW.vacationDayId AND d.date=NEW.date AND v.userId=NEW.userId AND v.status='BOOKED')
BEGIN SELECT RAISE(ABORT,'slot mismatch'); END;
CREATE TRIGGER allocation_consistency_insert BEFORE INSERT ON day_allocations
WHEN NEW.releasedAt IS NULL AND (
  NOT EXISTS (SELECT 1 FROM vacation_days d JOIN vacations v ON v.id=d.vacationId JOIN balance_grants g ON g.id=NEW.grantId JOIN vacation_balances b ON b.id=g.balanceId WHERE d.id=NEW.vacationDayId AND b.userId=v.userId AND b.year=CAST(substr(d.date,1,4) AS INTEGER) AND b.state='OPEN' AND g.validFrom<=d.date AND (g.expiresOn IS NULL OR g.expiresOn>=d.date))
  OR NEW.units + COALESCE((SELECT SUM(a.units) FROM day_allocations a WHERE a.grantId=NEW.grantId AND a.releasedAt IS NULL AND a.id!=NEW.id),0) > (SELECT grantedUnits-withdrawnUnits FROM balance_grants WHERE id=NEW.grantId)
  OR NEW.units + COALESCE((SELECT SUM(a.units) FROM day_allocations a WHERE a.vacationDayId=NEW.vacationDayId AND a.releasedAt IS NULL AND a.id!=NEW.id),0) > (SELECT units FROM vacation_days WHERE id=NEW.vacationDayId)
)
BEGIN SELECT RAISE(ABORT,'allocation mismatch or overdraft'); END;

CREATE TRIGGER schedule_overlap_update BEFORE UPDATE ON work_schedules
WHEN EXISTS (SELECT 1 FROM work_schedules s WHERE s.userId=NEW.userId AND s.id!=NEW.id AND s.validFrom<COALESCE(NEW.validTo,'9999-12-31') AND COALESCE(s.validTo,'9999-12-31')>NEW.validFrom)
BEGIN SELECT RAISE(ABORT,'schedule overlap'); END;
CREATE TRIGGER slot_consistency_update BEFORE UPDATE ON vacation_slots
WHEN NOT EXISTS (SELECT 1 FROM vacation_days d JOIN vacations v ON v.id=d.vacationId WHERE d.id=NEW.vacationDayId AND d.date=NEW.date AND v.userId=NEW.userId AND v.status='BOOKED')
BEGIN SELECT RAISE(ABORT,'slot mismatch'); END;
CREATE TRIGGER allocation_consistency_update BEFORE UPDATE ON day_allocations
WHEN NEW.releasedAt IS NULL AND (
  NOT EXISTS (SELECT 1 FROM vacation_days d JOIN vacations v ON v.id=d.vacationId JOIN balance_grants g ON g.id=NEW.grantId JOIN vacation_balances b ON b.id=g.balanceId WHERE d.id=NEW.vacationDayId AND b.userId=v.userId AND b.year=CAST(substr(d.date,1,4) AS INTEGER) AND b.state='OPEN' AND g.validFrom<=d.date AND (g.expiresOn IS NULL OR g.expiresOn>=d.date))
  OR NEW.units + COALESCE((SELECT SUM(a.units) FROM day_allocations a WHERE a.grantId=NEW.grantId AND a.releasedAt IS NULL AND a.id!=NEW.id),0) > (SELECT grantedUnits-withdrawnUnits FROM balance_grants WHERE id=NEW.grantId)
  OR NEW.units + COALESCE((SELECT SUM(a.units) FROM day_allocations a WHERE a.vacationDayId=NEW.vacationDayId AND a.releasedAt IS NULL AND a.id!=NEW.id),0) > (SELECT units FROM vacation_days WHERE id=NEW.vacationDayId)
)
BEGIN SELECT RAISE(ABORT,'allocation mismatch or overdraft'); END;

CREATE TRIGGER prevent_grant_overdraft BEFORE UPDATE ON balance_grants
WHEN NEW.grantedUnits-NEW.withdrawnUnits < COALESCE((SELECT SUM(units) FROM day_allocations WHERE grantId=NEW.id AND releasedAt IS NULL),0)
BEGIN SELECT RAISE(ABORT,'grant overdraft'); END;

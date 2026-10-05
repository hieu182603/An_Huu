CREATE TABLE "actual_months" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "period" TEXT NOT NULL CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
-- statement-break
CREATE UNIQUE INDEX "actual_months_userId_period_key" ON "actual_months"("userId", "period");
-- statement-break
CREATE TABLE "actual_month_revisions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "monthId" TEXT NOT NULL REFERENCES "actual_months"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- statement-break
CREATE UNIQUE INDEX "actual_month_revisions_monthId_revision_key" ON "actual_month_revisions"("monthId", "revision");
-- statement-break
CREATE TABLE "actual_event_identities" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "monthId" TEXT NOT NULL REFERENCES "actual_months"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- statement-break
CREATE UNIQUE INDEX "actual_event_identities_userId_eventId_key" ON "actual_event_identities"("userId", "eventId");
-- statement-break
CREATE FUNCTION reject_actual_revision_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Actual revisions are immutable' USING ERRCODE = '23514'; END;
$$;
-- statement-break
CREATE TRIGGER actual_revision_immutable BEFORE UPDATE ON "actual_month_revisions" FOR EACH ROW EXECUTE FUNCTION reject_actual_revision_update();

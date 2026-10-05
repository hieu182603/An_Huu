-- Preserve every v1 document and existing plan snapshot. A v1 document is archived
-- by the service only when its owner explicitly submits a complete v2 replacement.
-- V2 summaries are computed exactly from JSON; the legacy cache must not invent 0
-- for unknown values or round fractional ownership into Decimal(18,2).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE "financial_profiles"
  ADD COLUMN "legacyProfileData" JSONB,
  ALTER COLUMN "netWorth" DROP NOT NULL,
  ALTER COLUMN "netWorth" DROP DEFAULT;
COMMIT;

-- Additive only. Existing plans/snapshots are preserved; no implicit application.
ALTER TABLE "retirement_plans" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "baselineVersionId" TEXT;
-- statement-break
CREATE UNIQUE INDEX "retirement_plans_baselineVersionId_key" ON "retirement_plans"("baselineVersionId");
-- statement-break
ALTER TABLE "retirement_plans" ADD CONSTRAINT "retirement_plans_baselineVersionId_fkey"
  FOREIGN KEY ("baselineVersionId") REFERENCES "plan_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- statement-break
-- Version contents are insert-only. Deletion remains possible for account erasure.
CREATE FUNCTION reject_plan_version_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'PLAN_VERSION_IMMUTABLE' USING ERRCODE = '23514';
END;
$$;
-- statement-break
CREATE TRIGGER plan_version_immutable BEFORE UPDATE ON "plan_versions"
FOR EACH ROW EXECUTE FUNCTION reject_plan_version_update();

-- These columns already exist on the configured application database, but were
-- absent from migration history. Add them for clean installs and older databases.
-- Never edit historical migrations or overwrite existing financial metadata.
ALTER TABLE "assumption_set_versions"
  ADD COLUMN IF NOT EXISTS "modelCode" TEXT,
  ADD COLUMN IF NOT EXISTS "publishedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 1;
-- statement-break
ALTER TABLE "retirement_goals"
  ADD COLUMN IF NOT EXISTS "lifeExpectancy" INTEGER,
  ADD COLUMN IF NOT EXISTS "riskLevel" "RiskLevel";

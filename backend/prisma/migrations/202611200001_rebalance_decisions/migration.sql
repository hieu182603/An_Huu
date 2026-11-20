-- Lịch sử quyết định tái cân bằng danh mục (B7-1, spec §8).
-- Additive and idempotent: creates rebalance_decisions table, user index, FK to users, and CHECK constraints.

CREATE TABLE IF NOT EXISTS "rebalance_decisions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "oldWeights" JSONB NOT NULL,
    "targetWeights" JSONB NOT NULL,
    "newWeights" JSONB NOT NULL,
    "trigger" TEXT NOT NULL,
    "bandPoints" TEXT NOT NULL,
    "costEstimate" TEXT NOT NULL,
    "trades" JSONB NOT NULL,
    "probabilityBefore" DOUBLE PRECISION,
    "probabilityAfter" DOUBLE PRECISION,
    "decision" TEXT NOT NULL DEFAULT 'PROPOSED',
    "note" TEXT,

    CONSTRAINT "rebalance_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "rebalance_decisions_userId_createdAt_idx" ON "rebalance_decisions"("userId", "createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rebalance_decisions_userId_fkey') THEN
    ALTER TABLE "rebalance_decisions"
      ADD CONSTRAINT "rebalance_decisions_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rebalance_decisions_source_check') THEN
    ALTER TABLE "rebalance_decisions"
      ADD CONSTRAINT "rebalance_decisions_source_check"
      CHECK ("source" IN ('PROPOSAL', 'MONITOR'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rebalance_decisions_decision_check') THEN
    ALTER TABLE "rebalance_decisions"
      ADD CONSTRAINT "rebalance_decisions_decision_check"
      CHECK ("decision" IN ('PROPOSED', 'ACCEPTED', 'DISMISSED'));
  END IF;
END $$;

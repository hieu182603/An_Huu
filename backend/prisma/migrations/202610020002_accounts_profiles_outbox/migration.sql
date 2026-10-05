-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "lastActiveAt" TIMESTAMP(3),
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "securityVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "familyId" TEXT,
ADD COLUMN     "persistent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "securityVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "usedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "verification_tokens" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "consumedAt" TIMESTAMP(3);

-- Legacy tokens were stored in plaintext. Invalidate them and remove the secret;
-- existing sessions must log in again. IDs provide a distinct legacy family.
UPDATE "refresh_tokens" SET "familyId" = "id", "token" = 'revoked:' || "id", "revokedAt" = CURRENT_TIMESTAMP;
ALTER TABLE "refresh_tokens" ALTER COLUMN "familyId" SET NOT NULL;
UPDATE "verification_tokens" SET "token" = 'consumed:' || "id", "consumedAt" = CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "financial_profiles" ADD COLUMN     "asOfDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "schemaVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "onboarding_drafts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retirement_goals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetRetirementAge" INTEGER NOT NULL,
    "lifestyle" TEXT NOT NULL,
    "monthlyExpense" DECIMAL(18,2) NOT NULL,
    "monthlyContribution" DECIMAL(18,2) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retirement_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_model_versions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "description" TEXT NOT NULL,
    "source" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_model_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assumption_set_versions" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "values" JSONB NOT NULL,
    "policy" JSONB NOT NULL,
    "source" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assumption_set_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retirement_plans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retirement_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_versions" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "profileRevision" INTEGER NOT NULL,
    "goalRevision" INTEGER NOT NULL,
    "modelVersionId" TEXT NOT NULL,
    "assumptionVersionId" TEXT NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "chartSeries" JSONB NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseId" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "eventId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_drafts_userId_key" ON "onboarding_drafts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "retirement_goals_userId_key" ON "retirement_goals"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_model_versions_code_key" ON "financial_model_versions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "assumption_set_versions_version_key" ON "assumption_set_versions"("version");

-- CreateIndex
CREATE UNIQUE INDEX "retirement_plans_currentVersionId_key" ON "retirement_plans"("currentVersionId");

-- CreateIndex
CREATE INDEX "retirement_plans_userId_createdAt_idx" ON "retirement_plans"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "plan_versions_planId_version_key" ON "plan_versions"("planId", "version");

-- CreateIndex
CREATE INDEX "outbox_events_status_availableAt_idx" ON "outbox_events"("status", "availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_userId_scope_key_key" ON "idempotency_records"("userId", "scope", "key");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_revokedAt_idx" ON "refresh_tokens"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- CreateIndex
CREATE INDEX "verification_tokens_userId_type_createdAt_idx" ON "verification_tokens"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_targetType_targetId_createdAt_idx" ON "audit_logs"("targetType", "targetId", "createdAt");

-- AddForeignKey
ALTER TABLE "onboarding_drafts" ADD CONSTRAINT "onboarding_drafts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retirement_goals" ADD CONSTRAINT "retirement_goals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retirement_plans" ADD CONSTRAINT "retirement_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retirement_plans" ADD CONSTRAINT "retirement_plans_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "plan_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "retirement_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES "financial_model_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_assumptionVersionId_fkey" FOREIGN KEY ("assumptionVersionId") REFERENCES "assumption_set_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

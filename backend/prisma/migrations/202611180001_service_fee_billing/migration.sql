-- Service fee billing (phi dich vu hoach dinh theo quy mo tai san, thanh toan payOS).
-- Additive and idempotent: new enums, one sequence, nine tables, guarded CHECK/FK constraints and the default fee schedule v1.
-- Money tables are accounting records: foreign keys to "users" are ON DELETE RESTRICT (no cascade), amounts are CHECK-constrained,
-- and the webhook log has no FK so unknown order codes can still be recorded.
-- Plan: docs/KE_HOACH_TRIEN_KHAI_PHI_DICH_VU.md section 1.

-- Enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FeeScheduleStatus') THEN
    CREATE TYPE "FeeScheduleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingAccountStatus') THEN
    CREATE TYPE "BillingAccountStatus" AS ENUM ('TRIAL', 'ACTIVE', 'OVERDUE', 'STOPPED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FeeStatementStatus') THEN
    CREATE TYPE "FeeStatementStatus" AS ENUM ('ISSUED', 'PAID', 'OVERDUE', 'WAIVED', 'VOID');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentOrderStatus') THEN
    CREATE TYPE "PaymentOrderStatus" AS ENUM ('PENDING', 'PAID', 'UNDERPAID', 'EXPIRED', 'CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentSource') THEN
    CREATE TYPE "PaymentSource" AS ENUM ('PAYOS', 'MANUAL_TRANSFER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FeeOverrideKind') THEN
    CREATE TYPE "FeeOverrideKind" AS ENUM ('DISCOUNT_PERCENT', 'FIXED_AMOUNT', 'WAIVE');
  END IF;
END $$;

-- Order codes sent to payOS (must be a positive integer, unique per payment link)
CREATE SEQUENCE IF NOT EXISTS payment_order_code_seq START 100000;

-- Tables
CREATE TABLE IF NOT EXISTS "fee_schedules" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "FeeScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "annualRatePercent" DECIMAL(6,4) NOT NULL,
    "minMonthlyVnd" INTEGER NOT NULL,
    "maxMonthlyVnd" INTEGER,
    "roundingStepVnd" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "reminderDays" INTEGER[],
    "trialMonths" INTEGER NOT NULL,
    "effectiveFromPeriod" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "billing_accounts" (
    "userId" TEXT NOT NULL,
    "status" "BillingAccountStatus" NOT NULL,
    "trialEndsAt" TIMESTAMP(3),
    "termsVersion" TEXT NOT NULL,
    "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
    "stoppedFromPeriod" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_accounts_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE IF NOT EXISTS "user_fee_overrides" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "FeeOverrideKind" NOT NULL,
    "value" DECIMAL(12,4),
    "fromPeriod" TEXT NOT NULL,
    "toPeriod" TEXT,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_fee_overrides_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "fee_statements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "baseAmountVnd" DECIMAL(20,0) NOT NULL,
    "baseSource" JSONB NOT NULL,
    "feeScheduleId" TEXT NOT NULL,
    "overrideId" TEXT,
    "rawFeeVnd" DECIMAL(20,2) NOT NULL,
    "scheduleFeeVnd" INTEGER NOT NULL,
    "amountVnd" INTEGER NOT NULL,
    "status" "FeeStatementStatus" NOT NULL DEFAULT 'ISSUED',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_statements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "statement_adjustments" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "amountVnd" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "statement_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "payment_orders" (
    "id" TEXT NOT NULL,
    "orderCode" BIGINT NOT NULL DEFAULT nextval('payment_order_code_seq'::regclass),
    "statementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountVnd" INTEGER NOT NULL,
    "status" "PaymentOrderStatus" NOT NULL DEFAULT 'PENDING',
    "payosPaymentLinkId" TEXT,
    "checkoutUrl" TEXT,
    "qrCode" TEXT,
    "expiredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "payments" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "PaymentSource" NOT NULL,
    "amountVnd" INTEGER NOT NULL,
    "orderId" TEXT,
    "bankReference" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "recordedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "refunds" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amountVnd" INTEGER NOT NULL,
    "bankReference" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "payment_webhook_events" (
    "id" TEXT NOT NULL,
    "orderCode" BIGINT NOT NULL,
    "reference" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "outcome" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- Unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS "fee_schedules_version_key" ON "fee_schedules"("version");
CREATE UNIQUE INDEX IF NOT EXISTS "fee_statements_userId_period_key" ON "fee_statements"("userId", "period");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_orders_orderCode_key" ON "payment_orders"("orderCode");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_orders_payosPaymentLinkId_key" ON "payment_orders"("payosPaymentLinkId");
CREATE UNIQUE INDEX IF NOT EXISTS "payments_orderId_key" ON "payments"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "payments_source_bankReference_key" ON "payments"("source", "bankReference");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_webhook_events_orderCode_reference_key" ON "payment_webhook_events"("orderCode", "reference");

-- Secondary indexes
CREATE INDEX IF NOT EXISTS "fee_schedules_status_effectiveFromPeriod_idx" ON "fee_schedules"("status", "effectiveFromPeriod");
CREATE INDEX IF NOT EXISTS "billing_accounts_status_idx" ON "billing_accounts"("status");
CREATE INDEX IF NOT EXISTS "user_fee_overrides_userId_fromPeriod_idx" ON "user_fee_overrides"("userId", "fromPeriod");
CREATE INDEX IF NOT EXISTS "fee_statements_period_status_idx" ON "fee_statements"("period", "status");
CREATE INDEX IF NOT EXISTS "fee_statements_feeScheduleId_idx" ON "fee_statements"("feeScheduleId");
CREATE INDEX IF NOT EXISTS "fee_statements_overrideId_idx" ON "fee_statements"("overrideId");
CREATE INDEX IF NOT EXISTS "statement_adjustments_statementId_idx" ON "statement_adjustments"("statementId");
CREATE INDEX IF NOT EXISTS "payment_orders_statementId_status_idx" ON "payment_orders"("statementId", "status");
CREATE INDEX IF NOT EXISTS "payment_orders_status_expiredAt_idx" ON "payment_orders"("status", "expiredAt");
CREATE INDEX IF NOT EXISTS "payment_orders_userId_idx" ON "payment_orders"("userId");
CREATE INDEX IF NOT EXISTS "payments_statementId_idx" ON "payments"("statementId");
CREATE INDEX IF NOT EXISTS "payments_userId_idx" ON "payments"("userId");
CREATE INDEX IF NOT EXISTS "refunds_paymentId_idx" ON "refunds"("paymentId");

-- Foreign keys (all RESTRICT: accounting records must survive and block deletion of their parents)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_accounts_userId_fkey') THEN
    ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_fee_overrides_userId_fkey') THEN
    ALTER TABLE "user_fee_overrides" ADD CONSTRAINT "user_fee_overrides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_statements_userId_fkey') THEN
    ALTER TABLE "fee_statements" ADD CONSTRAINT "fee_statements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_statements_feeScheduleId_fkey') THEN
    ALTER TABLE "fee_statements" ADD CONSTRAINT "fee_statements_feeScheduleId_fkey" FOREIGN KEY ("feeScheduleId") REFERENCES "fee_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_statements_overrideId_fkey') THEN
    ALTER TABLE "fee_statements" ADD CONSTRAINT "fee_statements_overrideId_fkey" FOREIGN KEY ("overrideId") REFERENCES "user_fee_overrides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'statement_adjustments_statementId_fkey') THEN
    ALTER TABLE "statement_adjustments" ADD CONSTRAINT "statement_adjustments_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "fee_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_orders_statementId_fkey') THEN
    ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "fee_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_orders_userId_fkey') THEN
    ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_statementId_fkey') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "fee_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_userId_fkey') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_orderId_fkey') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_paymentId_fkey') THEN
    ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- CHECK constraints (the database is the last line of defence for money and period formats)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_schedules_rate_range') THEN
    ALTER TABLE "fee_schedules" ADD CONSTRAINT "fee_schedules_rate_range" CHECK ("annualRatePercent" >= 0 AND "annualRatePercent" <= 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_schedules_min_nonnegative') THEN
    ALTER TABLE "fee_schedules" ADD CONSTRAINT "fee_schedules_min_nonnegative" CHECK ("minMonthlyVnd" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_schedules_max_gte_min') THEN
    ALTER TABLE "fee_schedules" ADD CONSTRAINT "fee_schedules_max_gte_min" CHECK ("maxMonthlyVnd" IS NULL OR "maxMonthlyVnd" >= "minMonthlyVnd");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_schedules_rounding_positive') THEN
    ALTER TABLE "fee_schedules" ADD CONSTRAINT "fee_schedules_rounding_positive" CHECK ("roundingStepVnd" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_schedules_dueDay_range') THEN
    ALTER TABLE "fee_schedules" ADD CONSTRAINT "fee_schedules_dueDay_range" CHECK ("dueDay" >= 1 AND "dueDay" <= 28);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_schedules_trialMonths_nonnegative') THEN
    ALTER TABLE "fee_schedules" ADD CONSTRAINT "fee_schedules_trialMonths_nonnegative" CHECK ("trialMonths" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_schedules_effectiveFromPeriod_format') THEN
    ALTER TABLE "fee_schedules" ADD CONSTRAINT "fee_schedules_effectiveFromPeriod_format" CHECK ("effectiveFromPeriod" IS NULL OR "effectiveFromPeriod" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_schedules_published_complete') THEN
    ALTER TABLE "fee_schedules" ADD CONSTRAINT "fee_schedules_published_complete" CHECK ("status" <> 'PUBLISHED' OR ("effectiveFromPeriod" IS NOT NULL AND "publishedAt" IS NOT NULL));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_accounts_stoppedFromPeriod_format') THEN
    ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_stoppedFromPeriod_format" CHECK ("stoppedFromPeriod" IS NULL OR "stoppedFromPeriod" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_fee_overrides_fromPeriod_format') THEN
    ALTER TABLE "user_fee_overrides" ADD CONSTRAINT "user_fee_overrides_fromPeriod_format" CHECK ("fromPeriod" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_fee_overrides_toPeriod_format') THEN
    ALTER TABLE "user_fee_overrides" ADD CONSTRAINT "user_fee_overrides_toPeriod_format" CHECK ("toPeriod" IS NULL OR "toPeriod" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_fee_overrides_period_order') THEN
    ALTER TABLE "user_fee_overrides" ADD CONSTRAINT "user_fee_overrides_period_order" CHECK ("toPeriod" IS NULL OR "toPeriod" >= "fromPeriod");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_fee_overrides_value_required') THEN
    ALTER TABLE "user_fee_overrides" ADD CONSTRAINT "user_fee_overrides_value_required" CHECK ("kind" = 'WAIVE' OR ("value" IS NOT NULL AND "value" >= 0));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_fee_overrides_percent_range') THEN
    ALTER TABLE "user_fee_overrides" ADD CONSTRAINT "user_fee_overrides_percent_range" CHECK ("kind" <> 'DISCOUNT_PERCENT' OR ("value" >= 0 AND "value" <= 100));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_statements_period_format') THEN
    ALTER TABLE "fee_statements" ADD CONSTRAINT "fee_statements_period_format" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_statements_amounts_nonnegative') THEN
    ALTER TABLE "fee_statements" ADD CONSTRAINT "fee_statements_amounts_nonnegative" CHECK ("baseAmountVnd" >= 0 AND "rawFeeVnd" >= 0 AND "scheduleFeeVnd" >= 0 AND "amountVnd" >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'statement_adjustments_amount_positive') THEN
    ALTER TABLE "statement_adjustments" ADD CONSTRAINT "statement_adjustments_amount_positive" CHECK ("amountVnd" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_orders_amount_positive') THEN
    ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_amount_positive" CHECK ("amountVnd" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_amount_positive') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amountVnd" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_amount_positive') THEN
    ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_positive" CHECK ("amountVnd" > 0);
  END IF;
END $$;

-- Default fee schedule v1 (proposal pending customer confirmation; changeable by publishing a new version)
INSERT INTO "fee_schedules" (
  "id", "version", "status", "annualRatePercent", "minMonthlyVnd", "maxMonthlyVnd", "roundingStepVnd",
  "dueDay", "reminderDays", "trialMonths", "effectiveFromPeriod", "note",
  "createdById", "publishedById", "publishedAt", "createdAt", "updatedAt"
) VALUES (
  '6f1c2a40-5b7e-4d3a-9a10-0a4e2f7c0001', 1, 'PUBLISHED', 0.5000, 49000, 2000000, 1000,
  10, ARRAY[5, 8], 1, '2026-12', 'Biểu phí mặc định — chờ khách hàng xác nhận',
  'system', 'system', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT DO NOTHING;

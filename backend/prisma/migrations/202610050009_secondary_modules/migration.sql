-- Additive only. Legacy catalog is preserved as unpublished pending disclosure review.
ALTER TABLE "partners" ADD COLUMN "isVisible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
-- statement-break
ALTER TABLE "partner_products" ADD COLUMN "annualFee" TEXT,
  ADD COLUMN "conditions" TEXT, ADD COLUMN "disclosure" TEXT,
  ADD COLUMN "isVisible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- statement-break
CREATE TABLE "notification_preferences" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "emailDigest" BOOLEAN NOT NULL DEFAULT false,
  "goalAlerts" BOOLEAN NOT NULL DEFAULT false,
  "partnerUpdates" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

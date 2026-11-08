-- Product consultations: link a ticket to the product it was opened for (nullable, additive).
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "productId" TEXT;
CREATE INDEX IF NOT EXISTS "support_tickets_userId_productId_status_idx" ON "support_tickets"("userId", "productId", "status");

-- Saved products per account.
CREATE TABLE IF NOT EXISTS "saved_products" (
  "userId" TEXT NOT NULL, "productId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "saved_products_pkey" PRIMARY KEY ("userId", "productId"),
  CONSTRAINT "saved_products_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "saved_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "partner_products"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "saved_products_userId_createdAt_idx" ON "saved_products"("userId", "createdAt");

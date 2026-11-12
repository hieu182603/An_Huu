-- Optional numeric product terms so users can sort by reference yield and minimum amount.
-- Additive and nullable: existing rows keep NULL ("not declared") and the text expectedReturn stays the display source.
ALTER TABLE "partner_products" ADD COLUMN IF NOT EXISTS "referenceYieldPercent" DECIMAL(9,4);
ALTER TABLE "partner_products" ADD COLUMN IF NOT EXISTS "minimumAmount" DECIMAL(20,2);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_products_referenceYieldPercent_range') THEN
    ALTER TABLE "partner_products" ADD CONSTRAINT "partner_products_referenceYieldPercent_range" CHECK ("referenceYieldPercent" IS NULL OR ("referenceYieldPercent" >= -100 AND "referenceYieldPercent" <= 100));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_products_minimumAmount_nonnegative') THEN
    ALTER TABLE "partner_products" ADD CONSTRAINT "partner_products_minimumAmount_nonnegative" CHECK ("minimumAmount" IS NULL OR "minimumAmount" >= 0);
  END IF;
END $$;

-- Nhớ việc khách đã hoàn tất 3 bước phân bổ tài sản cho đến khi hồ sơ thay đổi.
ALTER TABLE "financial_profiles" ADD COLUMN "allocationConfirmedRevision" INTEGER;

ALTER TABLE "knowledge_sources" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "validUntil" TIMESTAMP(3), ADD COLUMN "indexedHash" TEXT;
-- statement-break
ALTER TABLE "ai_conversations" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "expiresAt" TIMESTAMP(3);
-- statement-break
UPDATE "ai_conversations" SET "expiresAt" = "createdAt" + INTERVAL '30 days';
-- statement-break
ALTER TABLE "ai_messages" ADD COLUMN "requestKey" TEXT, ADD COLUMN "context" JSONB;
-- statement-break
CREATE UNIQUE INDEX "ai_messages_conversationId_requestKey_role_key" ON "ai_messages"("conversationId","requestKey","role");
-- statement-break
CREATE TABLE "ai_privacy" (
  "userId" TEXT NOT NULL PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "processing" BOOLEAN NOT NULL DEFAULT false,
  "saveHistory" BOOLEAN NOT NULL DEFAULT false,
  "policyVersion" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

ALTER TABLE "articles" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'ARTICLE', ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "publishedAt" TIMESTAMP(3);
ALTER TABLE "articles" ADD COLUMN "searchText" TEXT NOT NULL DEFAULT '';
UPDATE "articles" SET "searchText" = translate(regexp_replace(normalize(lower("title" || ' ' || "excerpt" || ' ' || "content" || ' ' || "category"), NFD), U&'[\0300-\036f]', '', 'g'), 'đ', 'd');
CREATE TABLE "saved_articles" (
  "userId" TEXT NOT NULL, "articleId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "saved_articles_pkey" PRIMARY KEY ("userId", "articleId"),
  CONSTRAINT "saved_articles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "saved_articles_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "support_tickets" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "subject" TEXT NOT NULL, "category" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN', "revision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "support_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "support_tickets_userId_updatedAt_idx" ON "support_tickets"("userId", "updatedAt");
CREATE INDEX "support_tickets_status_updatedAt_idx" ON "support_tickets"("status", "updatedAt");
CREATE TABLE "support_messages" (
  "id" TEXT NOT NULL, "ticketId" TEXT NOT NULL, "authorId" TEXT NOT NULL, "body" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "support_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "support_messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "support_messages_ticketId_createdAt_idx" ON "support_messages"("ticketId", "createdAt");
CREATE TABLE "notifications" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "title" TEXT NOT NULL, "message" TEXT NOT NULL, "path" TEXT NOT NULL, "readAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt");

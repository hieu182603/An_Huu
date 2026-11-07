-- CreateEnum
CREATE TYPE "InvestmentRole" AS ENUM ('OPERATIONS', 'DATA_ADMIN', 'MODEL_ADMIN', 'ADVISOR', 'APPROVER', 'SYSTEM_ADMIN');

-- CreateTable
CREATE TABLE "investment_role_grants" (
    "userId" TEXT NOT NULL,
    "role" "InvestmentRole" NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investment_role_grants_pkey" PRIMARY KEY ("userId","role")
);

-- CreateTable
CREATE TABLE "investment_product_data" (
    "productId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "document" JSONB NOT NULL,
    "documentHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_product_data_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "investment_holdings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(24,8) NOT NULL,
    "unitCost" DECIMAL(24,8) NOT NULL,
    "lockedUntil" DATE,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investment_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_recommendations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "planVersionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "document" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "references" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_recommendation_items" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "document" JSONB NOT NULL,

    CONSTRAINT "investment_recommendation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_approvals" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investment_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "investment_holdings_userId_updatedAt_idx" ON "investment_holdings"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "investment_holdings_userId_productId_key" ON "investment_holdings"("userId", "productId");

-- CreateIndex
CREATE INDEX "investment_recommendations_userId_status_createdAt_idx" ON "investment_recommendations"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "investment_recommendations_status_expiresAt_idx" ON "investment_recommendations"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "investment_recommendation_items_recommendationId_productId_key" ON "investment_recommendation_items"("recommendationId", "productId");

-- CreateIndex
CREATE INDEX "investment_approvals_recommendationId_createdAt_idx" ON "investment_approvals"("recommendationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "investment_approvals_recommendationId_revision_decision_key" ON "investment_approvals"("recommendationId", "revision", "decision");

-- AddForeignKey
ALTER TABLE "investment_role_grants" ADD CONSTRAINT "investment_role_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_product_data" ADD CONSTRAINT "investment_product_data_productId_fkey" FOREIGN KEY ("productId") REFERENCES "partner_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_holdings" ADD CONSTRAINT "investment_holdings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_holdings" ADD CONSTRAINT "investment_holdings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "partner_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_recommendations" ADD CONSTRAINT "investment_recommendations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_recommendations" ADD CONSTRAINT "investment_recommendations_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_recommendations" ADD CONSTRAINT "investment_recommendations_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_recommendation_items" ADD CONSTRAINT "investment_recommendation_items_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "investment_recommendations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_recommendation_items" ADD CONSTRAINT "investment_recommendation_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "partner_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_approvals" ADD CONSTRAINT "investment_approvals_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "investment_recommendations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_approvals" ADD CONSTRAINT "investment_approvals_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

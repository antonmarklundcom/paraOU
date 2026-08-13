-- NOTE: `prisma migrate dev` also generated DROP INDEX statements for
-- Tender_currency_idx/department_idx/embedding_idx/procurementMethod_idx/
-- searchVector_idx/title_trgm_idx and an ALTER COLUMN on searchVector. Those are
-- false positives from diffing against schema.prisma: those indexes (and the
-- generated searchVector column) are hand-written raw SQL from earlier migrations
-- that Prisma cannot fully model (see the comment at the top of schema.prisma and
-- .github/workflows/ci.yml). Removed here — this migration only adds
-- PlannedPurchase (Phase F3).

-- CreateTable
CREATE TABLE "PlannedPurchase" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "ocid" TEXT,
    "year" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT,
    "buyerId" TEXT,
    "buyerName" TEXT,
    "categoryCode" TEXT,
    "categoryName" TEXT,
    "procurementMethod" TEXT,
    "estimatedAmount" DECIMAL(20,4),
    "currency" TEXT NOT NULL DEFAULT 'PYG',
    "department" TEXT,
    "estimatedQuarter" TEXT,
    "estimatedDate" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannedPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlannedPurchase_externalId_key" ON "PlannedPurchase"("externalId");

-- CreateIndex
CREATE INDEX "PlannedPurchase_status_estimatedDate_idx" ON "PlannedPurchase"("status", "estimatedDate");

-- CreateIndex
CREATE INDEX "PlannedPurchase_categoryCode_idx" ON "PlannedPurchase"("categoryCode");

-- CreateIndex
CREATE INDEX "PlannedPurchase_buyerId_idx" ON "PlannedPurchase"("buyerId");

-- CreateIndex
CREATE INDEX "PlannedPurchase_publishedAt_idx" ON "PlannedPurchase"("publishedAt");

-- AddForeignKey
ALTER TABLE "PlannedPurchase" ADD CONSTRAINT "PlannedPurchase_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

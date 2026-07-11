-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- Spanish full-text search config with accent-insensitivity (CLAUDE.md rule 5).
-- to_tsvector(regconfig, text) is IMMUTABLE, so this config is safe to use inside a
-- generated column (a bare unaccent() call would not be).
DROP TEXT SEARCH CONFIGURATION IF EXISTS spanish_unaccent;
CREATE TEXT SEARCH CONFIGURATION spanish_unaccent (COPY = spanish);
ALTER TEXT SEARCH CONFIGURATION spanish_unaccent
    ALTER MAPPING FOR hword, hword_part, word WITH unaccent, spanish_stem;

-- CreateEnum
CREATE TYPE "TenderStatus" AS ENUM ('PLANNED', 'OPEN', 'CLOSED', 'AWARDED', 'CONTRACTED', 'CANCELLED', 'UNSUCCESSFUL');

-- CreateTable
CREATE TABLE "Tender" (
    "id" TEXT NOT NULL,
    "ocid" TEXT NOT NULL,
    "dncpId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TenderStatus" NOT NULL,
    "buyerId" TEXT,
    "buyerName" TEXT,
    "categoryCode" TEXT,
    "categoryName" TEXT,
    "procurementMethod" TEXT,
    "amountMin" DECIMAL(20,4),
    "amountMax" DECIMAL(20,4),
    "currency" TEXT NOT NULL DEFAULT 'PYG',
    "department" TEXT,
    "publishedAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "inquiryDeadlineAt" TIMESTAMP(3),
    "documentsUrl" TEXT,
    "sourceUrl" TEXT,
    "raw" JSONB NOT NULL,
    "aiSummary" TEXT,
    "searchVector" tsvector GENERATED ALWAYS AS (
        to_tsvector(
            'spanish_unaccent',
            coalesce("title", '') || ' ' ||
            coalesce("description", '') || ' ' ||
            coalesce("buyerName", '') || ' ' ||
            coalesce("categoryName", '')
        )
    ) STORED,
    "embedding" vector(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Buyer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ruc" TEXT,
    "level" TEXT,

    CONSTRAINT "Buyer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ruc" TEXT,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Award" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "supplierId" TEXT,
    "amount" DECIMAL(20,4),
    "currency" TEXT,
    "date" TIMESTAMP(3),
    "status" TEXT,

    CONSTRAINT "Award_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderEvent" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncState" (
    "job" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "watermark" TIMESTAMP(3),
    "cursor" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("job")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tender_ocid_key" ON "Tender"("ocid");

-- CreateIndex
CREATE INDEX "Tender_status_deadlineAt_idx" ON "Tender"("status", "deadlineAt");

-- CreateIndex
CREATE INDEX "Tender_publishedAt_idx" ON "Tender"("publishedAt");

-- CreateIndex
CREATE INDEX "Tender_categoryCode_idx" ON "Tender"("categoryCode");

-- CreateIndex
CREATE INDEX "Tender_buyerId_idx" ON "Tender"("buyerId");

-- CreateIndex
CREATE INDEX "Award_tenderId_idx" ON "Award"("tenderId");

-- CreateIndex
CREATE INDEX "Award_supplierId_idx" ON "Award"("supplierId");

-- CreateIndex
CREATE INDEX "TenderEvent_tenderId_createdAt_idx" ON "TenderEvent"("tenderId", "createdAt");

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderEvent" ADD CONSTRAINT "TenderEvent_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FTS index over the generated tsvector column.
CREATE INDEX "Tender_searchVector_idx" ON "Tender" USING GIN ("searchVector");

-- pgvector HNSW cosine index for Phase 4 semantic matching (empty at ingest time).
CREATE INDEX "Tender_embedding_idx" ON "Tender" USING hnsw ("embedding" vector_cosine_ops);

-- Trigram index to speed up ILIKE fallback searches on titles.
CREATE INDEX "Tender_title_trgm_idx" ON "Tender" USING GIN ("title" gin_trgm_ops);

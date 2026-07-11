-- Phase 2 (API layer). Purely additive.
--
-- NOTE: Prisma's auto-generated diff wanted to DROP the pgvector/FTS indexes and the
-- generated `searchVector` default because it cannot model that hand-written SQL
-- (see prisma/migrations/*_init). Those drops were removed by hand; this migration
-- only ADDS the ExchangeRate table and the expression indexes that back the API's
-- keyset sorts and common filters.

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "date" DATE NOT NULL,
    "pygPerUsd" DECIMAL(14,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("date")
);

-- Expression indexes matching GET /api/tenders keyset sort keys (nulls sink to the
-- end of each ordering). These keep p95 low on large tables (PHASE-2 perf target).
CREATE INDEX "Tender_sort_newest_idx"
    ON "Tender" ((COALESCE("publishedAt", '-infinity'::timestamp)) DESC, "ocid" DESC);

CREATE INDEX "Tender_sort_deadline_idx"
    ON "Tender" ((COALESCE("deadlineAt", 'infinity'::timestamp)) ASC, "ocid" ASC);

CREATE INDEX "Tender_sort_amount_idx"
    ON "Tender" ((COALESCE("amountMax", '-Infinity'::numeric)) DESC, "ocid" DESC);

-- Common filter columns not already indexed by the init migration.
CREATE INDEX "Tender_department_idx" ON "Tender" ("department");
CREATE INDEX "Tender_procurementMethod_idx" ON "Tender" ("procurementMethod");
CREATE INDEX "Tender_currency_idx" ON "Tender" ("currency");

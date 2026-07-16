-- Phase 4 (AI matching). Purely additive.
--
-- NOTE: Prisma's auto-generated diff again wanted to DROP the pgvector/FTS indexes
-- and the generated `searchVector` default (same false-drift as prisma/migrations/
-- *_init and *_phase2_api — Prisma cannot model that hand-written SQL). Those drops
-- were removed by hand.

-- CreateEnum
CREATE TYPE "MatchAction" AS ENUM ('NONE', 'SAVED', 'BIDDING', 'DISMISSED');

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL,
    "anonId" TEXT,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryCodes" TEXT[],
    "keywords" TEXT[],
    "excludeKeywords" TEXT[],
    "departments" TEXT[],
    "amountMin" DECIMAL(20,4),
    "amountMax" DECIMAL(20,4),
    "certifications" TEXT[],
    "embedding" vector(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "verdict" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "cautions" TEXT[],
    "userAction" "MatchAction" NOT NULL DEFAULT 'NONE',
    "profileVersion" TIMESTAMP(3) NOT NULL,
    "tenderVersion" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "estCostUsd" DECIMAL(10,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_anonId_key" ON "CompanyProfile"("anonId");

-- CreateIndex
CREATE INDEX "CompanyProfile_userId_idx" ON "CompanyProfile"("userId");

-- pgvector HNSW cosine index for profile-to-tender semantic recall (Stage 2).
CREATE INDEX "CompanyProfile_embedding_idx" ON "CompanyProfile" USING hnsw ("embedding" vector_cosine_ops);

-- CreateIndex
CREATE INDEX "Match_profileId_score_idx" ON "Match"("profileId", "score");

-- CreateIndex
CREATE INDEX "Match_tenderId_idx" ON "Match"("tenderId");

-- CreateIndex
CREATE UNIQUE INDEX "Match_profileId_tenderId_key" ON "Match"("profileId", "tenderId");

-- CreateIndex
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_purpose_createdAt_idx" ON "AiUsage"("purpose", "createdAt");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

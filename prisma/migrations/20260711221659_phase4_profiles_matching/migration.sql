-- CreateEnum
CREATE TYPE "MatchAction" AS ENUM ('NONE', 'SAVED', 'BIDDING', 'DISMISSED');

-- CreateEnum
CREATE TYPE "MatchVerdict" AS ENUM ('STRONG', 'POSSIBLE', 'WEAK', 'NO');

-- NOTE: prisma migrate diff wanted to drop the hand-written indexes from the init /
-- phase2 migrations (FTS GIN, HNSW, trgm, filter indexes) because they aren't modeled
-- in schema.prisma. Removed by hand — same convention as previous phases. Never let a
-- generated migration drop them.

-- AlterTable
ALTER TABLE "Tender" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL,
    "anonToken" TEXT NOT NULL,
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
    "version" INTEGER NOT NULL DEFAULT 1,
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
    "verdict" "MatchVerdict" NOT NULL,
    "fitReasons" TEXT[],
    "cautions" TEXT[],
    "profileVersion" INTEGER NOT NULL,
    "tenderVersion" INTEGER NOT NULL,
    "userAction" "MatchAction" NOT NULL DEFAULT 'NONE',
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
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "estCostUsd" DECIMAL(12,8) NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiFeedback" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "tenderId" TEXT,
    "profileId" TEXT,
    "helpful" BOOLEAN NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_anonToken_key" ON "CompanyProfile"("anonToken");

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

-- CreateIndex
CREATE INDEX "AiFeedback_subject_createdAt_idx" ON "AiFeedback"("subject", "createdAt");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PHASE-F1: WhatsApp as a second alert delivery channel.
--
-- NOTE: `prisma migrate dev` also emitted DROP INDEX statements for the raw-SQL
-- indexes it cannot model (Tender.searchVector GIN, the pg_trgm title index, the
-- pgvector embedding index) plus a `searchVector DROP DEFAULT`. Those are the
-- known, documented false diff (see README + prisma/migrations/…_init) and have
-- been removed by hand — dropping them would destroy the search/matching indexes.

-- CreateEnum
CREATE TYPE "WhatsappStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'FAILED', 'OPTED_OUT');

-- CreateEnum
CREATE TYPE "WhatsappDeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'UNDELIVERED', 'FAILED');

-- AlterEnum: new AlertChannel options. Postgres 12+ permits ALTER TYPE … ADD VALUE
-- inside a transaction as long as the new values are not used in that same
-- transaction — this migration only declares them.
ALTER TYPE "AlertChannel" ADD VALUE 'WHATSAPP';
ALTER TYPE "AlertChannel" ADD VALUE 'EMAIL_AND_WHATSAPP';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "whatsappFailureCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "whatsappOptOutAt" TIMESTAMP(3),
ADD COLUMN     "whatsappOtpAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "whatsappOtpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "whatsappOtpHash" TEXT,
ADD COLUMN     "whatsappPhone" TEXT,
ADD COLUMN     "whatsappStatus" "WhatsappStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "whatsappVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WhatsappMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "toPhone" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" "WhatsappDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statusUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappMessage_providerMessageId_key" ON "WhatsappMessage"("providerMessageId");

-- CreateIndex
CREATE INDEX "WhatsappMessage_userId_createdAt_idx" ON "WhatsappMessage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsappMessage_status_idx" ON "WhatsappMessage"("status");

-- AddForeignKey
ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

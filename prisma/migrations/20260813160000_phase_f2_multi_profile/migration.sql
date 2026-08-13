-- Phase F2: multi-profile switcher — scope SavedSearch and FollowedTender to
-- the CompanyProfile they were created under (previously account-wide only).
-- profileId is nullable: pre-existing rows have no profile and keep behaving
-- as account-wide until the user re-saves/re-follows under a specific profile.
--
-- NOTE: prisma migrate diff also wants to drop the hand-written indexes from
-- earlier migrations (FTS GIN, HNSW, trgm, filter indexes on Tender) because
-- they aren't modeled in schema.prisma. Removed by hand — same convention as
-- previous phases (see 20260711221659_phase4_profiles_matching). Never let a
-- generated migration drop them.

-- DropIndex
DROP INDEX "FollowedTender_userId_tenderId_key";

-- AlterTable
ALTER TABLE "FollowedTender" ADD COLUMN     "profileId" TEXT;

-- AlterTable
ALTER TABLE "SavedSearch" ADD COLUMN     "profileId" TEXT;

-- CreateIndex
CREATE INDEX "FollowedTender_profileId_idx" ON "FollowedTender"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "FollowedTender_userId_profileId_tenderId_key" ON "FollowedTender"("userId", "profileId", "tenderId");

-- CreateIndex
CREATE INDEX "SavedSearch_profileId_idx" ON "SavedSearch"("profileId");

-- AddForeignKey
ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowedTender" ADD CONSTRAINT "FollowedTender_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

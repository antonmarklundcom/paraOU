-- PHASE-F4: scope AlertLog dedupe by `reason` (not just tenderId), so a tender can
-- earn a later, distinct alert in its lifecycle -- e.g. a "match" alert while OPEN,
-- then an "award" alert once AWARDED -- without one suppressing the other.

-- DropIndex
DROP INDEX "AlertLog_userId_tenderId_channel_key";

-- CreateIndex
CREATE UNIQUE INDEX "AlertLog_userId_tenderId_channel_reason_key" ON "AlertLog"("userId", "tenderId", "channel", "reason");

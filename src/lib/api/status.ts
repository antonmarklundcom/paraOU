import { prisma } from "../db.js";
import { dncpConfigured } from "../env.js";

/** Data-freshness signal for the stale-data banner (docs/05: warn if >2h). */
export async function ingestionStatus() {
  const latest = await prisma.syncState.findFirst({
    where: { lastRunAt: { not: null } },
    orderBy: { lastRunAt: "desc" },
  });
  const ageMs = latest?.lastRunAt ? Date.now() - latest.lastRunAt.getTime() : null;
  return {
    fixtures: !dncpConfigured(),
    stale: ageMs === null || ageMs > 2 * 60 * 60 * 1000,
    lastRunAt: latest?.lastRunAt ?? null,
  };
}

import { prisma } from "../db.js";
import { dncpConfigured } from "../env.js";
import { cached } from "./cache.js";

/**
 * Data-freshness signal for the stale-data banner (docs/05: warn if >2h) and the
 * data-freshness badge (PLAN.md Phase G, docs/07 #product-quality). Cached briefly
 * — precise to the minute is plenty for "actualizado hace X min" and it's read on
 * nearly every page (layout footer + overview + landing + observatorio).
 */
export async function ingestionStatus() {
  return cached("status:ingestion", 2 * 60 * 1000, async () => {
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
  });
}

import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { todaySpendUsd } from "../ai/budget.js";
import { ApiError } from "./http.js";

/** Shared-secret gate for /api/admin/* — no Auth.js/roles until Phase 5. */
export function requireAdmin(req: Request): void {
  const token = req.headers.get("x-admin-token");
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    throw new ApiError(401, "UNAUTHORIZED", "Missing or invalid admin token");
  }
}

/** docs/04 step 6: spend + match-quality samples for the admin AI page. */
export async function getAiUsageSummary() {
  const [today, byPurpose, recentMatches, profileCount] = await Promise.all([
    todaySpendUsd(),
    prisma.$queryRaw<{ purpose: string; calls: number; totalCost: string | null }[]>(Prisma.sql`
      SELECT "purpose", count(*)::int AS calls, sum("estCostUsd")::text AS "totalCost"
      FROM "AiUsage"
      WHERE "createdAt" >= now() - interval '7 days'
      GROUP BY "purpose" ORDER BY sum("estCostUsd") DESC
    `),
    prisma.match.findMany({
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: { tender: { select: { title: true } }, profile: { select: { name: true } } },
    }),
    prisma.companyProfile.count(),
  ]);

  return {
    todaySpendUsd: today,
    dailyBudgetUsd: env.AI_DAILY_BUDGET_USD,
    budgetExceeded: today >= env.AI_DAILY_BUDGET_USD,
    last7Days: byPurpose,
    profileCount,
    recentMatchSamples: recentMatches.map((m) => ({
      profile: m.profile.name,
      tender: m.tender.title,
      score: m.score,
      verdict: m.verdict,
      reasoning: m.reasoning,
      cautions: m.cautions,
      updatedAt: m.updatedAt.toISOString(),
    })),
  };
}

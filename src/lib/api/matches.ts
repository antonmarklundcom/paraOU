import type { MatchAction, Plan } from "@prisma/client";
import { prisma } from "../db.js";
import { SHOW_THRESHOLD } from "../ai/match.js";
import { limitsFor } from "../plan.js";
import { ApiError } from "./http.js";

/**
 * Match feed queries for /panel (PHASE-4 deliverable 5). Only matches at or above
 * the show threshold (docs/04: score ≥ 50) are surfaced; lower scores stay stored
 * as the no-re-judge cache.
 */

export interface MatchFeedItem {
  tenderId: string;
  ocid: string;
  title: string;
  buyerName: string | null;
  department: string | null;
  procurementMethod: string | null;
  categoryName: string | null;
  status: string;
  amountMax: string | null;
  currency: string;
  deadlineAt: string | null;
  daysUntilDeadline: number | null;
  score: number;
  verdict: string;
  fitReasons: string[];
  cautions: string[];
  /** False when the plan's fullReasoningPerDay cap hides fitReasons/cautions
   * (PHASE-6 #1: "matches visible but reasoning blurred beyond top 3/day"). The
   * score/verdict always show — only the AI's written-out reasoning is gated. */
  reasoningVisible: boolean;
  userAction: MatchAction;
  matchedAt: string;
}

export interface MatchFeed {
  nuevos: MatchFeedItem[];
  cierranPronto: MatchFeedItem[];
  guardados: MatchFeedItem[];
}

const CLOSING_SOON_DAYS = 7;

export async function getMatchFeed(profileId: string, plan: Plan = "FREE"): Promise<MatchFeed> {
  const fullReasoningLimit = limitsFor(plan).fullReasoningPerDay;
  const rows = await prisma.match.findMany({
    where: {
      profileId,
      score: { gte: SHOW_THRESHOLD },
      tender: { status: "OPEN" },
    },
    orderBy: { score: "desc" },
    take: 200,
    include: {
      tender: {
        select: {
          id: true,
          ocid: true,
          title: true,
          buyerName: true,
          department: true,
          procurementMethod: true,
          categoryName: true,
          status: true,
          amountMax: true,
          currency: true,
          deadlineAt: true,
        },
      },
    },
  });

  const now = Date.now();
  // rows are score-desc; the plan's cap applies to the best matches first, since
  // those are the ones worth paying to fully understand.
  const items: MatchFeedItem[] = rows.map((m, i) => {
    const deadlineAt = m.tender.deadlineAt;
    const reasoningVisible = i < fullReasoningLimit;
    return {
      tenderId: m.tender.id,
      ocid: m.tender.ocid,
      title: m.tender.title,
      buyerName: m.tender.buyerName,
      department: m.tender.department,
      procurementMethod: m.tender.procurementMethod,
      categoryName: m.tender.categoryName,
      status: m.tender.status,
      amountMax: m.tender.amountMax?.toString() ?? null,
      currency: m.tender.currency,
      deadlineAt: deadlineAt?.toISOString() ?? null,
      daysUntilDeadline: deadlineAt
        ? Math.ceil((deadlineAt.getTime() - now) / (24 * 3600_000))
        : null,
      score: m.score,
      verdict: m.verdict,
      fitReasons: reasoningVisible ? m.fitReasons : [],
      cautions: reasoningVisible ? m.cautions : [],
      reasoningVisible,
      userAction: m.userAction,
      matchedAt: m.createdAt.toISOString(),
    };
  });

  const feed: MatchFeed = { nuevos: [], cierranPronto: [], guardados: [] };
  for (const item of items) {
    if (item.userAction === "DISMISSED") continue;
    if (item.userAction === "SAVED" || item.userAction === "BIDDING") {
      feed.guardados.push(item);
    } else if (
      item.daysUntilDeadline !== null &&
      item.daysUntilDeadline >= 0 &&
      item.daysUntilDeadline <= CLOSING_SOON_DAYS
    ) {
      feed.cierranPronto.push(item);
    } else {
      feed.nuevos.push(item);
    }
  }
  // Closing-soon reads best ordered by urgency, not score.
  feed.cierranPronto.sort((a, b) => (a.daysUntilDeadline ?? 99) - (b.daysUntilDeadline ?? 99));
  return feed;
}

export async function setMatchAction(
  profileId: string,
  tenderId: string,
  action: MatchAction,
): Promise<void> {
  const match = await prisma.match.findUnique({
    where: { profileId_tenderId: { profileId, tenderId } },
    select: { id: true },
  });
  if (!match) throw new ApiError(404, "MATCH_NOT_FOUND", "No match for this tender");
  await prisma.match.update({ where: { id: match.id }, data: { userAction: action } });
}

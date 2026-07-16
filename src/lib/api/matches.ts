import { z } from "zod";
import { prisma } from "../db.js";
import { ApiError } from "./http.js";
import { SHOW_THRESHOLD } from "../ai/matching.js";

/** /panel feed groups (docs/05 §3): Nuevos / Cierran pronto / Guardados. */
export interface FeedTender {
  ocid: string;
  title: string;
  status: string;
  buyerName: string | null;
  department: string | null;
  deadlineAt: string | null;
  daysUntilDeadline: number | null;
  score: number;
  verdict: string;
  reasoning: string;
  cautions: string[];
  userAction: string;
}

function daysUntil(deadline: Date | null): number | null {
  if (!deadline) return null;
  return Math.ceil((deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export async function getFeed(profileId: string) {
  const matches = await prisma.match.findMany({
    where: { profileId, score: { gte: SHOW_THRESHOLD }, userAction: { not: "DISMISSED" } },
    include: { tender: true },
    orderBy: { score: "desc" },
    take: 200,
  });

  const toFeedTender = (m: (typeof matches)[number]): FeedTender => ({
    ocid: m.tender.ocid,
    title: m.tender.title,
    status: m.tender.status,
    buyerName: m.tender.buyerName,
    department: m.tender.department,
    deadlineAt: m.tender.deadlineAt?.toISOString() ?? null,
    daysUntilDeadline: daysUntil(m.tender.deadlineAt),
    score: m.score,
    verdict: m.verdict,
    reasoning: m.reasoning,
    cautions: m.cautions,
    userAction: m.userAction,
  });

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const nuevos = matches
    .filter((m) => m.createdAt >= threeDaysAgo && m.userAction === "NONE")
    .map(toFeedTender);
  const cierranPronto = matches
    .filter((m) => {
      const d = daysUntil(m.tender.deadlineAt);
      return d !== null && d >= 0 && d <= 7;
    })
    .map(toFeedTender);
  const guardados = matches
    .filter((m) => m.userAction === "SAVED" || m.userAction === "BIDDING")
    .map(toFeedTender);

  return { nuevos, cierranPronto, guardados, total: matches.length };
}

/** Matches for a specific set of tender ocids, keyed by ocid — used to badge the
 * `/licitaciones` overview cards when the visitor has a profile (Phase 4). */
export async function getMatchesForOcids(profileId: string, ocids: string[]) {
  if (ocids.length === 0) return {};
  const matches = await prisma.match.findMany({
    where: { profileId, score: { gte: SHOW_THRESHOLD }, tender: { ocid: { in: ocids } } },
    include: { tender: { select: { ocid: true } } },
  });
  const out: Record<
    string,
    { score: number; verdict: string; reasoning: string; cautions: string[] }
  > = {};
  for (const m of matches) {
    out[m.tender.ocid] = {
      score: m.score,
      verdict: m.verdict,
      reasoning: m.reasoning,
      cautions: m.cautions,
    };
  }
  return out;
}

export const matchActionSchema = z.object({
  action: z.enum(["NONE", "SAVED", "BIDDING", "DISMISSED"]),
});

/** Sets Match.userAction, scoped to the caller's own profile (anon-cookie owned). */
export async function setMatchAction(profileId: string, ocid: string, action: string) {
  const tender = await prisma.tender.findUnique({ where: { ocid }, select: { id: true } });
  if (!tender) throw new ApiError(404, "NOT_FOUND", `Tender ${ocid} not found`);
  const match = await prisma.match.findUnique({
    where: { profileId_tenderId: { profileId, tenderId: tender.id } },
  });
  if (!match) throw new ApiError(404, "NOT_FOUND", "No match for this profile/tender");
  return prisma.match.update({
    where: { id: match.id },
    data: { userAction: action as "NONE" | "SAVED" | "BIDDING" | "DISMISSED" },
  });
}

import { Prisma, type CompanyProfile, type PrismaClient, type Tender } from "@prisma/client";
import { prisma } from "../db.js";
import { judgeMatch as callJudge } from "./provider.js";
import type { ProfileForJudge, TenderForJudge } from "./types.js";

/**
 * Three-stage matching funnel (docs/04 cost pyramid):
 *   Stage 1 — SQL hard filters (free)
 *   Stage 2 — pgvector semantic recall, top N (near-free)
 *   Stage 3 — LLM judge, only on survivors (the paid step, budget-gated)
 *
 * Match rows are the cache: every scored pair is upserted regardless of score, so a
 * pair is never re-sent to the LLM once (profile.updatedAt, tender.updatedAt) match
 * what's already stored (docs/04: "cache forever ... never re-score unchanged
 * pairs"). The feed/API layer filters to `score >= SHOW_THRESHOLD` for display —
 * "store" (cache) and "show" (surface) are deliberately different thresholds so the
 * cache still prevents re-scoring low-fit pairs on every sync.
 */

const MIN_DEADLINE_BUFFER_DAYS = 3;
const STAGE2_TOP_N = 30;
export const SHOW_THRESHOLD = 50;
export const ALERT_THRESHOLD = 70;

export interface MatchPipelineStats {
  stage1Candidates: number;
  stage2Candidates: number;
  scored: number;
  cached: number;
  skippedBudget: number;
}

function emptyStats(): MatchPipelineStats {
  return { stage1Candidates: 0, stage2Candidates: 0, scored: 0, cached: 0, skippedBudget: 0 };
}

interface Stage1Profile {
  departments: string[];
  amountMin: Prisma.Decimal | null;
  amountMax: Prisma.Decimal | null;
  excludeKeywords: string[];
}

/** Stage 1: free SQL filters — status, deadline buffer, geo, amount range, exclude keywords. */
export async function stage1HardFilters(
  profile: Stage1Profile,
  client: PrismaClient = prisma,
): Promise<string[]> {
  const conds: Prisma.Sql[] = [
    Prisma.sql`t."status" = 'OPEN'`,
    Prisma.sql`(t."deadlineAt" IS NULL OR t."deadlineAt" > now() + make_interval(days => ${MIN_DEADLINE_BUFFER_DAYS}::int))`,
  ];
  if (profile.departments.length > 0) {
    conds.push(Prisma.sql`t."department" IN (${Prisma.join(profile.departments)})`);
  }
  const amountMin = profile.amountMin !== null ? Number(profile.amountMin) : null;
  const amountMax = profile.amountMax !== null ? Number(profile.amountMax) : null;
  if (amountMin !== null) {
    conds.push(Prisma.sql`(t."amountMax" IS NULL OR t."amountMax" >= ${amountMin})`);
  }
  if (amountMax !== null) {
    conds.push(Prisma.sql`(t."amountMin" IS NULL OR t."amountMin" <= ${amountMax})`);
  }
  if (profile.excludeKeywords.length > 0) {
    const excludeConds = profile.excludeKeywords.map(
      (kw) =>
        Prisma.sql`unaccent(coalesce(t."title",'') || ' ' || coalesce(t."description",'')) ILIKE unaccent(${"%" + kw + "%"})`,
    );
    conds.push(Prisma.sql`NOT (${Prisma.join(excludeConds, " OR ")})`);
  }
  const rows = await client.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT t."id" FROM "Tender" t WHERE ${Prisma.join(conds, " AND ")}`,
  );
  return rows.map((r) => r.id);
}

/** Stage 2: pgvector cosine top-N among stage-1 survivors. Falls back to the first
 * N stage-1 ids (by the caller's ordering) if the profile has no embedding yet —
 * e.g. right after profile creation, before the embed job has run. */
export async function stage2SemanticRecall(
  profileId: string,
  candidateIds: string[],
  client: PrismaClient = prisma,
  topN = STAGE2_TOP_N,
): Promise<string[]> {
  if (candidateIds.length === 0) return [];

  const [row] = await client.$queryRaw<{ hasEmbedding: boolean }[]>(
    Prisma.sql`SELECT ("embedding" IS NOT NULL) AS "hasEmbedding" FROM "CompanyProfile" WHERE "id" = ${profileId}`,
  );
  if (!row?.hasEmbedding) return candidateIds.slice(0, topN);

  const rows = await client.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT t."id"
    FROM "Tender" t, "CompanyProfile" p
    WHERE p."id" = ${profileId}
      AND t."id" IN (${Prisma.join(candidateIds)})
      AND t."embedding" IS NOT NULL
    ORDER BY t."embedding" <=> p."embedding"
    LIMIT ${topN}
  `);
  return rows.map((r) => r.id);
}

function toProfileForJudge(p: CompanyProfile): ProfileForJudge {
  return {
    name: p.name,
    description: p.description,
    categoryCodes: p.categoryCodes,
    keywords: p.keywords,
    excludeKeywords: p.excludeKeywords,
    departments: p.departments,
    amountMin: p.amountMin?.toString() ?? null,
    amountMax: p.amountMax?.toString() ?? null,
    certifications: p.certifications,
  };
}

function toTenderForJudge(t: Tender): TenderForJudge {
  return {
    title: t.title,
    description: t.description,
    buyerName: t.buyerName,
    categoryName: t.categoryName,
    procurementMethod: t.procurementMethod,
    amountMax: t.amountMax?.toString() ?? null,
    currency: t.currency,
    department: t.department,
    deadlineAt: t.deadlineAt ? t.deadlineAt.toISOString() : null,
  };
}

export type ScoreOutcome = "cached" | "scored" | "skippedBudget" | "noResult";

/**
 * Judge one (profile, tender) pair and upsert the cache row, skipping the LLM call
 * entirely if a Match already reflects the current profile/tender versions. Shared
 * by the full pipeline and the wizard's bounded sample-matches call so the
 * cache/upsert logic lives in exactly one place.
 */
export async function judgeAndCachePair(
  profile: CompanyProfile,
  tender: Tender,
  client: PrismaClient = prisma,
): Promise<{
  outcome: ScoreOutcome;
  match: Awaited<ReturnType<PrismaClient["match"]["upsert"]>> | null;
}> {
  const existing = await client.match.findUnique({
    where: { profileId_tenderId: { profileId: profile.id, tenderId: tender.id } },
  });
  if (
    existing &&
    existing.profileVersion.getTime() === profile.updatedAt.getTime() &&
    existing.tenderVersion.getTime() === tender.updatedAt.getTime()
  ) {
    return { outcome: "cached", match: existing };
  }

  const { result, skipped } = await callJudge(
    toProfileForJudge(profile),
    toTenderForJudge(tender),
    client,
  );
  if (skipped) return { outcome: "skippedBudget", match: existing ?? null };
  if (!result) return { outcome: "noResult", match: existing ?? null };

  const data = {
    score: result.score,
    verdict: result.verdict,
    reasoning: result.fitReasons.join(" "),
    cautions: result.cautions,
    profileVersion: profile.updatedAt,
    tenderVersion: tender.updatedAt,
  };
  const match = await client.match.upsert({
    where: { profileId_tenderId: { profileId: profile.id, tenderId: tender.id } },
    create: { profileId: profile.id, tenderId: tender.id, ...data },
    update: data,
  });
  return { outcome: "scored", match };
}

/** Stage 3 + cache upsert for one profile. Safe to call repeatedly (idempotent). */
export async function runMatchPipelineForProfile(
  profileId: string,
  client: PrismaClient = prisma,
): Promise<MatchPipelineStats> {
  const stats = emptyStats();
  const profile = await client.companyProfile.findUnique({ where: { id: profileId } });
  if (!profile) return stats;

  const stage1Ids = await stage1HardFilters(profile, client);
  stats.stage1Candidates = stage1Ids.length;
  const stage2Ids = await stage2SemanticRecall(profileId, stage1Ids, client);
  stats.stage2Candidates = stage2Ids.length;
  if (stage2Ids.length === 0) return stats;

  const tenders = await client.tender.findMany({ where: { id: { in: stage2Ids } } });

  for (const tender of tenders) {
    const { outcome } = await judgeAndCachePair(profile, tender, client);
    if (outcome === "cached") stats.cached++;
    else if (outcome === "scored") stats.scored++;
    else if (outcome === "skippedBudget") stats.skippedBudget++;
  }

  return stats;
}

/** Run the pipeline for every stored profile — called after each incremental sync. */
export async function runMatchPipelineForAllProfiles(
  client: PrismaClient = prisma,
): Promise<MatchPipelineStats> {
  const profiles = await client.companyProfile.findMany({ select: { id: true } });
  const totals = emptyStats();
  for (const p of profiles) {
    const stats = await runMatchPipelineForProfile(p.id, client);
    totals.stage1Candidates += stats.stage1Candidates;
    totals.stage2Candidates += stats.stage2Candidates;
    totals.scored += stats.scored;
    totals.cached += stats.cached;
    totals.skippedBudget += stats.skippedBudget;
  }
  return totals;
}

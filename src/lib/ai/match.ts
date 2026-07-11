import { Prisma, type CompanyProfile } from "@prisma/client";
import { prisma } from "../db.js";
import { logger } from "../log.js";
import { getAiProvider, type JudgeResult } from "./provider.js";
import { budgetExceeded } from "./usage.js";

/**
 * The three-stage match funnel (docs/04):
 *   Stage 1 — free SQL hard filters (status, deadline, geo, amount, exclude-words)
 *   Stage 2 — pgvector cosine top-N blended with FTS keyword hits (~free)
 *   Stage 3 — LLM judge, one call per surviving pair, cached forever per
 *             (profileVersion, tenderVersion)
 *
 * ALL judged pairs are stored, including low scores — that is the cache that
 * guarantees a pair is never re-sent to the LLM. The UI filters to score ≥ 50
 * (SHOW_THRESHOLD); alerts (Phase 5) use ≥ 70.
 */

export const SHOW_THRESHOLD = 50;
export const STAGE2_TOP_N = 30;
/** Deadline must be at least this far away to be worth bidding on (docs/04). */
const MIN_DEADLINE_DAYS = 3;
/** Weight of an FTS keyword hit blended into the cosine ranking. */
const FTS_BLEND_BONUS = 0.15;

export interface CandidateRow {
  id: string;
  version: number;
  blendScore: number;
}

const VERDICT_MAP = {
  strong: "STRONG",
  possible: "POSSIBLE",
  weak: "WEAK",
  no: "NO",
} as const;

/**
 * Stages 1+2 in a single SQL query: hard filters, then cosine ranking against the
 * profile embedding with an FTS bonus when the profile's keywords hit the tender's
 * searchVector. Deterministic — unit-tested against seeded Postgres.
 */
export async function findCandidates(
  profile: Pick<
    CompanyProfile,
    "id" | "departments" | "amountMin" | "amountMax" | "excludeKeywords" | "keywords"
  >,
  opts: { topN?: number; now?: Date } = {},
): Promise<CandidateRow[]> {
  const now = opts.now ?? new Date();
  const minDeadline = new Date(now.getTime() + MIN_DEADLINE_DAYS * 24 * 3600_000);

  const conds: Prisma.Sql[] = [
    Prisma.sql`t.status = 'OPEN'`,
    Prisma.sql`t."deadlineAt" > ${minDeadline}`,
    Prisma.sql`t.embedding IS NOT NULL`,
  ];
  if (profile.departments.length > 0) {
    // Tenders without a department stay in — the judge weighs geography.
    conds.push(
      Prisma.sql`(t.department IS NULL OR t.department = ANY(${profile.departments}))`,
    );
  }
  if (profile.amountMin !== null) {
    conds.push(Prisma.sql`(t."amountMax" IS NULL OR t."amountMax" >= ${profile.amountMin})`);
  }
  if (profile.amountMax !== null) {
    conds.push(Prisma.sql`(t."amountMax" IS NULL OR t."amountMax" <= ${profile.amountMax})`);
  }
  for (const word of profile.excludeKeywords) {
    const pattern = `%${word.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conds.push(
      Prisma.sql`NOT (unaccent(t.title) ILIKE unaccent(${pattern}) OR unaccent(COALESCE(t.description, '')) ILIKE unaccent(${pattern}))`,
    );
  }

  const keywordsQuery = profile.keywords.length > 0 ? profile.keywords.join(" or ") : null;
  const ftsBonus = keywordsQuery
    ? Prisma.sql`(CASE WHEN t."searchVector" @@ websearch_to_tsquery('spanish_unaccent', ${keywordsQuery}) THEN ${FTS_BLEND_BONUS}::float ELSE 0 END)`
    : Prisma.sql`0::float`;

  return prisma.$queryRaw<CandidateRow[]>`
    SELECT t.id, t.version,
      (1 - (t.embedding <=> p.embedding))::float + ${ftsBonus} AS "blendScore"
    FROM "Tender" t, "CompanyProfile" p
    WHERE p.id = ${profile.id} AND p.embedding IS NOT NULL
      AND ${Prisma.join(conds, " AND ")}
    ORDER BY "blendScore" DESC
    LIMIT ${opts.topN ?? STAGE2_TOP_N}
  `;
}

async function judgeAndUpsert(
  profile: CompanyProfile,
  tenderId: string,
  tenderVersion: number,
): Promise<JudgeResult> {
  const t = await prisma.tender.findUniqueOrThrow({
    where: { id: tenderId },
    select: {
      title: true,
      description: true,
      buyerName: true,
      categoryName: true,
      procurementMethod: true,
      amountMax: true,
      currency: true,
      deadlineAt: true,
      department: true,
    },
  });
  const result = await getAiProvider().judgeMatch(
    {
      name: profile.name,
      description: profile.description,
      categoryCodes: profile.categoryCodes,
      keywords: profile.keywords,
      excludeKeywords: profile.excludeKeywords,
      departments: profile.departments,
      amountMin: profile.amountMin?.toString() ?? null,
      amountMax: profile.amountMax?.toString() ?? null,
      certifications: profile.certifications,
    },
    { ...t, amountMax: t.amountMax?.toString() ?? null },
  );
  await prisma.match.upsert({
    where: { profileId_tenderId: { profileId: profile.id, tenderId } },
    create: {
      profileId: profile.id,
      tenderId,
      score: result.score,
      verdict: VERDICT_MAP[result.verdict],
      fitReasons: result.fit_reasons,
      cautions: result.cautions,
      profileVersion: profile.version,
      tenderVersion,
    },
    update: {
      score: result.score,
      verdict: VERDICT_MAP[result.verdict],
      fitReasons: result.fit_reasons,
      cautions: result.cautions,
      profileVersion: profile.version,
      tenderVersion,
      // userAction intentionally preserved on re-score.
    },
  });
  return result;
}

export interface MatchRunStats {
  profileId: string;
  candidates: number;
  judged: number;
  cached: number;
  budgetPaused: boolean;
}

/**
 * Run the funnel for one profile. `maxJudgeCalls` caps stage 3 (the wizard's
 * instant sample uses 5). Pairs whose stored versions match are skipped — the
 * never-re-score rule (verifiable via ai_usage).
 */
export async function matchProfile(
  profileId: string,
  opts: { maxJudgeCalls?: number; topN?: number } = {},
): Promise<MatchRunStats> {
  const profile = await prisma.companyProfile.findUniqueOrThrow({ where: { id: profileId } });
  const stats: MatchRunStats = {
    profileId,
    candidates: 0,
    judged: 0,
    cached: 0,
    budgetPaused: false,
  };

  const candidates = await findCandidates(profile, { topN: opts.topN });
  stats.candidates = candidates.length;
  if (candidates.length === 0) return stats;

  const existing = await prisma.match.findMany({
    where: { profileId, tenderId: { in: candidates.map((c) => c.id) } },
    select: { tenderId: true, profileVersion: true, tenderVersion: true },
  });
  const fresh = new Set(
    existing
      .filter((m) => m.profileVersion === profile.version)
      .filter((m) => candidates.some((c) => c.id === m.tenderId && c.version === m.tenderVersion))
      .map((m) => m.tenderId),
  );

  const max = opts.maxJudgeCalls ?? Infinity;
  for (const c of candidates) {
    if (fresh.has(c.id)) {
      stats.cached += 1;
      continue;
    }
    if (stats.judged >= max) break;
    // Kill switch (docs/04): checked before every judge call so a runaway batch
    // stops mid-run, not at the next tick.
    if (await budgetExceeded()) {
      stats.budgetPaused = true;
      break;
    }
    await judgeAndUpsert(profile, c.id, c.version);
    stats.judged += 1;
  }
  logger.info(stats, "match funnel ran for profile");
  return stats;
}

/** Run matching for every profile — the worker job after each incremental sync. */
export async function matchAllProfiles(): Promise<MatchRunStats[]> {
  const profiles = await prisma.companyProfile.findMany({ select: { id: true } });
  const results: MatchRunStats[] = [];
  for (const p of profiles) {
    try {
      results.push(await matchProfile(p.id));
    } catch (err) {
      logger.error(
        { profileId: p.id, err: err instanceof Error ? err.message : String(err) },
        "match funnel failed for profile",
      );
    }
    if (results.at(-1)?.budgetPaused) break; // budget is global — stop the whole run
  }
  return results;
}

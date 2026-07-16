import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { ApiError } from "./http.js";
import { embedAndStoreProfile } from "../ai/embeddings.js";
import { suggestCategories as callSuggestCategories } from "../ai/provider.js";
import { judgeAndCachePair, stage1HardFilters, stage2SemanticRecall } from "../ai/matching.js";

/** Profile wizard input (docs/05 §4). */
export const profileInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(10).max(4000),
  categoryCodes: z.array(z.string().min(1).max(40)).max(20).default([]),
  keywords: z.array(z.string().min(1).max(60)).max(30).default([]),
  excludeKeywords: z.array(z.string().min(1).max(60)).max(20).default([]),
  departments: z.array(z.string().min(1).max(80)).max(20).default([]),
  amountMin: z.coerce.number().nonnegative().optional(),
  amountMax: z.coerce.number().nonnegative().optional(),
  certifications: z.array(z.string().min(1).max(80)).max(20).default([]),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

export async function getProfileByAnonId(anonId: string) {
  return prisma.companyProfile.findUnique({ where: { anonId } });
}

/** Create or update the profile for this anon id, then (re-)embed it — small,
 * bounded, user-initiated action, not a per-list render (CLAUDE.md rule 6). */
export async function upsertProfile(anonId: string, input: ProfileInput) {
  const data = {
    name: input.name,
    description: input.description,
    categoryCodes: input.categoryCodes,
    keywords: input.keywords,
    excludeKeywords: input.excludeKeywords,
    departments: input.departments,
    amountMin: input.amountMin ?? null,
    amountMax: input.amountMax ?? null,
    certifications: input.certifications,
  };
  const profile = await prisma.companyProfile.upsert({
    where: { anonId },
    create: { anonId, ...data },
    update: data,
  });
  await embedAndStoreProfile(profile.id);
  return prisma.companyProfile.findUniqueOrThrow({ where: { id: profile.id } });
}

/** Observed category catalog (docs/01: no dedicated N5/UNSPSC ingestion in Phase
 * 1–3 — `parametros`/`catalogos` endpoints are a later addition; until then the
 * wizard suggests from categories already seen in ingested tenders). */
export async function observedCategoryCatalog() {
  return prisma.$queryRaw<{ code: string; name: string | null }[]>(Prisma.sql`
    SELECT DISTINCT "categoryCode" AS code, "categoryName" AS name
    FROM "Tender" WHERE "categoryCode" IS NOT NULL
    ORDER BY code LIMIT 300
  `);
}

export async function suggestCategoriesFor(description: string) {
  const catalog = await observedCategoryCatalog();
  const candidates = catalog
    .filter((c): c is { code: string; name: string } => Boolean(c.name))
    .map((c) => ({ code: c.code, name: c.name }));
  const { result } = await callSuggestCategories(description, candidates);
  return result?.suggestions ?? [];
}

/** Instant "N sample matches" at the end of the wizard (docs/05: the aha moment).
 * Stages 1+2 narrow to `count` candidates, then Stage 3 scores ONLY those — an
 * explicit, bounded exception to "never score a list synchronously": this list is
 * capped at `count` items by construction, not the full feed. Results are still
 * cached as ordinary Match rows, so a later full pipeline run for this profile
 * won't re-score them. */
export async function sampleMatches(profileId: string, count = 5) {
  const profile = await prisma.companyProfile.findUniqueOrThrow({ where: { id: profileId } });
  const stage1 = await stage1HardFilters(profile);
  const stage2 = await stage2SemanticRecall(profileId, stage1, prisma, count);
  if (stage2.length === 0) return [];

  const tenders = await prisma.tender.findMany({ where: { id: { in: stage2 } } });
  const out: {
    ocid: string;
    title: string;
    score: number;
    verdict: string;
    reasoning: string;
    cautions: string[];
  }[] = [];

  for (const tender of tenders) {
    const { outcome, match } = await judgeAndCachePair(profile, tender, prisma);
    if (outcome === "skippedBudget" || outcome === "noResult" || !match) continue;
    out.push({
      ocid: tender.ocid,
      title: tender.title,
      score: match.score,
      verdict: match.verdict,
      reasoning: match.reasoning,
      cautions: match.cautions,
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

export function requireAnonProfile(anonId: string | null) {
  if (!anonId) throw new ApiError(404, "NO_PROFILE", "No profile for this browser yet");
}

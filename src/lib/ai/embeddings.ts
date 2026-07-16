import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../db.js";
import { logger } from "../log.js";
import { embedProfile, embedTender } from "./provider.js";

/** Text fed to the embedding model (docs/04: "title + category + truncated description"). */
export function tenderEmbeddingText(t: {
  title: string;
  description: string | null;
  categoryName: string | null;
}): string {
  const desc = (t.description ?? "").slice(0, 1000);
  return [t.title, t.categoryName, desc].filter(Boolean).join("\n");
}

/** Text fed to the embedding model for a company profile. */
export function profileEmbeddingText(p: {
  description: string;
  keywords: string[];
  categoryNames: string[];
}): string {
  return [p.description, p.keywords.join(", "), p.categoryNames.join(", ")]
    .filter(Boolean)
    .join("\n");
}

function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/** Embed one tender and store the vector. No-ops (skip, not error) if the daily
 * budget already has embeddings paused — embeddings are excluded from the paid
 * budget gate, so this only happens if the provider itself fails. */
export async function embedAndStoreTender(
  tenderId: string,
  client: PrismaClient = prisma,
): Promise<boolean> {
  const tender = await client.tender.findUniqueOrThrow({
    where: { id: tenderId },
    select: { title: true, description: true, categoryName: true },
  });
  const { result } = await embedTender(tenderEmbeddingText(tender), client);
  if (!result) return false;
  await client.$executeRaw(
    Prisma.sql`UPDATE "Tender" SET "embedding" = ${toVectorLiteral(result.vector)}::vector WHERE "id" = ${tenderId}`,
  );
  return true;
}

export async function embedAndStoreProfile(
  profileId: string,
  client: PrismaClient = prisma,
): Promise<boolean> {
  const profile = await client.companyProfile.findUniqueOrThrow({
    where: { id: profileId },
    select: { description: true, keywords: true, categoryCodes: true },
  });
  // categoryCodes are N5 codes; we don't have names handy here, so the text uses
  // keywords + description, which already carry the profile's own wording.
  const text = profileEmbeddingText({
    description: profile.description,
    keywords: profile.keywords,
    categoryNames: [],
  });
  const { result } = await embedProfile(text, client);
  if (!result) return false;
  await client.$executeRaw(
    Prisma.sql`UPDATE "CompanyProfile" SET "embedding" = ${toVectorLiteral(result.vector)}::vector WHERE "id" = ${profileId}`,
  );
  return true;
}

/** Embed every OPEN tender missing an embedding (worker job / backfill, PHASE-4 step 1). */
export async function embedMissingTenderEmbeddings(
  client: PrismaClient = prisma,
  limit = 200,
): Promise<number> {
  const rows = await client.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Tender"
    WHERE "embedding" IS NULL AND "status" = 'OPEN'
    ORDER BY "publishedAt" DESC NULLS LAST
    LIMIT ${limit}
  `);
  let count = 0;
  for (const row of rows) {
    try {
      const ok = await embedAndStoreTender(row.id, client);
      if (ok) count++;
      else break; // budget exhausted (unlikely for embeddings, but stop cleanly)
    } catch (err) {
      logger.error(
        { tenderId: row.id, err: err instanceof Error ? err.message : String(err) },
        "embed failed",
      );
    }
  }
  return count;
}

import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { logger } from "../log.js";
import { getAiProvider } from "./provider.js";

/**
 * Tender/profile embeddings for the stage-2 semantic prefilter (docs/04).
 * What gets embedded (docs/04): tender = title + category + truncated description;
 * profile = description + keywords + category names. Vectors land in the pgvector
 * columns via raw SQL (Prisma models them as Unsupported).
 */

const DESCRIPTION_CHAR_LIMIT = 2000;
/** batchEmbedContents accepts up to 100 requests per call. */
const EMBED_BATCH_SIZE = 100;

export function buildTenderEmbeddingText(t: {
  title: string;
  categoryName?: string | null;
  description?: string | null;
}): string {
  return [t.title, t.categoryName, t.description?.slice(0, DESCRIPTION_CHAR_LIMIT)]
    .filter(Boolean)
    .join("\n");
}

export function buildProfileEmbeddingText(p: {
  description: string;
  keywords: string[];
  categoryNames: string[];
}): string {
  return [p.description, p.keywords.join(", "), p.categoryNames.join(", ")]
    .filter(Boolean)
    .join("\n");
}

function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

/**
 * Embed all tenders that don't have a vector yet, OPEN ones first (phase doc:
 * backfill embeds existing OPEN tenders first, then history lazily). Returns the
 * number embedded. Used by both the ingest hook (new rows) and the backfill CLI.
 */
export async function embedMissingTenders(opts?: { limit?: number }): Promise<number> {
  const provider = getAiProvider();
  let total = 0;
  const max = opts?.limit ?? Infinity;

  for (;;) {
    const take = Math.min(EMBED_BATCH_SIZE, max - total);
    if (take <= 0) break;
    const tenders = await prisma.$queryRaw<
      { id: string; title: string; categoryName: string | null; description: string | null }[]
    >`
      SELECT id, title, "categoryName", description FROM "Tender"
      WHERE embedding IS NULL
      ORDER BY (status = 'OPEN') DESC, "publishedAt" DESC NULLS LAST
      LIMIT ${take}
    `;
    if (tenders.length === 0) break;

    const vectors = await provider.embed(tenders.map(buildTenderEmbeddingText), "document");
    await prisma.$transaction(
      tenders.map(
        (t, i) =>
          prisma.$executeRaw`
          UPDATE "Tender" SET embedding = ${toVectorLiteral(vectors[i] ?? [])}::vector
          WHERE id = ${t.id}
        `,
      ),
    );
    total += tenders.length;
    logger.info({ batch: tenders.length, total }, "embedded tenders");
    if (tenders.length < take) break;
  }
  return total;
}

/** (Re-)embed one profile — called on create and on every matching-relevant edit. */
export async function embedProfile(profileId: string): Promise<void> {
  const profile = await prisma.companyProfile.findUniqueOrThrow({
    where: { id: profileId },
    select: { description: true, keywords: true, categoryCodes: true },
  });
  // Category names read better than raw codes in embedding space.
  const cats = await prisma.tender.findMany({
    where: { categoryCode: { in: profile.categoryCodes } },
    select: { categoryName: true },
    distinct: ["categoryName"],
  });
  const text = buildProfileEmbeddingText({
    description: profile.description,
    keywords: profile.keywords,
    categoryNames: cats.map((c) => c.categoryName).filter((n): n is string => Boolean(n)),
  });
  const vectors = await getAiProvider().embed([text], "query");
  const vector = vectors[0];
  if (!vector) throw new Error("provider returned no embedding for profile");
  await prisma.$executeRaw(
    Prisma.sql`UPDATE "CompanyProfile" SET embedding = ${toVectorLiteral(vector)}::vector WHERE id = ${profileId}`,
  );
}

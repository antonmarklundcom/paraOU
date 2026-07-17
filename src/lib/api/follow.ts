import { prisma } from "../db.js";
import { ApiError } from "./http.js";

export async function isFollowing(userId: string, ocid: string): Promise<boolean> {
  const tender = await prisma.tender.findUnique({ where: { ocid }, select: { id: true } });
  if (!tender) return false;
  const row = await prisma.follow.findUnique({
    where: { userId_tenderId: { userId, tenderId: tender.id } },
  });
  return Boolean(row);
}

/** Toggle follow for a tender; returns the new state. */
export async function toggleFollow(userId: string, ocid: string): Promise<boolean> {
  const tender = await prisma.tender.findUnique({ where: { ocid }, select: { id: true } });
  if (!tender) throw new ApiError(404, "NOT_FOUND", `Tender ${ocid} not found`);

  const existing = await prisma.follow.findUnique({
    where: { userId_tenderId: { userId, tenderId: tender.id } },
  });
  if (existing) {
    await prisma.follow.delete({ where: { id: existing.id } });
    return false;
  }
  await prisma.follow.create({ data: { userId, tenderId: tender.id } });
  return true;
}

/** One-time migration of Phase 3's localStorage follows into the DB on first
 * sign-in (PHASE-5 step 1: "migrate the anonymous ... actions into the DB"). */
export async function migrateLocalFollows(userId: string, ocids: string[]): Promise<number> {
  if (ocids.length === 0) return 0;
  const tenders = await prisma.tender.findMany({
    where: { ocid: { in: ocids } },
    select: { id: true },
  });
  let migrated = 0;
  for (const t of tenders) {
    const created = await prisma.follow
      .create({ data: { userId, tenderId: t.id } })
      .catch(() => null); // unique constraint -> already followed, skip
    if (created) migrated++;
  }
  return migrated;
}

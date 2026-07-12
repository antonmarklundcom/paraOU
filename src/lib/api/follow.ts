import { prisma } from "../db.js";
import { ApiError } from "./http.js";

/** DB-backed 🔔 follow for logged-in users (PHASE-5 #4). Keyed by ocid at the API
 * boundary (that's what the client has); resolved to Tender.id internally. */

async function requireTenderId(ocid: string): Promise<string> {
  const tender = await prisma.tender.findUnique({ where: { ocid }, select: { id: true } });
  if (!tender) throw new ApiError(404, "TENDER_NOT_FOUND", `Tender ${ocid} not found`);
  return tender.id;
}

export async function isFollowing(userId: string, ocid: string): Promise<boolean> {
  const tenderId = await requireTenderId(ocid);
  const row = await prisma.followedTender.findUnique({
    where: { userId_tenderId: { userId, tenderId } },
  });
  return Boolean(row);
}

/** Toggles and returns the new state. */
export async function toggleFollow(userId: string, ocid: string): Promise<boolean> {
  const tenderId = await requireTenderId(ocid);
  const existing = await prisma.followedTender.findUnique({
    where: { userId_tenderId: { userId, tenderId } },
  });
  if (existing) {
    await prisma.followedTender.delete({ where: { id: existing.id } });
    return false;
  }
  await prisma.followedTender.create({ data: { userId, tenderId } });
  return true;
}

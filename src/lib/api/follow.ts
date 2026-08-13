import { prisma } from "../db.js";
import { ApiError } from "./http.js";

/** DB-backed 🔔 follow for logged-in users (PHASE-5 #4). Keyed by ocid at the API
 * boundary (that's what the client has); resolved to Tender.id internally.
 *
 * Phase F2 (multi-profile): a follow belongs to the account's *active*
 * CompanyProfile (nullable — pre-F2 rows and accounts with no profile yet stay
 * `profileId: null`, i.e. account-wide). */

async function requireTenderId(ocid: string): Promise<string> {
  const tender = await prisma.tender.findUnique({ where: { ocid }, select: { id: true } });
  if (!tender) throw new ApiError(404, "TENDER_NOT_FOUND", `Tender ${ocid} not found`);
  return tender.id;
}

// findFirst, not findUnique: Prisma's compound-unique lookup type requires a
// non-null profileId (SQL NULL can't identify a single row via a unique index
// the way findUnique needs), but a null profileId is a real, valid value here
// (pre-F2 / no-profile-yet rows) — findFirst has no such restriction and the
// (userId, profileId, tenderId) unique index still makes this an O(1) lookup.
async function findFollow(userId: string, profileId: string | null, tenderId: string) {
  return prisma.followedTender.findFirst({ where: { userId, profileId, tenderId } });
}

export async function isFollowing(
  userId: string,
  profileId: string | null,
  ocid: string,
): Promise<boolean> {
  const tenderId = await requireTenderId(ocid);
  return Boolean(await findFollow(userId, profileId, tenderId));
}

/** Toggles and returns the new state. */
export async function toggleFollow(
  userId: string,
  profileId: string | null,
  ocid: string,
): Promise<boolean> {
  const tenderId = await requireTenderId(ocid);
  const existing = await findFollow(userId, profileId, tenderId);
  if (existing) {
    await prisma.followedTender.delete({ where: { id: existing.id } });
    return false;
  }
  await prisma.followedTender.create({ data: { userId, profileId, tenderId } });
  return true;
}

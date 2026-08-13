import { Prisma, type CompanyProfile, type Plan } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { limitsFor } from "../plan.js";
import { ApiError } from "./http.js";

/**
 * Company profile persistence for the /perfil wizard (PHASE-4 deliverable 2).
 * Profiles are anonymous until Phase 5 auth: the browser holds `anonToken` in
 * localStorage and sends it as the `x-profile-token` header; the server only ever
 * resolves a profile from that token, never by raw id from the client.
 */

export const profileBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(10).max(2000),
  categoryCodes: z.array(z.string().max(40)).max(20).default([]),
  keywords: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  excludeKeywords: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  departments: z.array(z.string().max(60)).max(20).default([]),
  amountMin: z.coerce.number().nonnegative().nullish(),
  amountMax: z.coerce.number().nonnegative().nullish(),
  certifications: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
});
export type ProfileBody = z.infer<typeof profileBodySchema>;

export function profileToken(req: Request): string {
  const token = req.headers.get("x-profile-token");
  if (!token) throw new ApiError(401, "NO_PROFILE_TOKEN", "Missing x-profile-token header");
  return token;
}

/** All profiles owned by a user, oldest first (the default/"first" profile). */
export async function listProfiles(userId: string): Promise<CompanyProfile[]> {
  return prisma.companyProfile.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
}

/**
 * Resolve which of a signed-in user's profiles is "active" (Phase F2:
 * multi-profile switcher). The browser sends the currently-selected profile id
 * in `x-profile-id`; it's only honored when it actually belongs to this user
 * (never trust a raw id across accounts). Falls back to the oldest profile —
 * same default as before F2, so single-profile accounts are unaffected.
 * Returns null if the user has no profile yet.
 */
export async function resolveActiveProfileId(
  userId: string,
  req: Request,
): Promise<string | null> {
  const profiles = await listProfiles(userId);
  const oldest = profiles[0];
  if (!oldest) return null;
  const requested = req.headers.get("x-profile-id");
  if (requested && profiles.some((p) => p.id === requested)) return requested;
  return oldest.id;
}

/**
 * Resolve the caller's profile: a logged-in user's *active* profile takes
 * priority (Phase 5 + F2's `x-profile-id` switcher header), falling back to the
 * anonymous `x-profile-token` header (Phase 4) for visitors who haven't signed
 * in yet.
 */
export async function requireProfile(req: Request): Promise<CompanyProfile> {
  const { auth } = await import("../auth.js");
  const session = await auth();
  if (session?.user?.id) {
    const activeId = await resolveActiveProfileId(session.user.id, req);
    if (activeId) {
      const owned = await prisma.companyProfile.findUnique({ where: { id: activeId } });
      if (owned) return owned;
    }
  }
  const profile = await prisma.companyProfile.findUnique({
    where: { anonToken: profileToken(req) },
  });
  if (!profile) throw new ApiError(404, "PROFILE_NOT_FOUND", "No profile for this token");
  return profile;
}

/**
 * First-login migration (PHASE-5 #1): attach the browser's anonymous profile to
 * the new/returning account. No-ops if the token is unknown, already claimed, or
 * the user already owns a profile (never silently merge two profiles).
 */
export async function claimAnonymousProfile(
  userId: string,
  anonToken: string,
): Promise<CompanyProfile | null> {
  const alreadyOwned = await prisma.companyProfile.findFirst({ where: { userId } });
  if (alreadyOwned) return alreadyOwned;

  const anon = await prisma.companyProfile.findUnique({ where: { anonToken } });
  if (!anon || anon.userId) return null;

  return prisma.companyProfile.update({ where: { id: anon.id }, data: { userId } });
}

function toData(body: ProfileBody) {
  return {
    name: body.name,
    description: body.description,
    categoryCodes: body.categoryCodes,
    keywords: body.keywords,
    excludeKeywords: body.excludeKeywords,
    departments: body.departments,
    amountMin: body.amountMin != null ? new Prisma.Decimal(body.amountMin) : null,
    amountMax: body.amountMax != null ? new Prisma.Decimal(body.amountMax) : null,
    certifications: body.certifications,
  };
}

/**
 * Anonymous visitors always get a fresh profile (they have none yet by
 * definition). Signed-in users are capped by their plan's `maxProfiles`
 * (PHASE-6 #1) — the /perfil + /panel switcher (Phase F2) is how BUSINESS/AGENCY
 * accounts actually reach a 2nd/3rd profile through the UI.
 */
export async function createProfile(body: ProfileBody): Promise<CompanyProfile> {
  const { auth } = await import("../auth.js");
  const session = await auth();
  if (session?.user?.id) {
    const existing = await prisma.companyProfile.count({ where: { userId: session.user.id } });
    const max = limitsFor(session.user.plan as Plan).maxProfiles;
    if (existing >= max) {
      throw new ApiError(
        403,
        "PLAN_LIMIT",
        `Your plan allows ${max} compan${max === 1 ? "y profile" : "y profiles"} — upgrade at /precios`,
      );
    }
  }
  return prisma.companyProfile.create({
    data: { ...toData(body), userId: session?.user?.id ?? null },
  });
}

/** Update + bump `version` so the match cache re-judges pairs (docs/04). */
export async function updateProfile(id: string, body: ProfileBody): Promise<CompanyProfile> {
  return prisma.companyProfile.update({
    where: { id },
    data: { ...toData(body), version: { increment: 1 } },
  });
}

/**
 * Delete an owned profile (Phase F2). Refuses to remove an account's last
 * profile — the switcher only ever deletes "additional" profiles, never leaves
 * a signed-in user with zero (that would silently break /panel + saved
 * searches/follows, which fall back to account-wide only when there truly is
 * no profile). SavedSearch/FollowedTender rows scoped to it cascade-delete.
 */
export async function deleteProfile(userId: string, profileId: string): Promise<void> {
  const owned = await prisma.companyProfile.findUnique({ where: { id: profileId } });
  if (!owned || owned.userId !== userId) {
    throw new ApiError(404, "PROFILE_NOT_FOUND", "No profile with this id");
  }
  const count = await prisma.companyProfile.count({ where: { userId } });
  if (count <= 1) {
    throw new ApiError(400, "LAST_PROFILE", "Can't delete your only company profile");
  }
  await prisma.companyProfile.delete({ where: { id: profileId } });
}

/** Public (client-safe) shape of a profile — never leaks anonToken of others. */
export function publicProfile(p: CompanyProfile) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    categoryCodes: p.categoryCodes,
    keywords: p.keywords,
    excludeKeywords: p.excludeKeywords,
    departments: p.departments,
    amountMin: p.amountMin?.toString() ?? null,
    amountMax: p.amountMax?.toString() ?? null,
    certifications: p.certifications,
    version: p.version,
  };
}

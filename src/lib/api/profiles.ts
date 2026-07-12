import { Prisma, type CompanyProfile } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
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

export async function requireProfile(req: Request): Promise<CompanyProfile> {
  const profile = await prisma.companyProfile.findUnique({
    where: { anonToken: profileToken(req) },
  });
  if (!profile) throw new ApiError(404, "PROFILE_NOT_FOUND", "No profile for this token");
  return profile;
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

export async function createProfile(body: ProfileBody): Promise<CompanyProfile> {
  return prisma.companyProfile.create({ data: toData(body) });
}

/** Update + bump `version` so the match cache re-judges pairs (docs/04). */
export async function updateProfile(id: string, body: ProfileBody): Promise<CompanyProfile> {
  return prisma.companyProfile.update({
    where: { id },
    data: { ...toData(body), version: { increment: 1 } },
  });
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

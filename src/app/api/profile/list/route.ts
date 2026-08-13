import type { Plan } from "@prisma/client";
import { auth } from "@/lib/auth";
import { ApiError, handle, ok } from "@/lib/api/http";
import { listProfiles, publicProfile } from "@/lib/api/profiles";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";
import { limitsFor } from "@/lib/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Profile switcher data (Phase F2): every CompanyProfile the signed-in account
 * owns, plus the plan's `maxProfiles` so the client can gate "add a profile"
 * without a second round trip. Signed-in only — anonymous visitors have at
 * most one profile (resolved via `x-profile-token`, not this list).
 */
export const GET = handle(async (req) => {
  enforcePublicRateLimit(req);
  const session = await auth();
  if (!session?.user?.id) throw new ApiError(401, "UNAUTHENTICATED", "Sign in required");
  const profiles = await listProfiles(session.user.id);
  const maxProfiles = limitsFor(session.user.plan as Plan).maxProfiles;
  return ok({
    profiles: profiles.map(publicProfile),
    maxProfiles: Number.isFinite(maxProfiles) ? maxProfiles : null,
  });
});

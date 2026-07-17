import { prisma } from "./db.js";
import { auth } from "./auth.js";
import { readAnonId } from "./anon.js";

/**
 * Resolves "whose profile is this" across both eras (PHASE-5 step 1): a session
 * user if signed in, otherwise the anon-cookie profile from before Phase 5.
 *
 * Migration happens lazily here rather than in an Auth.js event: the first
 * authenticated request that calls this links any anon-cookie profile with a
 * matching `anonId` and no `userId` to the signed-in user (`anonId` is kept
 * afterward — reusing it is harmless once it's linked, and it keeps this function
 * idempotent). This runs on every call, but it's a single indexed lookup + a
 * conditional single-row update, not a synchronous AI call.
 */
export async function getCurrentProfile() {
  const session = await auth();
  const anonId = await readAnonId();

  if (session?.user?.id) {
    const userId = session.user.id;
    let profile = await prisma.companyProfile.findFirst({ where: { userId } });

    if (!profile && anonId) {
      const anonProfile = await prisma.companyProfile.findUnique({ where: { anonId } });
      if (anonProfile && !anonProfile.userId) {
        profile = await prisma.companyProfile.update({
          where: { id: anonProfile.id },
          data: { userId },
        });
      }
    }
    return { profile, userId, anonId };
  }

  const profile = anonId ? await prisma.companyProfile.findUnique({ where: { anonId } }) : null;
  return { profile, userId: null as string | null, anonId };
}

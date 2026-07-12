import { embedProfile } from "@/lib/ai/embeddings";
import { fail, handle, ok } from "@/lib/api/http";
import {
  createProfile,
  profileBodySchema,
  publicProfile,
  requireProfile,
  updateProfile,
} from "@/lib/api/profiles";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";
import { aiConfigured } from "@/lib/env";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Anonymous profile CRUD for the /perfil wizard. POST returns the anonToken once —
 * the browser stores it in localStorage (Phase 5 migrates to real accounts).
 * Embedding happens inline (single cheap call); match judging is NOT done here —
 * the sample-matches route and the worker handle that.
 */

async function tryEmbed(profileId: string): Promise<boolean> {
  if (!aiConfigured()) return false;
  try {
    await embedProfile(profileId);
    return true;
  } catch (err) {
    // Profile persists even when the AI provider is down; the worker's next AI
    // pass won't fix profiles (only tenders), so surface the degraded state.
    logger.error(
      { profileId, err: err instanceof Error ? err.message : String(err) },
      "profile embedding failed",
    );
    return false;
  }
}

export const POST = handle(async (req) => {
  enforcePublicRateLimit(req);
  const body = profileBodySchema.parse(await req.json());
  const profile = await createProfile(body);
  const embedded = await tryEmbed(profile.id);
  return ok({ ...publicProfile(profile), anonToken: profile.anonToken, embedded });
});

export const GET = handle(async (req) => {
  enforcePublicRateLimit(req);
  return ok(publicProfile(await requireProfile(req)));
});

export const PUT = handle(async (req) => {
  enforcePublicRateLimit(req);
  const existing = await requireProfile(req);
  const body = profileBodySchema.parse(await req.json());
  const profile = await updateProfile(existing.id, body);
  const embedded = await tryEmbed(profile.id);
  return ok({ ...publicProfile(profile), embedded });
});

export const DELETE = handle(async () => {
  return fail(405, "NOT_IMPLEMENTED", "Profile deletion ships with accounts (Phase 5)");
});

import { handle, ok, fail } from "@/lib/api/http";
import { getOrCreateAnonId } from "@/lib/anon";
import { getCurrentProfile } from "@/lib/identity";
import { profileInputSchema, upsertProfile } from "@/lib/api/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const { profile } = await getCurrentProfile();
  return ok(profile);
});

export const POST = handle(async (req) => {
  const body = profileInputSchema.safeParse(await req.json());
  if (!body.success) return fail(400, "VALIDATION", "Invalid profile", body.error.flatten());

  const { profile, userId, anonId } = await getCurrentProfile();
  if (profile) {
    const updated = await upsertProfile({ existingId: profile.id }, body.data);
    return ok(updated);
  }

  // New profile: signed-in users key by userId; anonymous visitors mint a cookie.
  const identity = userId ? { userId } : { anonId: anonId ?? (await getOrCreateAnonId()).id };
  const created = await upsertProfile(identity, body.data);
  return ok(created);
});

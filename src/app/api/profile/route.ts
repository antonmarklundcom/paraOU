import { handle, ok, fail } from "@/lib/api/http";
import { readAnonId, getOrCreateAnonId } from "@/lib/anon";
import { getProfileByAnonId, profileInputSchema, upsertProfile } from "@/lib/api/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const anonId = await readAnonId();
  if (!anonId) return ok(null);
  const profile = await getProfileByAnonId(anonId);
  return ok(profile);
});

export const POST = handle(async (req) => {
  const body = profileInputSchema.safeParse(await req.json());
  if (!body.success) return fail(400, "VALIDATION", "Invalid profile", body.error.flatten());
  const { id } = await getOrCreateAnonId();
  const profile = await upsertProfile(id, body.data);
  return ok(profile);
});

import { handle, ok, fail } from "@/lib/api/http";
import { getCurrentProfile } from "@/lib/identity";
import {
  createSavedSearch,
  listSavedSearches,
  savedSearchInputSchema,
} from "@/lib/api/savedSearches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const { profile } = await getCurrentProfile();
  if (!profile) return ok([]);
  return ok(await listSavedSearches(profile.id));
});

export const POST = handle(async (req) => {
  const { profile, userId } = await getCurrentProfile();
  // Saved searches need an account to alert to (docs/05: gated behind signup).
  if (!userId || !profile) {
    return fail(401, "SIGN_IN_REQUIRED", "Iniciá sesión para guardar búsquedas");
  }
  const body = savedSearchInputSchema.safeParse(await req.json());
  if (!body.success) return fail(400, "VALIDATION", "Invalid saved search", body.error.flatten());
  return ok(await createSavedSearch(profile.id, body.data));
});

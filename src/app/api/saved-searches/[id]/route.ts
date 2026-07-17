import { z } from "zod";
import { handle, ok, fail } from "@/lib/api/http";
import { getCurrentProfile } from "@/lib/identity";
import { deleteSavedSearch, updateSavedSearch } from "@/lib/api/savedSearches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  alerting: z.boolean().optional(),
});

export const PATCH = handle<{ id: string }>(async (req, ctx) => {
  const { profile } = await getCurrentProfile();
  if (!profile) return fail(404, "NOT_FOUND", "Saved search not found");
  const body = patchSchema.safeParse(await req.json());
  if (!body.success) return fail(400, "VALIDATION", "Invalid update", body.error.flatten());
  const { id } = await ctx.params;
  return ok(await updateSavedSearch(profile.id, id, body.data));
});

export const DELETE = handle<{ id: string }>(async (_req, ctx) => {
  const { profile } = await getCurrentProfile();
  if (!profile) return fail(404, "NOT_FOUND", "Saved search not found");
  const { id } = await ctx.params;
  await deleteSavedSearch(profile.id, id);
  return ok({ deleted: true });
});

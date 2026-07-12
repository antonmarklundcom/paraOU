import { z } from "zod";
import { handle, ok } from "@/lib/api/http";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";
import {
  deleteSavedSearch,
  publicSavedSearch,
  requireUserId,
  updateSavedSearch,
} from "@/lib/api/savedSearches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  alerting: z.boolean().optional(),
});

export const PATCH = handle<{ id: string }>(async (req, ctx) => {
  enforcePublicRateLimit(req);
  const userId = await requireUserId();
  const { id } = await ctx.params;
  const body = patchSchema.parse(await req.json());
  const search = await updateSavedSearch(userId, id, body);
  return ok(publicSavedSearch(search));
});

export const DELETE = handle<{ id: string }>(async (req, ctx) => {
  enforcePublicRateLimit(req);
  const userId = await requireUserId();
  const { id } = await ctx.params;
  await deleteSavedSearch(userId, id);
  return ok({ deleted: true });
});

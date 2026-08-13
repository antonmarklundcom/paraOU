import { handle, ok } from "@/lib/api/http";
import { resolveActiveProfileId } from "@/lib/api/profiles";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";
import {
  createSavedSearch,
  listSavedSearches,
  publicSavedSearch,
  requireUserId,
  savedSearchBodySchema,
} from "@/lib/api/savedSearches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  enforcePublicRateLimit(req);
  const userId = await requireUserId();
  const profileId = await resolveActiveProfileId(userId, req);
  const searches = await listSavedSearches(userId, profileId);
  return ok(searches.map(publicSavedSearch));
});

export const POST = handle(async (req) => {
  enforcePublicRateLimit(req);
  const userId = await requireUserId();
  const profileId = await resolveActiveProfileId(userId, req);
  const body = savedSearchBodySchema.parse(await req.json());
  const search = await createSavedSearch(userId, profileId, body);
  return ok(publicSavedSearch(search));
});

import { handle, ok } from "@/lib/api/http";
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
  const searches = await listSavedSearches(userId);
  return ok(searches.map(publicSavedSearch));
});

export const POST = handle(async (req) => {
  enforcePublicRateLimit(req);
  const userId = await requireUserId();
  const body = savedSearchBodySchema.parse(await req.json());
  const search = await createSavedSearch(userId, body);
  return ok(publicSavedSearch(search));
});

import { z } from "zod";
import { handle, ok, parseQuery } from "@/lib/api/http";
import { getCurrentProfile } from "@/lib/identity";
import { getMatchesForOcids } from "@/lib/api/matches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  ocid: z.preprocess((v) => (Array.isArray(v) ? v : [v]), z.array(z.string())).default([]),
});

/** Match badges for a specific page of tender cards (docs/05: badge only when the
 * visitor has a profile). Used by both the SSR overview page and TenderList's
 * client-side "load more". */
export const GET = handle(async (req) => {
  const { ocid } = parseQuery(req.url, schema);
  const { profile } = await getCurrentProfile();
  if (!profile) return ok({});
  return ok(await getMatchesForOcids(profile.id, ocid));
});

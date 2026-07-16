import { handle, ok } from "@/lib/api/http";
import { readAnonId } from "@/lib/anon";
import { getProfileByAnonId } from "@/lib/api/profile";
import { getFeed } from "@/lib/api/matches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY_FEED = { nuevos: [], cierranPronto: [], guardados: [], total: 0 };

export const GET = handle(async () => {
  const anonId = await readAnonId();
  if (!anonId) return ok(EMPTY_FEED);
  const profile = await getProfileByAnonId(anonId);
  if (!profile) return ok(EMPTY_FEED);
  return ok(await getFeed(profile.id));
});

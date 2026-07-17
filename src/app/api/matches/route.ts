import { handle, ok } from "@/lib/api/http";
import { getCurrentProfile } from "@/lib/identity";
import { getFeed } from "@/lib/api/matches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY_FEED = { nuevos: [], cierranPronto: [], guardados: [], total: 0 };

export const GET = handle(async () => {
  const { profile } = await getCurrentProfile();
  if (!profile) return ok(EMPTY_FEED);
  return ok(await getFeed(profile.id));
});

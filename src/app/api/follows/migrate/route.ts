import { z } from "zod";
import { handle, ok, fail } from "@/lib/api/http";
import { auth } from "@/lib/auth";
import { migrateLocalFollows } from "@/lib/api/follow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ ocids: z.array(z.string()).max(200) });

/** One-time client-triggered migration of localStorage follows into the DB
 * (PHASE-5 step 1) — called once after sign-in; safe to call repeatedly (unique
 * constraint dedupes). */
export const POST = handle(async (req) => {
  const session = await auth();
  if (!session?.user?.id) return fail(401, "SIGN_IN_REQUIRED", "Not signed in");
  const body = schema.safeParse(await req.json());
  if (!body.success) return fail(400, "VALIDATION", "Invalid body", body.error.flatten());
  const migrated = await migrateLocalFollows(session.user.id, body.data.ocids);
  return ok({ migrated });
});

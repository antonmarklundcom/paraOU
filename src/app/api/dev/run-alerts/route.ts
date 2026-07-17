import { handle, ok, fail } from "@/lib/api/http";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { runAlertEngine } from "@/worker/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dev/e2e-only: triggers the alert engine on demand so e2e tests can exercise the
 * digest flow without spawning the worker process. Same gate as
 * /api/dev/last-email — MUST stay disabled in production.
 */
export const POST = handle(async () => {
  if (env.DEV_EMAIL_OUTBOX_ENABLED !== "1") return fail(404, "NOT_FOUND", "Not found");
  return ok(await runAlertEngine(prisma));
});

import { z } from "zod";
import { handle, fail, ok } from "@/lib/api/http";
import { sendDigestForUser } from "@/lib/alerts/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ userId: z.string().min(1) });

/**
 * Test-only hook: triggers the alert engine's digest job for one user over
 * HTTP. Only registered when E2E_TEST_HOOKS=1 (set solely by playwright.config.ts
 * for the e2e webServer) — 404s otherwise, including in real production. Exists
 * because the alert engine imports "next/server" transitively, which Playwright's
 * plain Node loader can't resolve, so e2e specs can't import it directly.
 */
export const POST = handle(async (req) => {
  if (process.env.E2E_TEST_HOOKS !== "1") return fail(404, "NOT_FOUND", "Not found");
  const { userId } = bodySchema.parse(await req.json());
  return ok(await sendDigestForUser(userId));
});

import { z } from "zod";
import { handle, ok, fail, parseQuery } from "@/lib/api/http";
import { env } from "@/lib/env";
import { readLastDevEmail } from "@/lib/email/transport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ to: z.string().email().optional() });

/**
 * Dev/e2e-only: reads the local email outbox so tests can "click" a magic link
 * without a real inbox. MUST stay disabled in production — gated by an explicit
 * env flag (not NODE_ENV, since `next start` always reports NODE_ENV=production
 * even for local/e2e runs). Never set DEV_EMAIL_OUTBOX_ENABLED in a real deploy.
 */
export const GET = handle(async (req) => {
  if (env.DEV_EMAIL_OUTBOX_ENABLED !== "1") {
    return fail(404, "NOT_FOUND", "Not found");
  }
  const { to } = parseQuery(req.url, schema);
  const email = await readLastDevEmail(to);
  if (!email) return fail(404, "NOT_FOUND", "No email found");
  return ok(email);
});

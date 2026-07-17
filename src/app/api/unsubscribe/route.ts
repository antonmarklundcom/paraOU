import { z } from "zod";
import { handle, ok, fail, parseQuery } from "@/lib/api/http";
import { prisma } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ token: z.string() });

async function unsubscribe(token: string) {
  const userId = verifyUnsubscribeToken(token);
  if (!userId) return fail(400, "INVALID_TOKEN", "Invalid or expired unsubscribe link");
  await prisma.user.update({ where: { id: userId }, data: { alertFrequency: "NONE" } });
  return ok({ unsubscribed: true });
}

// One-click List-Unsubscribe (RFC 8058) posts here without a page load.
export const POST = handle(async (req) => {
  const { token } = parseQuery(req.url, schema);
  return unsubscribe(token);
});

// Also support a plain link click from the email body.
export const GET = handle(async (req) => {
  const { token } = parseQuery(req.url, schema);
  return unsubscribe(token);
});

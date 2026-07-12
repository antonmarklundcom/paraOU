import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, ok } from "@/lib/api/http";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  subject: z.enum(["summary", "match"]),
  tenderId: z.string().max(64).optional(),
  profileId: z.string().max(64).optional(),
  helpful: z.boolean(),
  comment: z.string().trim().max(1000).optional(),
});

/** Thumbs up/down on AI output (docs/04 feedback loop); reviewed on /admin/ai. */
export const POST = handle(async (req) => {
  enforcePublicRateLimit(req);
  const body = bodySchema.parse(await req.json());
  await prisma.aiFeedback.create({ data: body });
  return ok({ saved: true });
});

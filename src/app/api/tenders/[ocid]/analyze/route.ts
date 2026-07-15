import type { Plan } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { analyzeTenderDocument, DocumentAnalysisError } from "@/lib/ai/documentAnalysis";
import { ApiError, handle, ok } from "@/lib/api/http";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";
import { aiConfigured } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ERROR_STATUS: Record<string, number> = {
  PLAN_LIMIT: 403,
  NO_DOCUMENTS: 404,
  QUOTA_EXCEEDED: 429,
  AI_BUDGET_EXCEEDED: 503,
  TOO_LARGE: 413,
  FETCH_FAILED: 502,
  PARSE_FAILED: 502,
};

/** "Analizar pliego" — Business tier, gated + quota'd (PHASE-6 #4). */
export const POST = handle<{ ocid: string }>(async (req, ctx) => {
  enforcePublicRateLimit(req);
  if (!aiConfigured()) {
    throw new ApiError(503, "AI_NOT_CONFIGURED", "AI provider is not configured");
  }
  const session = await auth();
  if (!session?.user?.id) throw new ApiError(401, "UNAUTHENTICATED", "Sign in required");

  const { ocid } = await ctx.params;
  const tender = await prisma.tender.findUnique({ where: { ocid }, select: { id: true } });
  if (!tender) throw new ApiError(404, "NOT_FOUND", `Tender ${ocid} not found`);

  try {
    const result = await analyzeTenderDocument(
      session.user.id,
      session.user.plan as Plan,
      tender.id,
    );
    return ok(result);
  } catch (err) {
    if (err instanceof DocumentAnalysisError) {
      throw new ApiError(ERROR_STATUS[err.code] ?? 500, err.code, err.message);
    }
    throw err;
  }
});

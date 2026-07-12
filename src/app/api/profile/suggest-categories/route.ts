import { z } from "zod";
import { getAiProvider } from "@/lib/ai/provider";
import { budgetExceeded } from "@/lib/ai/usage";
import { ApiError, handle, ok } from "@/lib/api/http";
import { getFilterOptions } from "@/lib/api/meta";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";
import { aiConfigured } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ description: z.string().trim().min(10).max(2000) });

/**
 * Wizard step 2 helper (docs/05 §4): one cheap-model call suggesting category codes
 * from the free-text description. User-triggered single action, budget-gated.
 */
export const POST = handle(async (req) => {
  enforcePublicRateLimit(req);
  if (!aiConfigured()) {
    throw new ApiError(503, "AI_NOT_CONFIGURED", "AI provider is not configured");
  }
  if (await budgetExceeded()) {
    throw new ApiError(503, "AI_BUDGET_EXCEEDED", "Daily AI budget reached, try tomorrow");
  }
  const { description } = bodySchema.parse(await req.json());
  const { categories } = await getFilterOptions();
  const options = categories
    .filter((c: { code: string | null; name: string | null }) => c.code && c.name)
    .map((c: { code: string | null; name: string | null }) => ({
      code: c.code as string,
      name: c.name as string,
    }));
  const codes = await getAiProvider().suggestCategories(description, options);
  return ok({ categoryCodes: codes });
});

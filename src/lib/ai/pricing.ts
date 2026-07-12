/**
 * Per-model price estimates in USD per 1M tokens, used for the `AiUsage.estCostUsd`
 * log and the daily budget kill switch (docs/04 cost guardrails).
 *
 * ESTIMATES from Google's published price sheet (paid tier, standard mode) as of
 * 2026-07 — the sandbox proxy blocks ai.google.dev, so these could not be
 * re-verified live at build time. They only need to be roughly right: the budget
 * check is a safety ceiling, not billing. Verify against
 * https://ai.google.dev/gemini-api/docs/pricing before production (README checklist).
 */
type ModelPrice = { inputPerM: number; outputPerM: number };

const PRICES: Record<string, ModelPrice> = {
  "gemini-2.5-flash-lite": { inputPerM: 0.1, outputPerM: 0.4 },
  "gemini-2.5-flash": { inputPerM: 0.3, outputPerM: 2.5 },
  "gemini-2.5-pro": { inputPerM: 1.25, outputPerM: 10 },
  "gemini-embedding-001": { inputPerM: 0.15, outputPerM: 0 },
};

// For models not in the table (e.g. env-overridden ids we haven't priced), assume
// the most expensive known model so the kill switch errs toward pausing early.
const FALLBACK: ModelPrice = { inputPerM: 1.25, outputPerM: 10 };

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model] ?? FALLBACK;
  return (inputTokens * p.inputPerM + outputTokens * p.outputPerM) / 1_000_000;
}

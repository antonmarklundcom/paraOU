import { prisma } from "./db.js";
import { env } from "./env.js";
import { cached } from "./api/cache.js";

/**
 * Currency handling (docs/03, CLAUDE.md rule 5). Tender amounts are stored in PYG.
 * USD filter input is converted to PYG using the latest daily ExchangeRate row, or
 * the env fallback (DEFAULT_PYG_PER_USD) when the table is empty.
 */

const RATE_TTL_MS = 60 * 60 * 1000; // 1h

export async function getPygPerUsd(): Promise<number> {
  return cached("pyg_per_usd", RATE_TTL_MS, async () => {
    const latest = await prisma.exchangeRate.findFirst({ orderBy: { date: "desc" } });
    return latest ? Number(latest.pygPerUsd) : env.DEFAULT_PYG_PER_USD;
  });
}

/** Convert an amount in `currency` to PYG (for comparing against stored PYG values). */
export async function toPyg(amount: number, currency: "PYG" | "USD"): Promise<number> {
  if (currency === "PYG") return amount;
  const rate = await getPygPerUsd();
  return amount * rate;
}

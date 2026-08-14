import "dotenv/config";
import { env, dncpConfigured } from "../src/lib/env.js";
import { logger } from "../src/lib/log.js";
import { TokenManager } from "../src/lib/dncp/auth.js";
import { RateLimiter } from "../src/lib/dncp/rateLimit.js";
import { runCapture, type EndpointOutcome } from "../src/lib/dncp/capture.js";

/**
 * `npm run capture:dncp` — one-command reconciliation capture (PHASE-1 step 2).
 *
 * With real DNCP credentials in `.env`, this hits the live Swagger/OpenAPI doc plus
 * every endpoint `DncpClient` calls, saving each raw response verbatim so
 * `src/lib/dncp/ocds.ts` / `planning.ts` can be checked against reality. It never
 * hand-rolls fetch or auth: requests go through the same `TokenManager` and
 * `RateLimiter` production code uses (see `createDncpClientFromEnv`).
 *
 * Usage:
 *   npm run capture:dncp
 *   npm run capture:dncp -- --limit=5
 *   npm run capture:dncp -- --only=swagger
 */

interface CliOptions {
  limit: number;
  only?: string;
}

function parseArgs(argv: string[]): CliOptions {
  let limit = 3;
  let only: string | undefined;
  for (const arg of argv) {
    if (arg.startsWith("--limit=")) {
      const n = Number(arg.slice("--limit=".length));
      if (Number.isFinite(n) && n > 0) limit = n;
    } else if (arg.startsWith("--only=")) {
      only = arg.slice("--only=".length);
    }
  }
  return { limit, only };
}

function printSummary(outcomes: EndpointOutcome[]): void {
  console.log("\nDNCP live capture summary\n");
  const rows = outcomes.map((o) => ({
    endpoint: o.name,
    status: String(o.status),
    zod: o.zod,
    "zod error path(s)": o.zodIssues?.join(", ") ?? "",
    savedTo: o.savedTo ?? "",
  }));
  console.table(rows);
}

async function main(): Promise<void> {
  if (!dncpConfigured()) {
    console.error(
      [
        "DNCP credentials are missing — capture:dncp talks to the live API only and",
        "never falls back to fixtures. Set the following in .env (see .env.example):",
        "  DNCP_CONSUMER_KEY",
        "  DNCP_CONSUMER_SECRET",
        "  DNCP_REQUEST_TOKEN",
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  const { limit, only } = parseArgs(process.argv.slice(2));

  const tokenManager = new TokenManager({
    tokenUrl: env.DNCP_TOKEN_URL,
    invalidateUrl: env.DNCP_INVALIDATE_URL,
    requestToken: env.DNCP_REQUEST_TOKEN!,
  });
  const rateLimiter = new RateLimiter({
    requestsPerSecond: env.DNCP_MAX_REQUESTS_PER_SECOND,
    maxRequestsPerWindow: env.DNCP_MAX_REQUESTS_PER_WINDOW,
  });

  const result = await runCapture({
    apiBase: env.DNCP_API_BASE,
    tokenManager,
    rateLimiter,
    requestToken: env.DNCP_REQUEST_TOKEN,
    limit,
    only,
    logger,
  });

  printSummary(result.outcomes);

  if (result.hasFailures) {
    console.error("\nOne or more endpoints returned 4xx/5xx or failed the network request.");
    process.exitCode = 1;
  } else {
    console.log("\nAll endpoints captured successfully.");
  }
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, "capture:dncp failed");
  process.exitCode = 1;
});

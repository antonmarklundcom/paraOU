import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { TokenManager } from "../auth.js";
import { RateLimiter } from "../rateLimit.js";
import { runCapture } from "../capture.js";

const REQUEST_TOKEN = "super-secret-request-token";
const API_BASE = "https://api.example/v3";

function tokenManager() {
  const impl = (async () =>
    new Response(JSON.stringify({ access_token: "tok-1", expires_in: 900 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
  return new TokenManager({
    tokenUrl: "https://x/token",
    requestToken: REQUEST_TOKEN,
    fetchImpl: impl,
  });
}

function instantLimiter() {
  return new RateLimiter({
    requestsPerSecond: 1000,
    burst: 1000,
    maxRequestsPerWindow: 1_000_000,
    sleep: async () => {},
  });
}

function textResponse(body: string, status = 200, contentType = "application/json") {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

const validReleasePackage = {
  uri: "https://example/releases",
  releases: [
    { ocid: "ocds-03ad3f-1", tender: { title: "Uno" } },
    { ocid: "ocds-03ad3f-2", tender: { title: "Dos" } },
  ],
};

const validRecordPackage = {
  uri: "https://example/record",
  records: [{ ocid: "ocds-03ad3f-1", compiledRelease: { ocid: "ocds-03ad3f-1" } }],
};

const validPlanificaciones = {
  planificaciones: [{ id: 1, nombre: "Plan A" }],
};

/** Routes a stub fetch by URL substring so each test only wires up what it needs. */
function routedFetch(routes: Record<string, () => Response>, calls: string[] = []) {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    for (const [key, handler] of Object.entries(routes)) {
      if (url.includes(key)) return handler();
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("runCapture", () => {
  let fixturesDir: string;
  let docsDir: string;

  beforeEach(async () => {
    const base = await mkdtemp(path.join(tmpdir(), "capture-dncp-"));
    fixturesDir = path.join(base, "fixtures");
    docsDir = path.join(base, "docs");
  });

  afterEach(async () => {
    await rm(path.dirname(fixturesDir), { recursive: true, force: true });
  });

  it("captures the swagger spec, search-releases, record-package (bounded by limit) and planificaciones", async () => {
    const calls: string[] = [];
    const fetchImpl = routedFetch(
      {
        "/doc/swagger.json": () => textResponse(JSON.stringify({ openapi: "3.0.0" })),
        "/doc/": () => textResponse("<html>no spec ref here</html>", 200, "text/html"),
        "ocds/record/": () => textResponse(JSON.stringify(validRecordPackage)),
        "ocds/releases": () => textResponse(JSON.stringify(validReleasePackage)),
        planificaciones: () => textResponse(JSON.stringify(validPlanificaciones)),
      },
      calls,
    );

    const result = await runCapture({
      apiBase: API_BASE,
      tokenManager: tokenManager(),
      rateLimiter: instantLimiter(),
      requestToken: REQUEST_TOKEN,
      fetchImpl,
      limit: 2,
      fixturesDir,
      docsDir,
      now: () => new Date("2026-08-14T00:00:00Z"),
    });

    expect(result.hasFailures).toBe(false);
    const names = result.outcomes.map((o) => o.name);
    expect(names).toEqual([
      "swagger",
      "search-releases",
      "record-package[ocds-03ad3f-1]",
      "record-package[ocds-03ad3f-2]",
      "planificaciones",
    ]);
    for (const outcome of result.outcomes) {
      expect(outcome.ok).toBe(true);
      expect(outcome.zod === "n/a" || outcome.zod === "accepted").toBe(true);
    }

    const swagger = await readFile(path.join(docsDir, "dncp-v3-swagger.json"), "utf8");
    expect(JSON.parse(swagger)).toEqual({ openapi: "3.0.0" });

    const releases = await readFile(path.join(fixturesDir, "search-releases.json"), "utf8");
    expect(JSON.parse(releases)).toEqual(validReleasePackage);

    const record1 = await readFile(
      path.join(fixturesDir, "record-package-ocds-03ad3f-1.json"),
      "utf8",
    );
    expect(JSON.parse(record1)).toEqual(validRecordPackage);

    // limit=2 caps how many record-package calls happen even though it's cheap to fetch more.
    expect(calls.filter((u) => u.includes("ocds/record/")).length).toBe(2);
  });

  it("reports a rejected zod validation with the error path list, and still saves the raw body", async () => {
    const malformed = { releases: "not-an-array" };
    const fetchImpl = routedFetch({
      "ocds/releases": () => textResponse(JSON.stringify(malformed)),
    });

    const result = await runCapture({
      apiBase: API_BASE,
      tokenManager: tokenManager(),
      rateLimiter: instantLimiter(),
      requestToken: REQUEST_TOKEN,
      fetchImpl,
      only: "search-releases",
      fixturesDir,
      docsDir,
    });

    const outcome = result.outcomes[0]!;
    expect(outcome.zod).toBe("rejected");
    expect(outcome.zodIssues).toEqual(["releases"]);
    expect(outcome.savedTo).toBeTruthy();
    const saved = await readFile(outcome.savedTo!, "utf8");
    expect(JSON.parse(saved)).toEqual(malformed);
  });

  it("marks HTTP 4xx/5xx as a failure but still writes the captured body", async () => {
    const fetchImpl = routedFetch({
      "ocds/releases": () => textResponse(JSON.stringify({ error: "forbidden" }), 403),
    });

    const result = await runCapture({
      apiBase: API_BASE,
      tokenManager: tokenManager(),
      rateLimiter: instantLimiter(),
      only: "search-releases",
      fetchImpl,
      fixturesDir,
      docsDir,
    });

    expect(result.hasFailures).toBe(true);
    const outcome = result.outcomes[0]!;
    expect(outcome.status).toBe(403);
    expect(outcome.ok).toBe(false);
    expect(outcome.savedTo).toBeTruthy();
  });

  it("redacts the request token if it appears in a response body", async () => {
    const fetchImpl = routedFetch({
      "ocds/releases": () =>
        textResponse(
          JSON.stringify({ releases: [], note: `token was ${REQUEST_TOKEN} in this test` }),
        ),
    });

    const result = await runCapture({
      apiBase: API_BASE,
      tokenManager: tokenManager(),
      rateLimiter: instantLimiter(),
      requestToken: REQUEST_TOKEN,
      only: "search-releases",
      fetchImpl,
      fixturesDir,
      docsDir,
    });

    const saved = await readFile(result.outcomes[0]!.savedTo!, "utf8");
    expect(saved).not.toContain(REQUEST_TOKEN);
    expect(saved).toContain("[REDACTED_REQUEST_TOKEN]");
  });

  it("respects --only and skips every other endpoint", async () => {
    const fetchImpl = routedFetch({
      "/doc/": () => textResponse("<html></html>", 200, "text/html"),
      "/doc/swagger.json": () => textResponse(JSON.stringify({ openapi: "3.0.0" })),
    });

    const result = await runCapture({
      apiBase: API_BASE,
      tokenManager: tokenManager(),
      rateLimiter: instantLimiter(),
      only: "swagger",
      fetchImpl,
      fixturesDir,
      docsDir,
    });

    expect(result.outcomes.map((o) => o.name)).toEqual(["swagger"]);
  });

  it("is safe to re-run: a second capture overwrites the same files without erroring", async () => {
    const fetchImpl = routedFetch({
      "ocds/releases": () => textResponse(JSON.stringify(validReleasePackage)),
    });

    const config = {
      apiBase: API_BASE,
      tokenManager: tokenManager(),
      rateLimiter: instantLimiter(),
      only: "search-releases",
      fetchImpl,
      fixturesDir,
      docsDir,
    };

    await runCapture(config);
    const second = await runCapture(config);
    expect(second.hasFailures).toBe(false);
    const saved = await readFile(second.outcomes[0]!.savedTo!, "utf8");
    expect(JSON.parse(saved)).toEqual(validReleasePackage);
  });
});

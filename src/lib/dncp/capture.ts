import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ZodType } from "zod";
import { TokenManager } from "./auth.js";
import { RateLimiter } from "./rateLimit.js";
import { logger as rootLogger, type Logger } from "../log.js";
import { releasePackageSchema, recordPackageSchema } from "./ocds.js";
import { planificacionPackageSchema } from "./planning.js";

/**
 * Live-capture tool logic (`scripts/capture-dncp.ts`, `npm run capture:dncp`).
 *
 * Hits the same endpoints `DncpClient` calls, plus the Swagger/OpenAPI doc, and
 * saves every raw response body verbatim so the client (docs/01, ocds.ts,
 * planning.ts) can be reconciled against the real V3 API once credentials exist
 * (PHASE-1 step 2). Auth and throttling go through the same `TokenManager` /
 * `RateLimiter` classes `createDncpClientFromEnv` uses — this module never calls
 * `fetch` without going through them first.
 */

const ENDPOINT_NAMES = ["swagger", "search-releases", "record-package", "planificaciones"] as const;
export type EndpointName = (typeof ENDPOINT_NAMES)[number];

export interface CaptureConfig {
  apiBase: string;
  tokenManager: TokenManager;
  rateLimiter: RateLimiter;
  /** Only redacted from saved bodies if provided — never logged, never printed. */
  requestToken?: string;
  fetchImpl?: typeof fetch;
  logger?: Logger;
  /** Max record packages to fetch (and rough record count target). Default 3. */
  limit?: number;
  /** Restrict the run to a single endpoint name. */
  only?: string;
  fixturesDir?: string;
  docsDir?: string;
  now?: () => Date;
}

export interface EndpointOutcome {
  name: string;
  url: string;
  status: number | "network-error";
  ok: boolean;
  zod: "n/a" | "accepted" | "rejected";
  zodIssues?: string[];
  savedTo?: string;
}

export interface CaptureResult {
  outcomes: EndpointOutcome[];
  hasFailures: boolean;
}

interface RawResponse {
  status: number | "network-error";
  text: string;
  contentType: string;
}

function isFailure(status: number | "network-error"): boolean {
  return status === "network-error" || status >= 400;
}

function sanitizeForFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function buildUrl(apiBase: string, path_: string, query?: Record<string, string | number>): string {
  const url = new URL(`${apiBase.replace(/\/$/, "")}/${path_.replace(/^\//, "")}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function validate<T>(
  schema: ZodType<T>,
  text: string,
): { zod: "accepted" | "rejected"; zodIssues?: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { zod: "rejected", zodIssues: ["response body is not valid JSON"] };
  }
  const result = schema.safeParse(parsed);
  if (result.success) return { zod: "accepted" };
  return {
    zod: "rejected",
    zodIssues: result.error.issues.map((issue) => issue.path.join(".") || "(root)"),
  };
}

export async function runCapture(config: CaptureConfig): Promise<CaptureResult> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const log = config.logger ?? rootLogger;
  const limit = config.limit && config.limit > 0 ? config.limit : 3;
  const only = config.only;
  const now = config.now ?? (() => new Date());
  const fixturesDir =
    config.fixturesDir ?? path.join(process.cwd(), "src/lib/dncp/__fixtures__/live");
  const docsDir = config.docsDir ?? path.join(process.cwd(), "docs/reference");

  if (only && !(ENDPOINT_NAMES as readonly string[]).includes(only)) {
    throw new Error(
      `Unknown --only value "${only}". Expected one of: ${ENDPOINT_NAMES.join(", ")}`,
    );
  }

  await mkdir(fixturesDir, { recursive: true });
  await mkdir(docsDir, { recursive: true });

  const outcomes: EndpointOutcome[] = [];

  async function authedGet(url: string): Promise<RawResponse> {
    let refreshedOn401 = false;
    for (;;) {
      await config.rateLimiter.acquire();
      const token = await config.tokenManager.getToken();
      let res: Response;
      try {
        res = await fetchImpl(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
      } catch (err) {
        log.warn(
          { url, err: err instanceof Error ? err.message : String(err) },
          "DNCP capture request failed",
        );
        return { status: "network-error", text: "", contentType: "" };
      }
      if (res.status === 401 && !refreshedOn401) {
        refreshedOn401 = true;
        config.tokenManager.invalidate();
        await config.tokenManager.getToken(true);
        continue;
      }
      const text = await res.text();
      return { status: res.status, text, contentType: res.headers.get("content-type") ?? "" };
    }
  }

  function redact(text: string): string {
    if (!config.requestToken) return text;
    return text.split(config.requestToken).join("[REDACTED_REQUEST_TOKEN]");
  }

  async function saveFixture(name: string, text: string): Promise<string> {
    const file = path.join(fixturesDir, `${name}.json`);
    await writeFile(file, redact(text), "utf8");
    return file;
  }

  function shouldRun(name: EndpointName): boolean {
    return !only || only === name;
  }

  // ── 1) Swagger / OpenAPI spec ─────────────────────────────────────────────
  if (shouldRun("swagger")) {
    outcomes.push(await captureSwagger(authedGet, config.apiBase, docsDir, redact));
  }

  // ── 2) search-releases (also the ocid source for record-package below) ────
  let releaseOcids: string[] = [];
  if (shouldRun("search-releases") || shouldRun("record-package")) {
    const dateTo = now();
    const dateFrom = new Date(dateTo.getTime() - 30 * 24 * 60 * 60 * 1000);
    const url = buildUrl(config.apiBase, "ocds/releases", {
      fecha_desde: isoDate(dateFrom),
      fecha_hasta: isoDate(dateTo),
    });
    const res = await authedGet(url);
    const outcome: EndpointOutcome = {
      name: "search-releases",
      url,
      status: res.status,
      ok: !isFailure(res.status),
      zod: "n/a",
    };
    if (res.status !== "network-error") {
      const v = validate(releasePackageSchema, res.text);
      outcome.zod = v.zod;
      outcome.zodIssues = v.zodIssues;
      outcome.savedTo = await saveFixture("search-releases", res.text);
      if (v.zod === "accepted") {
        try {
          const parsed = releasePackageSchema.parse(JSON.parse(res.text));
          releaseOcids = parsed.releases
            .map((r) => r.ocid)
            .filter(Boolean)
            .slice(0, limit);
        } catch {
          // already validated above — should not happen, but never fail capture for it.
        }
      }
    }
    if (shouldRun("search-releases")) outcomes.push(outcome);
  }

  // ── 3) record-package, one call per ocid found above (bounded by --limit) ──
  if (shouldRun("record-package")) {
    if (releaseOcids.length === 0) {
      outcomes.push({
        name: "record-package",
        url: "",
        status: "network-error",
        ok: false,
        zod: "n/a",
        zodIssues: [
          "no ocid available — search-releases returned no releases in the last 30 days (widen the window or check credentials)",
        ],
      });
    } else {
      for (const ocid of releaseOcids) {
        const url = buildUrl(config.apiBase, `ocds/record/${encodeURIComponent(ocid)}`);
        const res = await authedGet(url);
        const outcome: EndpointOutcome = {
          name: `record-package[${ocid}]`,
          url,
          status: res.status,
          ok: !isFailure(res.status),
          zod: "n/a",
        };
        if (res.status !== "network-error") {
          const v = validate(recordPackageSchema, res.text);
          outcome.zod = v.zod;
          outcome.zodIssues = v.zodIssues;
          outcome.savedTo = await saveFixture(
            `record-package-${sanitizeForFilename(ocid)}`,
            res.text,
          );
        }
        outcomes.push(outcome);
      }
    }
  }

  // ── 4) planificaciones ──────────────────────────────────────────────────
  if (shouldRun("planificaciones")) {
    const url = buildUrl(config.apiBase, "planificaciones", { anio: now().getFullYear() });
    const res = await authedGet(url);
    const outcome: EndpointOutcome = {
      name: "planificaciones",
      url,
      status: res.status,
      ok: !isFailure(res.status),
      zod: "n/a",
    };
    if (res.status !== "network-error") {
      const v = validate(planificacionPackageSchema, res.text);
      outcome.zod = v.zod;
      outcome.zodIssues = v.zodIssues;
      outcome.savedTo = await saveFixture("planificaciones", res.text);
    }
    outcomes.push(outcome);
  }

  const hasFailures = outcomes.some((o) => isFailure(o.status));
  return { outcomes, hasFailures };
}

async function captureSwagger(
  authedGet: (url: string) => Promise<RawResponse>,
  apiBase: string,
  docsDir: string,
  redact: (text: string) => string,
): Promise<EndpointOutcome> {
  const docPageUrl = `${apiBase.replace(/\/$/, "")}/doc/`;
  const candidates: string[] = [];

  const page = await authedGet(docPageUrl);
  if (page.status !== "network-error" && page.status < 400) {
    // Typical swagger-ui pages embed `url: "<spec>.json"` in their bootstrap script.
    const match = page.text.match(/url\s*:\s*["']([^"']+\.(?:json|ya?ml))["']/i);
    const specRef = match?.[1];
    if (specRef) {
      try {
        candidates.push(new URL(specRef, docPageUrl).toString());
      } catch {
        // malformed reference in the HTML — fall through to the fixed candidates below.
      }
    }
  }
  candidates.push(
    `${apiBase.replace(/\/$/, "")}/doc/swagger.json`,
    `${apiBase.replace(/\/$/, "")}/doc.json`,
    `${apiBase.replace(/\/$/, "")}/openapi.json`,
    `${apiBase.replace(/\/$/, "")}/doc/main.json`,
  );

  let lastAttempt: { url: string; status: number | "network-error" } = {
    url: docPageUrl,
    status: page.status,
  };

  for (const url of candidates) {
    const res = await authedGet(url);
    lastAttempt = { url, status: res.status };
    if (
      res.status !== "network-error" &&
      res.status >= 200 &&
      res.status < 300 &&
      res.text.trim().length > 0
    ) {
      const ext = looksLikeJson(res.text) || res.contentType.includes("json") ? "json" : "yaml";
      const file = path.join(docsDir, `dncp-v3-swagger.${ext}`);
      await writeFile(file, redact(res.text), "utf8");
      return { name: "swagger", url, status: res.status, ok: true, zod: "n/a", savedTo: file };
    }
  }

  return {
    name: "swagger",
    url: lastAttempt.url,
    status: lastAttempt.status,
    ok: false,
    zod: "n/a",
    zodIssues: [
      "could not locate the swagger/OpenAPI spec JSON or YAML at any known path — inspect the doc page manually and update the candidate list",
    ],
  };
}

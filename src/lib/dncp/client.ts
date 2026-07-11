import type { ZodType } from "zod";
import { env, dncpConfigured } from "../env.js";
import { logger as rootLogger, type Logger } from "../log.js";
import { TokenManager } from "./auth.js";
import { RateLimiter } from "./rateLimit.js";
import {
  recordPackageSchema,
  releasePackageSchema,
  type OcdsRecordPackage,
  type OcdsReleasePackage,
} from "./ocds.js";

export interface DncpClientOptions {
  apiBase: string;
  tokenManager: TokenManager;
  rateLimiter: RateLimiter;
  fetchImpl?: typeof fetch;
  logger?: Logger;
  maxRetries?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class DncpApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "DncpApiError";
  }
}

/**
 * Typed DNCP HTTP client: rate-limited, auto-authenticated, retrying on 429/5xx with
 * exponential backoff, refreshing the token once on 401, and validating every
 * response body with zod (docs/01; PHASE-1 step 3).
 *
 * ⚠️ The OCDS endpoint paths/params below are modelled from OCDS + DNCP V2 and MUST
 * be confirmed against the live V3 Swagger (PHASE-1 step 2 / docs/06 risk T1).
 */
export class DncpClient {
  private readonly apiBase: string;
  private readonly tokens: TokenManager;
  private readonly limiter: RateLimiter;
  private readonly fetchImpl: typeof fetch;
  private readonly log: Logger;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: DncpClientOptions) {
    this.apiBase = options.apiBase.replace(/\/$/, "");
    this.tokens = options.tokenManager;
    this.limiter = options.rateLimiter;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.log = options.logger ?? rootLogger;
    this.maxRetries = options.maxRetries ?? 4;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.sleep = options.sleep ?? defaultSleep;
  }

  /** GET a JSON endpoint and validate it against `schema`. */
  async get<T>(
    path: string,
    schema: ZodType<T>,
    query?: Record<string, string | number>,
  ): Promise<T> {
    const url = this.buildUrl(path, query);
    const raw = await this.requestWithRetries(url);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new DncpApiError(
        `DNCP response failed validation for ${path}: ${parsed.error.message}`,
        200,
      );
    }
    return parsed.data;
  }

  private buildUrl(path: string, query?: Record<string, string | number>): string {
    const url = new URL(
      path.startsWith("http") ? path : `${this.apiBase}/${path.replace(/^\//, "")}`,
    );
    if (query) {
      for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
    }
    return url.toString();
  }

  private async requestWithRetries(url: string): Promise<unknown> {
    let attempt = 0;
    let refreshedOn401 = false;

    for (;;) {
      await this.limiter.acquire();
      const token = await this.tokens.getToken();

      let res: Response;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        res = await this.fetchImpl(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (attempt < this.maxRetries) {
          await this.backoff(attempt++);
          continue;
        }
        throw new DncpApiError(`DNCP request failed: ${(err as Error).message}`, 0);
      }
      clearTimeout(timer);

      if (res.status === 401 && !refreshedOn401) {
        // Token likely expired mid-flight — force one refresh and retry immediately.
        refreshedOn401 = true;
        this.tokens.invalidate();
        await this.tokens.getToken(true);
        continue;
      }

      if (res.status === 429 || res.status >= 500) {
        if (attempt < this.maxRetries) {
          this.log.warn({ url, status: res.status, attempt }, "DNCP retryable error, backing off");
          await this.backoff(attempt++, res);
          continue;
        }
        const body = await safeText(res);
        throw new DncpApiError(`DNCP ${res.status} after retries`, res.status, body);
      }

      if (!res.ok) {
        const body = await safeText(res);
        throw new DncpApiError(`DNCP ${res.status} ${res.statusText}`, res.status, body);
      }

      return res.json();
    }
  }

  private async backoff(attempt: number, res?: Response): Promise<void> {
    const retryAfter = res?.headers.get("retry-after");
    if (retryAfter) {
      const secs = Number(retryAfter);
      if (Number.isFinite(secs)) {
        await this.sleep(secs * 1000);
        return;
      }
    }
    // Exponential backoff with jitter: 2s, 4s, 8s, 16s …
    const base = 2 ** attempt * 1000;
    const jitter = Math.floor(Math.random() * 500);
    await this.sleep(base + jitter);
  }

  // ── OCDS endpoints (verify paths against live Swagger, PHASE-1 step 2) ──────────

  /**
   * Search OCDS releases modified within a date range. DNCP's `buscadores`/OCDS
   * search is used for incremental sync (docs/01). Returns a release package.
   */
  async searchReleases(params: {
    dateFrom?: string;
    dateTo?: string;
    page?: number;
  }): Promise<OcdsReleasePackage> {
    const query: Record<string, string | number> = {};
    if (params.dateFrom) query.fecha_desde = params.dateFrom;
    if (params.dateTo) query.fecha_hasta = params.dateTo;
    if (params.page) query.page = params.page;
    return this.get("ocds/releases", releasePackageSchema, query);
  }

  /** Fetch the OCDS record package (full lifecycle) for one process by ocid. */
  async getRecordPackage(ocid: string): Promise<OcdsRecordPackage> {
    return this.get(`ocds/record/${encodeURIComponent(ocid)}`, recordPackageSchema);
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "";
  }
}

/**
 * Build a client from validated env, or return null when DNCP secrets are absent
 * (fixtures mode — see dncpConfigured()).
 */
export function createDncpClientFromEnv(logger?: Logger): DncpClient | null {
  if (!dncpConfigured()) return null;
  const tokenManager = new TokenManager({
    tokenUrl: env.DNCP_TOKEN_URL,
    invalidateUrl: env.DNCP_INVALIDATE_URL,
    requestToken: env.DNCP_REQUEST_TOKEN!,
  });
  const rateLimiter = new RateLimiter({
    requestsPerSecond: env.DNCP_MAX_REQUESTS_PER_SECOND,
    maxRequestsPerWindow: env.DNCP_MAX_REQUESTS_PER_WINDOW,
  });
  return new DncpClient({ apiBase: env.DNCP_API_BASE, tokenManager, rateLimiter, logger });
}

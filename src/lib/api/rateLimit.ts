import { ApiError } from "./http.js";
import { env } from "../env.js";

/**
 * Simple in-memory fixed-window rate limiter keyed by client IP (docs Phase 2:
 * protect the free tier from scraping). One process, no Redis (docs/02) — good
 * enough for a single Node instance; swap for a shared store if we ever scale out.
 */

interface Window {
  count: number;
  resetAt: number;
}

export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns remaining allowance, or throws ApiError(429) when exhausted. */
  check(key: string): { remaining: number; resetAt: number } {
    const now = this.now();
    let win = this.windows.get(key);
    if (!win || now >= win.resetAt) {
      win = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, win);
    }
    win.count += 1;
    if (win.count > this.limit) {
      const retryAfter = Math.ceil((win.resetAt - now) / 1000);
      throw new ApiError(429, "RATE_LIMITED", "Too many requests, slow down", { retryAfter });
    }
    return { remaining: this.limit - win.count, resetAt: win.resetAt };
  }

  /** Drop expired windows so the map doesn't grow unbounded. */
  sweep(): void {
    const now = this.now();
    for (const [key, win] of this.windows) {
      if (now >= win.resetAt) this.windows.delete(key);
    }
  }

  reset(): void {
    this.windows.clear();
  }
}

/** Best-effort client IP from proxy headers (Hostinger/Caddy set X-Forwarded-For). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// Process-wide limiter for public endpoints.
const publicLimiter = new FixedWindowRateLimiter(env.API_RATE_LIMIT_PER_MIN);

// Periodically sweep in long-running processes (skip in tests/serverless).
if (env.NODE_ENV === "production") {
  setInterval(() => publicLimiter.sweep(), 60_000).unref?.();
}

/** Enforce the per-IP budget for a public request; throws ApiError(429) if exceeded. */
export function enforcePublicRateLimit(req: Request): void {
  publicLimiter.check(clientIp(req));
}

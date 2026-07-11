/**
 * Token-bucket rate limiter for DNCP calls (docs/01: 5,000 req / 15 min hard cap —
 * we stay well under with a per-second bucket AND a rolling 15-minute window budget).
 *
 * `acquire()` resolves as soon as a slot is free, otherwise it waits. Both the clock
 * and the sleep function are injectable for deterministic tests (PHASE-1 acceptance:
 * "rate limiter").
 */

export interface RateLimiterOptions {
  /** Sustained requests per second (bucket refill rate). Default 3. */
  requestsPerSecond?: number;
  /** Max burst (bucket capacity). Default = requestsPerSecond. */
  burst?: number;
  /** Hard budget of requests per rolling 15-minute window. Default 3000. */
  maxRequestsPerWindow?: number;
  /** Window length in ms. Default 15 min. */
  windowMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class RateLimiter {
  private readonly ratePerMs: number;
  private readonly capacity: number;
  private readonly maxPerWindow: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  private tokens: number;
  private lastRefill: number;
  /** Timestamps of requests within the current rolling window. */
  private windowHits: number[] = [];
  /** Serializes waiters so they wake in order and don't all grab the same slot. */
  private chain: Promise<void> = Promise.resolve();

  constructor(options: RateLimiterOptions = {}) {
    const rps = options.requestsPerSecond ?? 3;
    this.ratePerMs = rps / 1000;
    this.capacity = options.burst ?? rps;
    this.maxPerWindow = options.maxRequestsPerWindow ?? 3000;
    this.windowMs = options.windowMs ?? 15 * 60 * 1000;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
    this.tokens = this.capacity;
    this.lastRefill = this.now();
  }

  /** Wait until a request slot is available, then consume it. */
  async acquire(): Promise<void> {
    // Serialize acquisitions to keep the bucket math correct under concurrency.
    const run = this.chain.then(() => this.acquireInternal());
    // Swallow rejections on the chain so one failure doesn't poison later waiters.
    this.chain = run.catch(() => undefined);
    return run;
  }

  private refill(): void {
    const now = this.now();
    const elapsed = now - this.lastRefill;
    if (elapsed > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.ratePerMs);
      this.lastRefill = now;
    }
  }

  private pruneWindow(): void {
    const cutoff = this.now() - this.windowMs;
    this.windowHits = this.windowHits.filter((t) => t > cutoff);
  }

  private async acquireInternal(): Promise<void> {
    // 1) Respect the rolling 15-minute budget.
    for (;;) {
      this.pruneWindow();
      if (this.windowHits.length < this.maxPerWindow) break;
      const oldest = this.windowHits[0]!;
      const waitMs = oldest + this.windowMs - this.now();
      await this.sleep(Math.max(waitMs, 0));
    }

    // 2) Respect the per-second token bucket.
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        this.windowHits.push(this.now());
        return;
      }
      const needed = 1 - this.tokens;
      const waitMs = Math.ceil(needed / this.ratePerMs);
      await this.sleep(waitMs);
    }
  }
}

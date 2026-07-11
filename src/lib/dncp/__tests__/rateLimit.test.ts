import { describe, it, expect } from "vitest";
import { RateLimiter } from "../rateLimit.js";

/** Virtual clock: sleep advances `now` so waits are deterministic and instant. */
function virtualClock() {
  let now = 0;
  const slept: number[] = [];
  return {
    now: () => now,
    sleep: async (ms: number) => {
      slept.push(ms);
      now += ms;
    },
    get slept() {
      return slept;
    },
    totalSlept() {
      return slept.reduce((a, b) => a + b, 0);
    },
  };
}

describe("RateLimiter", () => {
  it("allows a burst up to capacity then throttles to the refill rate", async () => {
    const clock = virtualClock();
    const rl = new RateLimiter({
      requestsPerSecond: 2,
      burst: 2,
      maxRequestsPerWindow: 1_000_000,
      now: clock.now,
      sleep: clock.sleep,
    });

    await rl.acquire();
    await rl.acquire();
    expect(clock.totalSlept()).toBe(0); // burst of 2, no waiting

    await rl.acquire(); // 3rd needs one token at 2/s → ~500ms
    expect(clock.totalSlept()).toBeGreaterThanOrEqual(500);
    expect(clock.totalSlept()).toBeLessThan(600);
  });

  it("enforces the rolling window budget", async () => {
    const clock = virtualClock();
    const rl = new RateLimiter({
      requestsPerSecond: 1000, // bucket effectively unlimited
      burst: 1000,
      maxRequestsPerWindow: 3,
      windowMs: 1000,
      now: clock.now,
      sleep: clock.sleep,
    });

    await rl.acquire();
    await rl.acquire();
    await rl.acquire();
    expect(clock.totalSlept()).toBe(0);

    await rl.acquire(); // 4th must wait for the window to roll
    expect(clock.totalSlept()).toBeGreaterThanOrEqual(1000);
  });

  it("serializes concurrent acquisitions without over-issuing tokens", async () => {
    const clock = virtualClock();
    const rl = new RateLimiter({
      requestsPerSecond: 5,
      burst: 5,
      maxRequestsPerWindow: 1_000_000,
      now: clock.now,
      sleep: clock.sleep,
    });

    // 10 concurrent acquires: 5 burst free, 5 more throttled at 5/s (200ms each).
    await Promise.all(Array.from({ length: 10 }, () => rl.acquire()));
    expect(clock.totalSlept()).toBeGreaterThanOrEqual(1000);
  });
});

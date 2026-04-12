import { describe, it, expect } from "vitest";
import { RateLimiter } from "../src/utils/rate-limiter";

describe("RateLimiter", () => {
  it("creates with a given rate", () => {
    const limiter = new RateLimiter(10);
    expect(limiter).toBeDefined();
  });

  it("wait() resolves", async () => {
    const limiter = new RateLimiter(1000); // fast for testing
    await expect(limiter.wait()).resolves.toBeUndefined();
  });

  it("enforces minimum interval between calls", async () => {
    const limiter = new RateLimiter(10); // 100ms interval
    const start = Date.now();
    await limiter.wait();
    await limiter.wait();
    const elapsed = Date.now() - start;
    // Should take at least ~100ms for the second call
    expect(elapsed).toBeGreaterThanOrEqual(80); // allow some timing slop
  });
});

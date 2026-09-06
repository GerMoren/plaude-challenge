import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, __resetRateLimits } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => __resetRateLimits());

  it("allows requests up to the limit", () => {
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit("1.2.3.4", 1000).allowed).toBe(true);
    }
  });

  it("blocks the request after the limit and reports a retry delay", () => {
    for (let i = 0; i < 10; i++) checkRateLimit("1.2.3.4", 1000);

    const blocked = checkRateLimit("1.2.3.4", 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks clients independently", () => {
    for (let i = 0; i < 10; i++) checkRateLimit("1.2.3.4", 1000);
    expect(checkRateLimit("5.6.7.8", 1000).allowed).toBe(true);
  });

  it("resets once the window rolls over", () => {
    for (let i = 0; i < 10; i++) checkRateLimit("1.2.3.4", 1000);
    expect(checkRateLimit("1.2.3.4", 1000).allowed).toBe(false);
    expect(checkRateLimit("1.2.3.4", 1000 + 60_001).allowed).toBe(true);
  });
});

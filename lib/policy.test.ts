import { describe, it, expect } from "vitest";
import { refundRequiresApproval, highValueRequiresApproval } from "./policy";

describe("refundRequiresApproval", () => {
  it("clears a small refund on a clean-enough history", () => {
    expect(refundRequiresApproval({ amountUsd: 30, refundsInWindow: 1 })).toEqual({
      requiresApproval: false,
    });
  });

  it("escalates once the amount reaches the ceiling", () => {
    const verdict = refundRequiresApproval({ amountUsd: 100, refundsInWindow: 0 });
    expect(verdict.requiresApproval).toBe(true);
    expect(verdict).toHaveProperty("reason", expect.stringContaining("$100"));
  });

  it("escalates on refund frequency even when the amount is small", () => {
    const verdict = refundRequiresApproval({ amountUsd: 5, refundsInWindow: 2 });
    expect(verdict.requiresApproval).toBe(true);
    expect(verdict).toHaveProperty("reason", expect.stringContaining("30 days"));
  });

  it("treats the amount ceiling as inclusive and the one below it as clear", () => {
    expect(refundRequiresApproval({ amountUsd: 99.99, refundsInWindow: 0 }).requiresApproval).toBe(false);
    expect(refundRequiresApproval({ amountUsd: 100, refundsInWindow: 0 }).requiresApproval).toBe(true);
  });
});

describe("highValueRequiresApproval", () => {
  it("always escalates at or above the threshold", () => {
    expect(highValueRequiresApproval({ amountUsd: 1000 }).requiresApproval).toBe(true);
    expect(highValueRequiresApproval({ amountUsd: 5000 }).requiresApproval).toBe(true);
  });

  it("leaves smaller operations alone", () => {
    expect(highValueRequiresApproval({ amountUsd: 999 })).toEqual({ requiresApproval: false });
  });
});

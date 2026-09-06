import { describe, it, expect, beforeAll } from "vitest";
import { signApproval, verifyApproval } from "./approval-receipt";

beforeAll(() => {
  process.env.APPROVAL_SIGNING_SECRET = "test-approval-secret";
});

const now = 1_788_700_000_000;

describe("approval receipts", () => {
  it("accepts a fresh receipt for the amount it was minted for", () => {
    const receipt = signApproval({ toolCallId: "call_1", amountUsd: 500, issuedAt: now });
    expect(verifyApproval(receipt, { toolCallId: "call_1", amountUsd: 500, now })).toEqual({
      valid: true,
    });
  });

  it("rejects a missing receipt — the default must be 'no'", () => {
    expect(verifyApproval(undefined, { amountUsd: 500, now }).valid).toBe(false);
  });

  it("cannot be forged by inventing a payload", () => {
    const forged = `${Buffer.from(
      JSON.stringify({ toolCallId: "call_1", amountUsd: 500, issuedAt: now }),
    ).toString("base64url")}.not-a-real-signature`;

    expect(verifyApproval(forged, { amountUsd: 500, now })).toEqual({
      valid: false,
      reason: expect.stringContaining("signature"),
    });
  });

  it("cannot be spent on a larger amount than it approved", () => {
    const receipt = signApproval({ toolCallId: "call_1", amountUsd: 50, issuedAt: now });
    expect(verifyApproval(receipt, { amountUsd: 500, now })).toEqual({
      valid: false,
      reason: expect.stringContaining("$50"),
    });
  });

  it("cannot be replayed onto a different request", () => {
    const receipt = signApproval({ toolCallId: "call_1", amountUsd: 50, issuedAt: now });
    expect(verifyApproval(receipt, { toolCallId: "call_2", amountUsd: 50, now })).toEqual({
      valid: false,
      reason: expect.stringContaining("different request"),
    });
  });

  it("expires", () => {
    const receipt = signApproval({ toolCallId: "call_1", amountUsd: 50, issuedAt: now });
    const muchLater = now + 16 * 60 * 1000;
    expect(verifyApproval(receipt, { amountUsd: 50, now: muchLater })).toEqual({
      valid: false,
      reason: expect.stringContaining("expired"),
    });
  });

  it("rejects a receipt signed with someone else's secret", () => {
    const receipt = signApproval({ toolCallId: "call_1", amountUsd: 50, issuedAt: now });
    process.env.APPROVAL_SIGNING_SECRET = "a-different-secret";
    const result = verifyApproval(receipt, { amountUsd: 50, now });
    process.env.APPROVAL_SIGNING_SECRET = "test-approval-secret";
    expect(result.valid).toBe(false);
  });
});

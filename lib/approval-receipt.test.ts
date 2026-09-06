import { describe, it, expect, beforeAll } from "vitest";
import { signApproval, verifyApproval } from "./approval-receipt";

beforeAll(() => {
  process.env.APPROVAL_SIGNING_SECRET = "test-approval-secret";
});

const now = 1_788_700_000_000;
const refund = { toolCallId: "call_1", scenario: "refund", amountUsd: 500, orderId: "42" };

describe("approval receipts", () => {
  it("accepts a fresh receipt for the request it was minted for", () => {
    const receipt = signApproval({ ...refund, issuedAt: now });
    expect(
      verifyApproval(receipt, { scenario: "refund", amountUsd: 500, orderId: "42", now }),
    ).toEqual({ valid: true });
  });

  it("rejects a missing receipt — the default must be 'no'", () => {
    expect(verifyApproval(undefined, { scenario: "refund", amountUsd: 500, now }).valid).toBe(false);
  });

  it("cannot be forged by inventing a payload", () => {
    const forged = `${Buffer.from(JSON.stringify({ ...refund, issuedAt: now })).toString(
      "base64url",
    )}.not-a-real-signature`;

    expect(verifyApproval(forged, { scenario: "refund", amountUsd: 500, now })).toEqual({
      valid: false,
      reason: expect.stringContaining("signature"),
    });
  });

  it("cannot be spent on a larger amount than it approved", () => {
    const receipt = signApproval({ ...refund, amountUsd: 50, issuedAt: now });
    expect(verifyApproval(receipt, { scenario: "refund", amountUsd: 500, now })).toEqual({
      valid: false,
      reason: expect.stringContaining("$50"),
    });
  });

  it("cannot be spent on a different order", () => {
    // Otherwise one approval covers every order that happens to cost the same.
    const receipt = signApproval({ ...refund, issuedAt: now });
    expect(
      verifyApproval(receipt, { scenario: "refund", amountUsd: 500, orderId: "1", now }),
    ).toEqual({ valid: false, reason: expect.stringContaining("different order") });
  });

  it("cannot be carried across policies", () => {
    // $900 clears the high-value rule on its own but needs a signature as a
    // refund. Without this check the agent could mint itself one.
    const receipt = signApproval({
      toolCallId: "call_1",
      scenario: "high-value-operation",
      amountUsd: 900,
      issuedAt: now,
    });

    expect(verifyApproval(receipt, { scenario: "refund", amountUsd: 900, now })).toEqual({
      valid: false,
      reason: expect.stringContaining("different kind of request"),
    });
  });

  it("expires", () => {
    const receipt = signApproval({ ...refund, issuedAt: now });
    expect(
      verifyApproval(receipt, {
        scenario: "refund",
        amountUsd: 500,
        orderId: "42",
        now: now + 16 * 60 * 1000,
      }),
    ).toEqual({ valid: false, reason: expect.stringContaining("expired") });
  });

  it("rejects a receipt signed with someone else's secret", () => {
    const receipt = signApproval({ ...refund, issuedAt: now });
    process.env.APPROVAL_SIGNING_SECRET = "a-different-secret";
    const result = verifyApproval(receipt, { scenario: "refund", amountUsd: 500, now });
    process.env.APPROVAL_SIGNING_SECRET = "test-approval-secret";
    expect(result.valid).toBe(false);
  });
});

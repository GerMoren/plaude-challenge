import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { agentTools } from "./index";
import { __resetStore, getOrder, countRecentRefunds, DEMO_CUSTOMER_ID } from "@/lib/data/store";
import { signApproval } from "@/lib/approval-receipt";

// The function that actually moves money. Everything here is about what it
// refuses to do.
const issueRefund = agentTools.issueRefund.execute;

beforeAll(() => {
  process.env.APPROVAL_SIGNING_SECRET = "test-approval-secret";
});

beforeEach(() => __resetStore());

describe("issueRefund", () => {
  it("issues a refund the policy clears on its own", async () => {
    const result = await issueRefund({ orderId: "42", amountUsd: 30, reason: "damaged" });

    expect(result.issued).toBe(true);
    expect(getOrder("42")?.status).toBe("refunded");
  });

  it("refuses an amount larger than the order", async () => {
    // Order 42 is $78. A customer insisting they paid $500 does not make it so.
    const result = await issueRefund({ orderId: "42", amountUsd: 500, reason: "that's what I paid" });

    expect(result.issued).toBe(false);
    expect(result).toHaveProperty("reason", expect.stringContaining("$78"));
    expect(getOrder("42")?.status).toBe("delivered");
  });

  it("refuses an order that isn't this customer's", async () => {
    const result = await issueRefund({ orderId: "777", amountUsd: 10, reason: "wrong account" });
    expect(result.issued).toBe(false);
  });

  it("refuses an unknown order", async () => {
    const result = await issueRefund({ orderId: "does-not-exist", amountUsd: 10, reason: "x" });
    expect(result.issued).toBe(false);
  });

  it("refuses to refund the same order twice", async () => {
    await issueRefund({ orderId: "42", amountUsd: 30, reason: "damaged" });
    const second = await issueRefund({ orderId: "42", amountUsd: 30, reason: "again" });

    expect(second.issued).toBe(false);
    expect(second).toHaveProperty("reason", expect.stringContaining("already refunded"));
  });

  it("refuses a refund that needs approval when none is presented", async () => {
    // $480 is over the ceiling, so it needs a signature it doesn't have.
    const result = await issueRefund({ orderId: "1", amountUsd: 480, reason: "cancelled plan" });

    expect(result.issued).toBe(false);
    expect(getOrder("1")?.status).toBe("delivered");
  });

  it("cannot be talked into moving money with a forged receipt", async () => {
    const result = await issueRefund({
      orderId: "1",
      amountUsd: 480,
      reason: "cancelled plan",
      approvalReceipt: "totally.legitimate",
    });

    expect(result.issued).toBe(false);
    expect(getOrder("1")?.status).toBe("delivered");
  });

  it("refuses a genuine receipt issued for a smaller amount", async () => {
    const receipt = signApproval({ toolCallId: "call_1", amountUsd: 100, issuedAt: Date.now() });
    const result = await issueRefund({
      orderId: "1",
      amountUsd: 480,
      reason: "cancelled plan",
      approvalReceipt: receipt,
    });

    expect(result.issued).toBe(false);
    expect(getOrder("1")?.status).toBe("delivered");
  });

  it("issues the refund once a valid receipt for that amount is presented", async () => {
    const receipt = signApproval({ toolCallId: "call_1", amountUsd: 480, issuedAt: Date.now() });
    const result = await issueRefund({
      orderId: "1",
      amountUsd: 480,
      reason: "cancelled plan",
      approvalReceipt: receipt,
    });

    expect(result.issued).toBe(true);
    expect(getOrder("1")?.status).toBe("refunded");
    expect(countRecentRefunds(DEMO_CUSTOMER_ID, 30)).toBe(2);
  });
});

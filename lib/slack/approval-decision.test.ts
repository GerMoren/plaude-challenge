import { describe, it, expect } from "vitest";
import {
  APPROVAL_REASON_ACTION_ID,
  APPROVAL_REASON_BLOCK_ID,
  extractApprovalReason,
  formatDecisionComment,
  formatDecisionMessage,
} from "./approval-decision";

function stateWith(value: string | undefined) {
  return {
    values: { [APPROVAL_REASON_BLOCK_ID]: { [APPROVAL_REASON_ACTION_ID]: { value } } },
  };
}

describe("extractApprovalReason", () => {
  it("reads what the reviewer typed", () => {
    expect(extractApprovalReason(stateWith("vendor is already onboarded"))).toBe(
      "vendor is already onboarded",
    );
  });

  it("treats an empty or whitespace-only reason as no reason", () => {
    expect(extractApprovalReason(stateWith(""))).toBeUndefined();
    expect(extractApprovalReason(stateWith("   "))).toBeUndefined();
    expect(extractApprovalReason(stateWith(undefined))).toBeUndefined();
  });

  it("survives a payload with no modal state at all", () => {
    expect(extractApprovalReason(undefined)).toBeUndefined();
    expect(extractApprovalReason({})).toBeUndefined();
  });
});

describe("formatDecisionMessage", () => {
  it("names the reviewer and their reason", () => {
    expect(formatDecisionMessage({ approved: true, reviewer: "ana", reason: "checked the invoice" })).toBe(
      "Approved by ana: checked the invoice",
    );
    expect(formatDecisionMessage({ approved: false, reviewer: "ana", reason: "unknown vendor" })).toBe(
      "Rejected by ana: unknown vendor",
    );
  });

  it("still reads cleanly when no reason was given", () => {
    expect(formatDecisionMessage({ approved: true, reviewer: "ana" })).toBe("Approved by ana.");
    expect(formatDecisionMessage({ approved: false, reviewer: "ana" })).toBe("Rejected by ana.");
  });
});

describe("formatDecisionComment", () => {
  it("passes the reviewer's reason through to the agent", () => {
    expect(formatDecisionComment({ reviewer: "ana", reason: "unknown vendor" })).toBe(
      "via Slack by ana — unknown vendor",
    );
  });

  it("attributes the decision even with no reason", () => {
    expect(formatDecisionComment({ reviewer: "ana" })).toBe("via Slack by ana");
  });
});

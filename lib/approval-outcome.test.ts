import { describe, it, expect } from "vitest";
import { classifyApprovalOutcome, approvalComment } from "./approval-outcome";

describe("classifyApprovalOutcome", () => {
  it("is pending until the tool returns something", () => {
    expect(classifyApprovalOutcome(undefined)).toBe("pending");
  });

  it("reads the reviewer's decision off the result", () => {
    expect(classifyApprovalOutcome({ approved: true, comment: "vendor checks out" })).toBe("approved");
    expect(classifyApprovalOutcome({ approved: false, comment: "unknown vendor" })).toBe("rejected");
  });

  it("does not report a delivery failure as a rejection", () => {
    // Regression: a failed Slack post once surfaced to the customer as
    // "Rejected by reviewer" — a human decision that never happened.
    expect(classifyApprovalOutcome({ fatal: true, name: "FatalError" })).toBe("unavailable");
    expect(classifyApprovalOutcome("Slack chat.postMessage failed: invalid_auth")).toBe("unavailable");
  });

  it("treats an errored tool call as unavailable even with a decision present", () => {
    expect(classifyApprovalOutcome({ approved: true }, true)).toBe("unavailable");
  });
});

describe("approvalComment", () => {
  it("returns the reviewer's note", () => {
    expect(approvalComment({ approved: false, comment: "unknown vendor" })).toBe("unknown vendor");
  });

  it("ignores an empty or missing note", () => {
    expect(approvalComment({ approved: true, comment: "   " })).toBeUndefined();
    expect(approvalComment({ approved: true })).toBeUndefined();
    expect(approvalComment(undefined)).toBeUndefined();
  });
});

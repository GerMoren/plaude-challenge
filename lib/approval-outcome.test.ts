import { describe, it, expect } from "vitest";
import { classifyApprovalOutcome } from "./approval-outcome";

describe("classifyApprovalOutcome", () => {
  it("is pending until the tool returns something", () => {
    expect(classifyApprovalOutcome(undefined)).toBe("pending");
  });

  it("reads the reviewer's actual decision", () => {
    expect(classifyApprovalOutcome("Approved by human reviewer - note: looks fine")).toBe("approved");
    expect(classifyApprovalOutcome("Rejected by human reviewer: not authorized")).toBe("rejected");
  });

  it("does not report a delivery failure as a rejection", () => {
    // Regression: a failed Slack post once surfaced to the customer as
    // "Rejected by reviewer" — a human decision that never happened.
    expect(classifyApprovalOutcome('{"fatal":true,"name":"FatalError"}')).toBe("unavailable");
    expect(classifyApprovalOutcome("Slack chat.postMessage failed: invalid_auth")).toBe("unavailable");
  });

  it("treats an errored tool call as unavailable even with text present", () => {
    expect(classifyApprovalOutcome("Approved by human reviewer", true)).toBe("unavailable");
  });

  it("ignores casing and surrounding whitespace", () => {
    expect(classifyApprovalOutcome("  APPROVED BY HUMAN REVIEWER.  ")).toBe("approved");
  });
});

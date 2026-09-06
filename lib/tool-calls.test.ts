import { describe, it, expect } from "vitest";
import { selectToolCallOwners } from "./tool-calls";

describe("selectToolCallOwners", () => {
  it("renders a pending tool call in the message that carries it", () => {
    const owners = selectToolCallOwners([
      { id: "m1", parts: [{ type: "tool-requestHumanApproval", toolCallId: "c1" }] },
    ]);
    expect(owners.get("c1")).toBe("m1");
  });

  it("prefers the resolved copy when a resumed run replays the call", () => {
    // Regression: the pending card and the resolved card both rendered, so the
    // customer saw the same approval request twice.
    const owners = selectToolCallOwners([
      { id: "m1", parts: [{ type: "tool-requestHumanApproval", toolCallId: "c1" }] },
      { id: "m2", parts: [{ type: "tool-requestHumanApproval", toolCallId: "c1", output: "Approved by human reviewer" }] },
    ]);
    expect(owners.get("c1")).toBe("m2");
    expect(owners.size).toBe(1);
  });

  it("keeps distinct tool calls separate", () => {
    const owners = selectToolCallOwners([
      { id: "m1", parts: [{ type: "tool-requestHumanApproval", toolCallId: "c1", output: "Approved by human reviewer" }] },
      { id: "m2", parts: [{ type: "tool-requestHumanApproval", toolCallId: "c2" }] },
    ]);
    expect(owners.get("c1")).toBe("m1");
    expect(owners.get("c2")).toBe("m2");
  });

  it("ignores text parts and messages without parts", () => {
    const owners = selectToolCallOwners([
      { id: "m1", parts: [{ type: "text" }] },
      { id: "m2" },
    ]);
    expect(owners.size).toBe(0);
  });
});

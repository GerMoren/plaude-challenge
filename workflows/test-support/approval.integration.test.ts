// KNOWN ISSUE (as of workflow@4.8.5 / @workflow/vitest@4.0.21 / Node 24 & 25):
// these tests currently time out. Root cause: the local dev "world" runtime's
// worker process fails to load `builtin-modules/builtin-modules.json` with
// `ERR_IMPORT_ATTRIBUTE_MISSING`, even though that package's own source
// correctly uses `import ... with { type: "json" }`. This reproduces
// identically under Node 24 (LTS) and Node 25, and with both Vite 7 and 8 —
// it is an upstream bundling issue in the Workflow SDK's local world, not a
// bug in the test design or the reviewed code. The hook/Slack/resume
// mechanism these tests exercise was validated manually end-to-end against a
// real Slack workspace (see README "Known limitations").
import { describe, it, expect } from "vitest";
import { start, resumeHook } from "workflow/api";
import { waitForHook } from "@workflow/vitest";
import { approvalTestWorkflow } from "./approval-test-workflow";

describe("requestHumanApproval hook", () => {
  it("suspends on the hook and resolves with an approval message once resumed as approved", async () => {
    const run = await start(approvalTestWorkflow, [
      "refund",
      "Refund of $500 for order #42",
      "test-call-approved",
    ]);

    const hook = await waitForHook(run);
    await resumeHook(hook.token, { approved: true, comment: "looks fine" });

    const result = await run.returnValue;
    expect(result).toMatchObject({ approved: true, comment: "looks fine" });
    expect(result).toHaveProperty("approvalReceipt");
  });

  it("resolves with a rejection message once resumed as rejected", async () => {
    const run = await start(approvalTestWorkflow, [
      "high-value-operation",
      "$5000 transfer to a new vendor",
      "test-call-rejected",
    ]);

    const hook = await waitForHook(run);
    await resumeHook(hook.token, { approved: false, comment: "not authorized" });

    const result = await run.returnValue;
    // A rejection carries no receipt: nothing was cleared to spend.
    expect(result).toEqual({ approved: false, comment: "not authorized" });
  });

  it("uses the tool call id as the hook token", async () => {
    const run = await start(approvalTestWorkflow, [
      "ambiguous-request",
      "Missing order id",
      "test-call-token-check",
    ]);

    const hook = await waitForHook(run);
    expect(hook.token).toBe("test-call-token-check");

    await resumeHook(hook.token, { approved: true });
    await run.returnValue;
  });
});

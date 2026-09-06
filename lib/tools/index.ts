import { z } from "zod";
import { approvalHook } from "@/lib/hooks/approval-hook";
import { sendSlackApprovalRequest } from "@/lib/slack/client";

async function executeRequestHumanApproval(
  { scenario, summary }: { scenario: string; summary: string },
  { toolCallId }: { toolCallId: string }
) {
  // No "use step" here - hooks are workflow-level primitives.
  await sendSlackApprovalRequest({ token: toolCallId, scenario, summary });

  const hook = approvalHook.create({ token: toolCallId });
  const { approved, comment } = await hook;

  if (!approved) {
    return `Rejected by human reviewer${comment ? `: ${comment}` : "."}`;
  }
  return `Approved by human reviewer${comment ? ` - note: ${comment}` : "."}`;
}

export const agentTools = {
  requestHumanApproval: {
    description:
      "Pause and ask a human reviewer in Slack to approve or reject an action, per the plain-text policy (refunds, high-value operations, ambiguous requests).",
    inputSchema: z.object({
      scenario: z
        .string()
        .describe("One of: refund, high-value-operation, ambiguous-request"),
      summary: z
        .string()
        .describe("Everything the human reviewer needs to decide: amounts, reasons, history, the specific question."),
    }),
    execute: executeRequestHumanApproval,
  },
};

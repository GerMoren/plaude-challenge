import { agentTools } from "@/lib/tools";

export async function approvalTestWorkflow(
  scenario: string,
  summary: string,
  toolCallId: string,
  amountUsd = 5000,
) {
  "use workflow";

  return agentTools.requestHumanApproval.execute(
    { scenario, summary, amountUsd },
    { toolCallId },
  );
}

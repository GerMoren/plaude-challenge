import { agentTools } from "@/lib/tools";

export async function approvalTestWorkflow(
  scenario: string,
  summary: string,
  toolCallId: string,
) {
  "use workflow";

  return agentTools.requestHumanApproval.execute(
    { scenario, summary },
    { toolCallId },
  );
}

export const APPROVAL_REASON_BLOCK_ID = "approval_reason_block";
export const APPROVAL_REASON_ACTION_ID = "approval_reason_input";

type ModalState = { values?: Record<string, Record<string, { value?: string }>> };

/** Pulls the optional reason out of a Slack modal submission. */
export function extractApprovalReason(state: ModalState | undefined): string | undefined {
  const raw = state?.values?.[APPROVAL_REASON_BLOCK_ID]?.[APPROVAL_REASON_ACTION_ID]?.value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

/** What the reviewer sees in place of the buttons once a decision is recorded. */
export function formatDecisionMessage({
  approved,
  reviewer,
  reason,
}: {
  approved: boolean;
  reviewer: string;
  reason?: string;
}): string {
  const decision = approved ? "Approved" : "Rejected";
  return reason ? `${decision} by ${reviewer}: ${reason}` : `${decision} by ${reviewer}.`;
}

/** What the agent receives as the reviewer's answer. */
export function formatDecisionComment({
  reviewer,
  reason,
}: {
  reviewer: string;
  reason?: string;
}): string {
  return reason ? `via Slack by ${reviewer} — ${reason}` : `via Slack by ${reviewer}`;
}

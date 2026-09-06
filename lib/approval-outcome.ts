export type ApprovalOutcome = "pending" | "approved" | "rejected" | "unavailable";

/**
 * Only the exact strings requestHumanApproval returns count as a decision.
 * Anything else — an error payload, a truncated result, a future refactor of the
 * tool's wording — is "unavailable", never a rejection. Rendering a failed Slack
 * post as "Rejected by reviewer" would tell a customer a human turned them down
 * when no human ever saw the request.
 */
export function classifyApprovalOutcome(output?: string, errored?: boolean): ApprovalOutcome {
  if (errored) return "unavailable";
  if (!output) return "pending";

  const normalized = output.trim().toLowerCase();
  if (normalized.startsWith("approved by human reviewer")) return "approved";
  if (normalized.startsWith("rejected by human reviewer")) return "rejected";
  return "unavailable";
}

export type ApprovalOutcome = "pending" | "approved" | "rejected" | "unavailable";

type ApprovalToolOutput = { approved?: unknown; comment?: unknown };

/**
 * `requestHumanApproval` returns a typed object, so the UI reads a field rather
 * than parsing English. Anything that isn't a recognisable decision — an error
 * payload, a half-written result — is "unavailable", never a rejection:
 * failing to reach a reviewer must not be shown to a customer as a human
 * turning them down.
 */
export function classifyApprovalOutcome(output?: unknown, errored?: boolean): ApprovalOutcome {
  if (errored) return "unavailable";
  if (output === undefined || output === null) return "pending";

  if (typeof output === "object") {
    const approved = (output as ApprovalToolOutput).approved;
    if (approved === true) return "approved";
    if (approved === false) return "rejected";
  }

  return "unavailable";
}

/** The reviewer's note, when there is one worth showing. */
export function approvalComment(output?: unknown): string | undefined {
  if (!output || typeof output !== "object") return undefined;
  const comment = (output as ApprovalToolOutput).comment;
  return typeof comment === "string" && comment.trim() ? comment.trim() : undefined;
}

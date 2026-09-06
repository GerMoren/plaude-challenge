type PartLike = { type?: string; toolCallId?: string; output?: unknown };
type MessageLike = { id: string; parts?: readonly PartLike[] };

/**
 * A resumed run can replay the same tool call across more than one message —
 * once while it's still pending, again once it resolves. Rendering both leaves
 * the customer looking at a request that appears to have been made twice.
 *
 * Returns, for each toolCallId, the id of the single message that should render
 * it: the one holding the resolved version when there is one, otherwise the
 * first occurrence.
 */
export function selectToolCallOwners(messages: readonly MessageLike[]): Map<string, string> {
  const owners = new Map<string, string>();

  for (const message of messages) {
    for (const part of message.parts ?? []) {
      const id = part.toolCallId;
      if (!id || !part.type?.startsWith("tool-")) continue;

      const hasOutput = part.output !== undefined;

      if (hasOutput) {
        // The resolved version always wins, and a later one supersedes an earlier.
        owners.set(id, message.id);
        continue;
      }

      if (!owners.has(id)) owners.set(id, message.id);
    }
  }

  return owners;
}

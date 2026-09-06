import type { UIMessage } from "ai";

const MAX_TEXT_LENGTH = 4000;

/**
 * The browser sends the whole conversation back on every turn, so anything in it
 * is attacker-controlled. Keeping only user/assistant text parts means a client
 * cannot replay a forged tool result (e.g. "Approved by human reviewer") into the
 * model's context and talk its way past the approval policy.
 */
export function sanitizeClientMessages(messages: unknown[]): UIMessage[] {
  const clean: UIMessage[] = [];

  for (const raw of messages) {
    if (!raw || typeof raw !== "object") continue;
    const message = raw as { id?: unknown; role?: unknown; parts?: unknown };

    if (message.role !== "user" && message.role !== "assistant") continue;
    if (!Array.isArray(message.parts)) continue;

    const parts = message.parts
      .filter(
        (part): part is { type: "text"; text: string } =>
          !!part &&
          typeof part === "object" &&
          (part as { type?: unknown }).type === "text" &&
          typeof (part as { text?: unknown }).text === "string",
      )
      .map((part) => ({ type: "text" as const, text: part.text.slice(0, MAX_TEXT_LENGTH) }));

    if (parts.length === 0) continue;

    clean.push({
      id: typeof message.id === "string" ? message.id : crypto.randomUUID(),
      role: message.role,
      parts,
    } as UIMessage);
  }

  return clean;
}

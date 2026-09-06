type LogLevel = "info" | "error";

function emit(level: LogLevel, event: Record<string, unknown>) {
  const line = {
    level,
    timestamp: new Date().toISOString(),
    service: "plaude-challenge",
    ...event,
  };
  const write = level === "error" ? console.error : console.log;
  write(JSON.stringify(line));
}

export const logger = {
  info: (event: Record<string, unknown>) => emit("info", event),
  error: (event: Record<string, unknown>) => emit("error", event),
};

// Approval tokens double as bearer credentials (see lib/hooks/approval-hook.ts) —
// never write the full value to logs, only enough to correlate related log lines.
export function redactToken(token: string) {
  return token.length <= 8 ? "***" : `${token.slice(0, 8)}…`;
}

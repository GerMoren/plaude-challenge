import type { UIMessage } from "ai";
import { convertToModelMessages, createUIMessageStreamResponse } from "ai";
import { start } from "workflow/api";
import { agentWorkflow } from "@/workflows/agent-workflow";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitizeClientMessages } from "@/lib/messages";

const MAX_MESSAGES = 50;

export async function POST(req: Request) {
  const startedAt = Date.now();
  const event: Record<string, unknown> = { route: "POST /api/agent" };

  const clientId =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rate = checkRateLimit(clientId);
  if (!rate.allowed) {
    event.outcome = "rate_limited";
    event.status_code = 429;
    event.duration_ms = Date.now() - startedAt;
    logger.error(event);
    return Response.json(
      { error: "Too many requests. Try again in a moment." },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } },
    );
  }

  let messages: UIMessage[];
  try {
    const body = await req.json();
    if (!Array.isArray(body?.messages)) {
      event.outcome = "invalid_body";
      event.status_code = 400;
      event.duration_ms = Date.now() - startedAt;
      logger.error(event);
      return Response.json(
        { error: "Invalid request body: 'messages' must be an array" },
        { status: 400 },
      );
    }
    if (body.messages.length > MAX_MESSAGES) {
      event.outcome = "too_many_messages";
      event.status_code = 400;
      event.duration_ms = Date.now() - startedAt;
      logger.error(event);
      return Response.json({ error: "Conversation is too long." }, { status: 400 });
    }
    // The client controls this array, so it could otherwise forge tool results
    // (e.g. a fabricated "Approved by human reviewer") straight into context.
    messages = sanitizeClientMessages(body.messages);
    event.message_count = messages.length;
  } catch (error) {
    event.outcome = "invalid_json";
    event.status_code = 400;
    event.error = error instanceof Error ? error.message : String(error);
    event.duration_ms = Date.now() - startedAt;
    logger.error(event);
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const modelMessages = await convertToModelMessages(messages);
    const run = await start(agentWorkflow, [modelMessages]);

    event.outcome = "started";
    event.status_code = 200;
    event.run_id = run.runId;
    event.duration_ms = Date.now() - startedAt;
    logger.info(event);

    return createUIMessageStreamResponse({
      stream: run.readable,
      // Lets the client reconnect to this run's stream after a refresh or a
      // dropped connection (see WorkflowChatTransport in app/page.tsx).
      headers: { "x-workflow-run-id": run.runId },
    });
  } catch (error) {
    event.outcome = "start_failed";
    event.status_code = 500;
    event.error = error instanceof Error ? error.message : String(error);
    event.duration_ms = Date.now() - startedAt;
    logger.error(event);

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to start agent workflow" },
      { status: 500 },
    );
  }
}

import type { UIMessage } from "ai";
import { convertToModelMessages, createUIMessageStreamResponse } from "ai";
import { start } from "workflow/api";
import { agentWorkflow } from "@/workflows/agent-workflow";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  const startedAt = Date.now();
  const event: Record<string, unknown> = { route: "POST /api/agent" };
  let messages: UIMessage[];

  try {
    const body = await req.json();
    if (!Array.isArray(body?.messages)) {
      event.outcome = "invalid_body";
      event.status_code = 400;
      return Response.json(
        { error: "Invalid request body: 'messages' must be an array" },
        { status: 400 },
      );
    }
    messages = body.messages;
    event.message_count = messages.length;
  } catch (error) {
    event.outcome = "invalid_json";
    event.status_code = 400;
    event.error = error instanceof Error ? error.message : String(error);
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  } finally {
    if (event.outcome) {
      event.duration_ms = Date.now() - startedAt;
      logger.error(event);
    }
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

import { createUIMessageStreamResponse } from "ai";
import { getRun } from "workflow/api";
import { logger } from "@/lib/logger";

// Reconnects a client to an already-running (or already-finished) workflow run's
// stream. This is what makes "close the tab, come back later, still get the
// reviewer's decision" work instead of silently losing the run.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const { searchParams } = new URL(request.url);
  const startIndexParam = searchParams.get("startIndex");
  const startIndex = startIndexParam ? Number.parseInt(startIndexParam, 10) : undefined;

  if (startIndexParam && Number.isNaN(startIndex)) {
    return Response.json({ error: "startIndex must be a number" }, { status: 400 });
  }

  try {
    const run = getRun(runId);
    const readable = run.getReadable({ startIndex });
    const tailIndex = await readable.getTailIndex();

    return createUIMessageStreamResponse({
      stream: readable,
      headers: { "x-workflow-stream-tail-index": String(tailIndex) },
    });
  } catch (error) {
    logger.error({
      route: "GET /api/agent/[runId]/stream",
      run_id: runId,
      outcome: "reconnect_failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "Could not reconnect to that run." }, { status: 404 });
  }
}

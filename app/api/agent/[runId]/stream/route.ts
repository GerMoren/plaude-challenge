import { createUIMessageStreamResponse } from "ai";
import { getRun } from "workflow/api";
import { logger } from "@/lib/logger";

// How far back we'll scan for a step boundary before giving up and resuming
// where we were asked to. Bounds the cost of a single very long step.
const LOOKBACK = 200;

/**
 * Reconnects a client to a run's stream — what makes "close the tab while an
 * approval is pending, come back, still get the answer" work.
 *
 * The stream is a flat list of chunks, but the UI protocol groups them into
 * parts (`text-start` … `text-delta` … `text-end`). Resuming at an arbitrary
 * offset can land inside an open part, and the client drops any chunk whose
 * opening it never saw — which silently swallowed the agent's prose while
 * leaving its tool calls intact. So rewind to the last `start-step`: no part is
 * ever open across a step boundary.
 */
async function resolveStartIndex(
  run: ReturnType<typeof getRun>,
  requested: number,
  tailIndex: number,
): Promise<number> {
  if (requested === 0) return 0;

  const target = requested < 0 ? Math.max(0, tailIndex + 1 + requested) : requested;
  if (target === 0) return 0;

  const from = Math.max(0, target - LOOKBACK);
  const probe = run.getReadable({ startIndex: from }) as unknown as AsyncIterable<{
    type: string;
  }>;

  let index = from;
  let lastBoundary = from;
  for await (const chunk of probe) {
    if (index >= target) break;
    if (chunk.type === "start-step") lastBoundary = index;
    index++;
  }

  return lastBoundary;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const { searchParams } = new URL(request.url);
  const startIndexParam = searchParams.get("startIndex");
  const requested = startIndexParam ? Number.parseInt(startIndexParam, 10) : 0;

  if (startIndexParam && Number.isNaN(requested)) {
    return Response.json({ error: "startIndex must be a number" }, { status: 400 });
  }

  try {
    const run = getRun(runId);
    const tailIndex = await run.getReadable().getTailIndex();
    const startIndex = await resolveStartIndex(run, requested, tailIndex);

    return createUIMessageStreamResponse({
      stream: run.getReadable({ startIndex }),
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

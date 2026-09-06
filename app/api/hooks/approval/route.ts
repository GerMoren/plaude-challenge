import { approvalHook } from "@/lib/hooks/approval-hook";
import { z } from "zod";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  token: z.string().min(1),
  approved: z.boolean(),
  comment: z.string().optional(),
});

export async function POST(request: Request) {
  const startedAt = Date.now();
  const event: Record<string, unknown> = { route: "POST /api/hooks/approval" };

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    event.outcome = "invalid_json";
    event.status_code = 400;
    event.error = error instanceof Error ? error.message : String(error);
    event.duration_ms = Date.now() - startedAt;
    logger.error(event);
    return Response.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parseResult = bodySchema.safeParse(body);

  if (!parseResult.success) {
    event.outcome = "invalid_body";
    event.status_code = 400;
    event.duration_ms = Date.now() - startedAt;
    logger.error(event);
    return Response.json(
      { success: false, error: "Invalid request body", details: parseResult.error.flatten() },
      { status: 400 },
    );
  }

  const { token, approved, comment } = parseResult.data;
  event.token = token;
  event.approved = approved;
  event.has_comment = Boolean(comment);

  try {
    await approvalHook.resume(token, { approved, comment });
  } catch (error) {
    event.outcome = "resume_failed";
    event.status_code = 500;
    event.error = error instanceof Error ? error.message : String(error);
    event.duration_ms = Date.now() - startedAt;
    logger.error(event);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to resume approval hook",
      },
      { status: 500 },
    );
  }

  event.outcome = "resumed";
  event.status_code = 200;
  event.duration_ms = Date.now() - startedAt;
  logger.info(event);

  return Response.json({ success: true });
}

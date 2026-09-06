import { approvalHook } from "@/lib/hooks/approval-hook";
import { verifySlackSignature } from "@/lib/slack/verify";
import { APPROVE_ACTION_ID, REJECT_ACTION_ID } from "@/lib/slack/client";
import { logger, redactToken } from "@/lib/logger";

type SlackAction = { action_id?: string; value?: string };
type SlackPayload = {
  type?: string;
  user?: { id?: string; username?: string };
  actions?: SlackAction[];
};

export async function POST(request: Request) {
  const startedAt = Date.now();
  const event: Record<string, unknown> = { route: "POST /api/slack/interactivity" };

  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    event.outcome = "signing_secret_missing";
    event.duration_ms = Date.now() - startedAt;
    logger.error(event);
    return new Response("Slack interactivity is not configured", { status: 503 });
  }

  // The signature covers the exact bytes, so read the body raw before parsing.
  const rawBody = await request.text();
  const verification = verifySlackSignature({
    signingSecret,
    signature: request.headers.get("x-slack-signature"),
    timestamp: request.headers.get("x-slack-request-timestamp"),
    rawBody,
  });

  if (!verification.valid) {
    event.outcome = "invalid_signature";
    event.reason = verification.reason;
    event.duration_ms = Date.now() - startedAt;
    logger.error(event);
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: SlackPayload;
  try {
    const encoded = new URLSearchParams(rawBody).get("payload");
    if (!encoded) throw new Error("missing payload field");
    payload = JSON.parse(encoded);
  } catch (error) {
    event.outcome = "invalid_payload";
    event.error = error instanceof Error ? error.message : String(error);
    event.duration_ms = Date.now() - startedAt;
    logger.error(event);
    return new Response("Invalid payload", { status: 400 });
  }

  const action = payload.actions?.[0];
  const token = action?.value;
  const approved = action?.action_id === APPROVE_ACTION_ID;

  if (!token || (action?.action_id !== APPROVE_ACTION_ID && action?.action_id !== REJECT_ACTION_ID)) {
    event.outcome = "unsupported_action";
    event.action_id = action?.action_id;
    event.duration_ms = Date.now() - startedAt;
    logger.error(event);
    return new Response("Unsupported action", { status: 400 });
  }

  event.token = redactToken(token);
  event.approved = approved;
  event.reviewer = payload.user?.id;

  const reviewer = payload.user?.username ?? payload.user?.id ?? "a reviewer";
  const decision = approved ? "Approved" : "Rejected";

  try {
    await approvalHook.resume(token, { approved, comment: `via Slack by ${reviewer}` });
  } catch (error) {
    event.outcome = "resume_failed";
    event.error = error instanceof Error ? error.message : String(error);
    event.duration_ms = Date.now() - startedAt;
    logger.error(event);
    // Replace the message so the reviewer sees the failure instead of a silent no-op.
    return Response.json({
      replace_original: true,
      text: `:warning: Could not record that decision — the request may have already been resolved.`,
    });
  }

  event.outcome = "resumed";
  event.duration_ms = Date.now() - startedAt;
  logger.info(event);

  // Swapping the buttons out prevents a second click on a resolved approval.
  return Response.json({
    replace_original: true,
    text: `${decision} by ${reviewer}.`,
  });
}

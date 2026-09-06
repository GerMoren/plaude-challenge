import { after } from "next/server";
import { approvalHook } from "@/lib/workflow/approval-hook";
import { verifySlackSignature } from "@/lib/slack/verify";
import {
  APPROVE_ACTION_ID,
  REJECT_ACTION_ID,
  APPROVAL_MODAL_CALLBACK_ID,
  openApprovalModal,
  replaceSlackMessage,
  type ApprovalModalMetadata,
} from "@/lib/slack/client";
import {
  extractApprovalReason,
  formatDecisionComment,
  formatDecisionMessage,
} from "@/lib/slack/approval-decision";
import { logger, redactToken } from "@/lib/logger";

type SlackAction = { action_id?: string; value?: string };
type SlackPayload = {
  type?: string;
  trigger_id?: string;
  user?: { id?: string; username?: string };
  actions?: SlackAction[];
  response_url?: string;
  view?: {
    callback_id?: string;
    private_metadata?: string;
    state?: { values?: Record<string, Record<string, { value?: string }>> };
  };
};

async function settleApproval({
  token,
  approved,
  reviewer,
  reason,
  responseUrl,
  event,
}: {
  token: string;
  approved: boolean;
  reviewer: string;
  reason?: string;
  responseUrl: string | undefined;
  event: Record<string, unknown>;
}) {
  const comment = formatDecisionComment({ reviewer, reason });

  try {
    await approvalHook.resume(token, { approved, comment });
  } catch (error) {
    event.outcome = "resume_failed";
    event.error = error instanceof Error ? error.message : String(error);
    logger.error(event);
    await replaceSlackMessage(
      responseUrl,
      ":warning: Could not record that decision — the request may have already been resolved.",
    ).catch(() => {});
    return;
  }

  event.outcome = "resumed";
  logger.info(event);

  const resultText = formatDecisionMessage({ approved, reviewer, reason });
  await replaceSlackMessage(responseUrl, resultText).catch((error) => {
    logger.error({
      route: "POST /api/slack/interactivity",
      outcome: "response_url_update_failed",
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

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

  // Step 2: the reviewer submitted the reason modal. Resume the hook and
  // settle the message in the background — Slack just needs a fast {} to
  // close the modal, and resuming the workflow can take longer than that.
  if (payload.type === "view_submission" && payload.view?.callback_id === APPROVAL_MODAL_CALLBACK_ID) {
    let metadata: ApprovalModalMetadata;
    try {
      metadata = JSON.parse(payload.view.private_metadata ?? "");
    } catch {
      event.outcome = "invalid_modal_metadata";
      event.duration_ms = Date.now() - startedAt;
      logger.error(event);
      return new Response("Invalid modal metadata", { status: 400 });
    }

    event.token = redactToken(metadata.token);
    event.approved = metadata.approved;
    event.reviewer = payload.user?.id;

    const reviewer = payload.user?.username ?? payload.user?.id ?? "a reviewer";
    const reason = extractApprovalReason(payload.view?.state);

    after(() =>
      settleApproval({
        token: metadata.token,
        approved: metadata.approved,
        reviewer,
        reason,
        responseUrl: metadata.responseUrl,
        event,
      }),
    );

    return Response.json({});
  }

  // Step 1: the reviewer clicked Approve/Reject. Open the reason modal — this
  // must happen within the few seconds the trigger_id stays valid, so it's the
  // only thing this branch does before returning.
  if (payload.type === "block_actions") {
    const action = payload.actions?.[0];
    const token = action?.value;
    const approved = action?.action_id === APPROVE_ACTION_ID;
    const isSupportedAction =
      action?.action_id === APPROVE_ACTION_ID || action?.action_id === REJECT_ACTION_ID;

    if (!token || !isSupportedAction || !payload.trigger_id) {
      event.outcome = "unsupported_action";
      event.action_id = action?.action_id;
      event.duration_ms = Date.now() - startedAt;
      logger.error(event);
      return new Response("Unsupported action", { status: 400 });
    }

    try {
      await openApprovalModal({
        triggerId: payload.trigger_id,
        metadata: { token, approved, responseUrl: payload.response_url },
      });
    } catch (error) {
      event.outcome = "open_modal_failed";
      event.error = error instanceof Error ? error.message : String(error);
      event.duration_ms = Date.now() - startedAt;
      logger.error(event);
      return new Response("Could not open the decision dialog", { status: 502 });
    }

    event.outcome = "modal_opened";
    event.token = redactToken(token);
    event.approved = approved;
    event.duration_ms = Date.now() - startedAt;
    logger.info(event);
    return Response.json({});
  }

  event.outcome = "unsupported_payload_type";
  event.payload_type = payload.type;
  event.duration_ms = Date.now() - startedAt;
  logger.error(event);
  return new Response("Unsupported payload type", { status: 400 });
}

import { logger, redactToken } from "@/lib/logger";

export const APPROVE_ACTION_ID = "approval_approve";
export const REJECT_ACTION_ID = "approval_reject";
export const APPROVAL_MODAL_CALLBACK_ID = "approval_decision";
export const APPROVAL_REASON_BLOCK_ID = "approval_reason_block";
export const APPROVAL_REASON_ACTION_ID = "approval_reason_input";

function approvalBlocks({
  token,
  scenario,
  summary,
}: {
  token: string;
  scenario: string;
  summary: string;
}) {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Human approval needed — ${scenario}*\n${summary}` },
    },
    {
      type: "actions",
      // The approval token rides in the button value: it goes straight back to
      // us inside Slack's signed payload, so it never lands in a browser URL,
      // a browser history entry, or a screenshot.
      elements: [
        {
          type: "button",
          action_id: APPROVE_ACTION_ID,
          style: "primary",
          text: { type: "plain_text", text: "Approve" },
          value: token,
        },
        {
          type: "button",
          action_id: REJECT_ACTION_ID,
          style: "danger",
          text: { type: "plain_text", text: "Reject" },
          value: token,
        },
      ],
    },
  ];
}

export type ApprovalModalMetadata = {
  token: string;
  approved: boolean;
  responseUrl?: string;
};

/**
 * Opens the "why?" modal in response to an Approve/Reject click. The decision
 * and the original message's response_url ride in private_metadata so the
 * eventual view_submission (a separate, later request) can resume the hook and
 * settle the message — Slack does not carry response_url on that payload itself.
 */
export async function openApprovalModal({
  triggerId,
  metadata,
}: {
  triggerId: string;
  metadata: ApprovalModalMetadata;
}) {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) throw new Error("SLACK_BOT_TOKEN is not configured");

  const actionLabel = metadata.approved ? "Approve" : "Reject";

  const response = await fetch("https://slack.com/api/views.open", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${botToken}`,
    },
    body: JSON.stringify({
      trigger_id: triggerId,
      view: {
        type: "modal",
        callback_id: APPROVAL_MODAL_CALLBACK_ID,
        private_metadata: JSON.stringify(metadata),
        title: { type: "plain_text", text: `${actionLabel} request` },
        submit: { type: "plain_text", text: actionLabel },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "input",
            block_id: APPROVAL_REASON_BLOCK_ID,
            optional: true,
            label: { type: "plain_text", text: "Reason (optional)" },
            element: {
              type: "plain_text_input",
              action_id: APPROVAL_REASON_ACTION_ID,
              multiline: true,
            },
          },
        ],
      },
    }),
  });

  const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!response.ok || !body?.ok) {
    throw new Error(`Slack views.open failed: ${body?.error ?? response.status}`);
  }
}

/**
 * Settles an already-posted approval message with the final decision text.
 * Used from a background task (`after()`), so there is no 3-second deadline —
 * unlike the synchronous ack Slack expects for the initial interaction.
 */
export async function replaceSlackMessage(responseUrl: string | undefined, text: string) {
  if (!responseUrl) return;
  const response = await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ replace_original: true, text }),
  });
  if (!response.ok) {
    throw new Error(`Slack response_url update failed with status ${response.status}`);
  }
}

export async function sendSlackApprovalRequest({
  token,
  scenario,
  summary,
}: {
  token: string;
  scenario: string;
  summary: string;
}) {
  "use step";

  const startedAt = Date.now();
  const event: Record<string, unknown> = {
    route: "sendSlackApprovalRequest",
    token: redactToken(token),
    scenario,
  };

  const botToken = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;
  const text = `Human approval needed: ${scenario}`;

  // Preferred path: interactive buttons the reviewer answers inside Slack.
  if (botToken && channel) {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${botToken}`,
      },
      body: JSON.stringify({ channel, text, blocks: approvalBlocks({ token, scenario, summary }) }),
    });

    const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

    if (!response.ok || !body?.ok) {
      event.outcome = "post_message_failed";
      event.status_code = response.status;
      event.error = body?.error ?? "unknown";
      event.duration_ms = Date.now() - startedAt;
      logger.error(event);
      throw new Error(`Slack chat.postMessage failed: ${body?.error ?? response.status}`);
    }

    event.outcome = "sent";
    event.transport = "interactive_message";
    event.duration_ms = Date.now() - startedAt;
    logger.info(event);
    return;
  }

  // Fallback: an incoming webhook can't render working buttons, so it links to
  // the web approval page instead. Weaker (the token travels in a URL), kept so
  // the app still works with only SLACK_WEBHOOK_URL configured.
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const approvalUrl = `${appUrl}/approve/${token}`;

  if (!webhookUrl) {
    event.outcome = "slack_not_configured";
    if (process.env.NODE_ENV !== "production") {
      event.approval_url = approvalUrl;
    }
    event.duration_ms = Date.now() - startedAt;
    logger.error(event);
    return;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Human approval needed — ${scenario}*\n${summary}` },
        },
        { type: "section", text: { type: "mrkdwn", text: `<${approvalUrl}|Review and respond>` } },
      ],
    }),
  });

  if (!response.ok) {
    event.outcome = "webhook_failed";
    event.status_code = response.status;
    event.duration_ms = Date.now() - startedAt;
    logger.error(event);
    throw new Error(`Slack webhook failed with status ${response.status}`);
  }

  event.outcome = "sent";
  event.transport = "incoming_webhook";
  event.duration_ms = Date.now() - startedAt;
  logger.info(event);
}

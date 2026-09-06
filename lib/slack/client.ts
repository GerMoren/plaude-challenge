import { logger, redactToken } from "@/lib/logger";

export const APPROVE_ACTION_ID = "approval_approve";
export const REJECT_ACTION_ID = "approval_reject";

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

import { logger, redactToken } from "@/lib/logger";

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

  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const approvalUrl = `${appUrl}/approve/${token}`;

  if (!webhookUrl) {
    event.outcome = "webhook_not_configured";
    // Only surface the full (token-bearing) URL outside production, so local
    // dev can still test the flow without a Slack workspace configured.
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
      text: `Human approval needed: ${scenario}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Human approval needed — ${scenario}*\n${summary}`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `<${approvalUrl}|Review and respond>`,
          },
        },
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
  event.duration_ms = Date.now() - startedAt;
  logger.info(event);
}

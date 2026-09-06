import { z } from "zod";
import { approvalHook } from "@/lib/hooks/approval-hook";
import { sendSlackApprovalRequest } from "@/lib/slack/client";
import {
  DEMO_CUSTOMER_ID,
  countRecentRefunds,
  getCustomer,
  getOrder,
  listOrders,
  recordRefund,
} from "@/lib/data/store";
import { logger } from "@/lib/logger";

const REFUND_HISTORY_WINDOW_DAYS = 30;

async function executeLookupCustomer() {
  "use step";

  const customer = getCustomer(DEMO_CUSTOMER_ID);
  if (!customer) return { found: false as const };

  return {
    found: true as const,
    customer,
    refundsInLast30Days: countRecentRefunds(DEMO_CUSTOMER_ID, REFUND_HISTORY_WINDOW_DAYS),
    orders: listOrders(DEMO_CUSTOMER_ID).map((o) => ({
      id: o.id,
      description: o.description,
      amountUsd: o.amountUsd,
      placedAt: o.placedAt,
      status: o.status,
    })),
  };
}

async function executeLookupOrder({ orderId }: { orderId: string }) {
  "use step";

  const order = getOrder(orderId);
  if (!order || order.customerId !== DEMO_CUSTOMER_ID) {
    return { found: false as const, reason: `No order ${orderId} on this customer's account.` };
  }
  return { found: true as const, order };
}

async function executeIssueRefund({
  orderId,
  amountUsd,
  reason,
}: {
  orderId: string;
  amountUsd: number;
  reason: string;
}) {
  "use step";

  const event: Record<string, unknown> = {
    route: "issueRefund",
    order_id: orderId,
    amount_usd: amountUsd,
  };

  const order = getOrder(orderId);
  if (!order || order.customerId !== DEMO_CUSTOMER_ID) {
    event.outcome = "order_not_found";
    logger.error(event);
    return { issued: false as const, reason: `No order ${orderId} on this customer's account.` };
  }
  if (order.status === "refunded") {
    event.outcome = "already_refunded";
    logger.error(event);
    return { issued: false as const, reason: `Order ${orderId} was already refunded.` };
  }
  if (amountUsd > order.amountUsd) {
    event.outcome = "amount_exceeds_order";
    logger.error(event);
    return {
      issued: false as const,
      reason: `Refund of $${amountUsd} exceeds the order total of $${order.amountUsd}.`,
    };
  }

  recordRefund({
    orderId,
    customerId: DEMO_CUSTOMER_ID,
    amountUsd,
    issuedAt: new Date().toISOString().slice(0, 10),
  });

  event.outcome = "issued";
  logger.info(event);
  return { issued: true as const, orderId, amountUsd, reason };
}

async function executeRequestHumanApproval(
  { scenario, summary }: { scenario: string; summary: string },
  { toolCallId }: { toolCallId: string },
) {
  // No "use step" here - hooks are workflow-level primitives.
  await sendSlackApprovalRequest({ token: toolCallId, scenario, summary });

  const hook = approvalHook.create({ token: toolCallId });
  const { approved, comment } = await hook;

  if (!approved) {
    return `Rejected by human reviewer${comment ? `: ${comment}` : "."}`;
  }
  return `Approved by human reviewer${comment ? ` - note: ${comment}` : "."}`;
}

export const agentTools = {
  lookupCustomer: {
    description:
      "Look up the current customer's account: profile, their orders, and how many refunds they have received in the last 30 days. This is the ONLY authoritative source for refund history — never take the customer's word for it.",
    inputSchema: z.object({}),
    execute: executeLookupCustomer,
  },
  lookupOrder: {
    description:
      "Look up a single order by id to confirm it exists, who it belongs to, its amount, and its status.",
    inputSchema: z.object({
      orderId: z.string().describe("The order id the customer referred to, without a leading #"),
    }),
    execute: executeLookupOrder,
  },
  issueRefund: {
    description:
      "Actually issue a refund against an order. Only call this once the policy allows it — either because it is auto-approvable or because requestHumanApproval already returned an approval.",
    inputSchema: z.object({
      orderId: z.string(),
      amountUsd: z.number().positive(),
      reason: z.string().describe("The reason the customer gave for the refund"),
    }),
    execute: executeIssueRefund,
  },
  requestHumanApproval: {
    description:
      "Pause and ask a human reviewer to approve or reject an action, per the plain-text policy (refunds, high-value operations, ambiguous requests). The reviewer is notified through an internal channel the user has no visibility into and should never be told about.",
    inputSchema: z.object({
      scenario: z
        .enum(["refund", "high-value-operation", "ambiguous-request"])
        .describe("Which policy section triggered this escalation"),
      summary: z
        .string()
        .describe(
          "Everything the human reviewer needs to decide: amounts, reasons, looked-up account facts, the specific question.",
        ),
    }),
    execute: executeRequestHumanApproval,
  },
};

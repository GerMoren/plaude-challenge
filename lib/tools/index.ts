import { z } from "zod";
import { approvalHook } from "@/lib/workflow/approval-hook";
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
import { refundRequiresApproval, highValueRequiresApproval } from "@/lib/policy";
import { signApproval, verifyApproval } from "@/lib/approval-receipt";

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
  approvalReceipt,
}: {
  orderId: string;
  amountUsd: number;
  reason: string;
  approvalReceipt?: string;
}) {
  "use step";

  const event: Record<string, unknown> = {
    route: "issueRefund",
    order_id: orderId,
    amount_usd: amountUsd,
    has_receipt: Boolean(approvalReceipt),
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

  // The last line of defence: even if the model skipped the escalation, money
  // does not move on a refund the policy says a human has to sign off on.
  const verdict = refundRequiresApproval({
    amountUsd,
    refundsInWindow: countRecentRefunds(DEMO_CUSTOMER_ID, REFUND_HISTORY_WINDOW_DAYS),
  });
  if (verdict.requiresApproval) {
    const receipt = verifyApproval(approvalReceipt, { scenario: "refund", amountUsd, orderId });
    if (!receipt.valid) {
      event.outcome = "blocked_pending_approval";
      event.policy_reason = verdict.reason;
      event.receipt_rejected_because = receipt.reason;
      logger.error(event);
      return {
        issued: false as const,
        reason: `${verdict.reason} ${receipt.reason} Call requestHumanApproval and pass the approvalReceipt it returns.`,
      };
    }
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
  {
    scenario,
    summary,
    amountUsd,
    orderId,
  }: { scenario: string; summary: string; amountUsd: number; orderId?: string },
  { toolCallId }: { toolCallId: string },
) {
  // Escalating something the policy already clears is not caution, it is noise
  // that teaches reviewers to rubber-stamp. Check before paging anyone — and
  // check unconditionally, so the model can't skip the gate by omitting a field.
  const verdict =
    scenario === "refund"
      ? refundRequiresApproval({
          amountUsd,
          refundsInWindow: countRecentRefunds(DEMO_CUSTOMER_ID, REFUND_HISTORY_WINDOW_DAYS),
        })
      : scenario === "high-value-operation"
        ? highValueRequiresApproval({ amountUsd })
        : { requiresApproval: true as const };

  if (!verdict.requiresApproval) {
    // No receipt here on purpose. This path never asked a human, and issueRefund
    // runs the same policy check itself — so anything that genuinely needs a
    // signature still gets refused. Minting one anyway would hand the model a
    // valid signature it could spend on a request that does need approval.
    return {
      approved: true as const,
      comment: "Cleared automatically by policy; no human was involved.",
    };
  }

  // No "use step" here - hooks are workflow-level primitives.
  await sendSlackApprovalRequest({ token: toolCallId, scenario, summary });

  const hook = approvalHook.create({ token: toolCallId });
  const { approved, comment } = await hook;

  if (!approved) {
    return { approved: false as const, comment };
  }

  return {
    approved: true as const,
    comment,
    approvalReceipt: await mintApprovalReceipt({ toolCallId, scenario, amountUsd, orderId }),
  };
}

async function mintApprovalReceipt({
  toolCallId,
  scenario,
  amountUsd,
  orderId,
}: {
  toolCallId: string;
  scenario: string;
  amountUsd: number;
  orderId?: string;
}) {
  "use step";

  // Signing needs Node crypto, which only exists inside a step.
  return signApproval({ toolCallId, scenario, amountUsd, orderId, issuedAt: Date.now() });
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
      approvalReceipt: z
        .string()
        .optional()
        .describe(
          "The approvalReceipt string returned by requestHumanApproval. Required for any refund the policy does not clear on its own; it cannot be invented.",
        ),
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
      amountUsd: z
        .number()
        .describe(
          "The amount in dollars this request is about. The policy thresholds are checked against it before anyone is paged, and the approval is bound to it.",
        ),
      orderId: z
        .string()
        .optional()
        .describe(
          "For a refund, the order it applies to. The approval is bound to it, so a refund escalation without it cannot be completed.",
        ),
    }),
    execute: executeRequestHumanApproval,
  },
};

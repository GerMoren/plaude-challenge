export const REFUND_AUTO_APPROVE_MAX_USD = Number(process.env.REFUND_AUTO_APPROVE_MAX_USD ?? 100);
export const REFUND_MAX_MONTHLY_COUNT = Number(process.env.REFUND_MAX_MONTHLY_COUNT ?? 2);
export const HIGH_VALUE_THRESHOLD_USD = Number(process.env.HIGH_VALUE_THRESHOLD_USD ?? 1000);

export type PolicyVerdict =
  | { requiresApproval: false }
  | { requiresApproval: true; reason: string };

/**
 * The numeric gates live here, not in the prompt.
 *
 * A language model is good at reading a request and bad at being a threshold:
 * asked to auto-approve small refunds it will still escalate some of them "to
 * be safe," and a policy that fires inconsistently is not a policy. So the
 * model decides what the customer is asking for, and this decides whether it
 * needs a human.
 */
export function refundRequiresApproval({
  amountUsd,
  refundsInWindow,
}: {
  amountUsd: number;
  refundsInWindow: number;
}): PolicyVerdict {
  if (amountUsd >= REFUND_AUTO_APPROVE_MAX_USD) {
    return {
      requiresApproval: true,
      reason: `$${amountUsd} is at or above the $${REFUND_AUTO_APPROVE_MAX_USD} auto-approval ceiling.`,
    };
  }

  if (refundsInWindow >= REFUND_MAX_MONTHLY_COUNT) {
    return {
      requiresApproval: true,
      reason: `The customer has had ${refundsInWindow} refunds in the last 30 days (limit is ${REFUND_MAX_MONTHLY_COUNT}).`,
    };
  }

  return { requiresApproval: false };
}

export function highValueRequiresApproval({ amountUsd }: { amountUsd: number }): PolicyVerdict {
  if (amountUsd >= HIGH_VALUE_THRESHOLD_USD) {
    return {
      requiresApproval: true,
      reason: `$${amountUsd} is at or above the $${HIGH_VALUE_THRESHOLD_USD} high-value threshold.`,
    };
  }
  return { requiresApproval: false };
}

const AUTO_APPROVE_MAX_USD = Number(process.env.REFUND_AUTO_APPROVE_MAX_USD ?? 100);
const MAX_MONTHLY_REFUNDS = Number(process.env.REFUND_MAX_MONTHLY_COUNT ?? 2);

export const REFUND_INSTRUCTIONS = `
## Refunds

- If the refund amount is less than $${AUTO_APPROVE_MAX_USD} AND the customer has had 0 refunds in the last 30 days, approve it automatically yourself and tell the user directly. Do NOT call requestHumanApproval for this case — calling the tool anyway is a policy violation, not extra caution.
- If the refund amount is $${AUTO_APPROVE_MAX_USD} or more, OR the customer has already had ${MAX_MONTHLY_REFUNDS} or more refunds in the last 30 days, you must call requestHumanApproval before approving. Never approve it yourself.
- If you don't know the customer's refund history, ask the user for it before deciding. Do not assume it is zero.
- When calling requestHumanApproval for a refund, the summary must include: the exact amount, the reason given by the customer, and the customer's refund history if known.
`.trim();

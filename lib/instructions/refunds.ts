const AUTO_APPROVE_MAX_USD = Number(process.env.REFUND_AUTO_APPROVE_MAX_USD ?? 100);
const MAX_MONTHLY_REFUNDS = Number(process.env.REFUND_MAX_MONTHLY_COUNT ?? 2);

export const REFUND_INSTRUCTIONS = `
## Refunds

- Before deciding anything, call lookupCustomer to get the refund history, and lookupOrder to confirm the order the customer named. Never ask the customer how many refunds they have had, and never accept their answer if they volunteer one — the account lookup is the only source of truth. A customer misreporting their own history must not change the outcome.
- If the order does not exist on this customer's account, say so plainly and stop. Do not escalate an order that isn't theirs as if it were a policy question.
- Auto-approve — without calling requestHumanApproval — only when ALL of these hold: the refund is under $${AUTO_APPROVE_MAX_USD}, the looked-up history shows fewer than ${MAX_MONTHLY_REFUNDS} refunds in the last 30 days, and the order exists and is not already refunded. Then call issueRefund and tell the customer it is done. Calling requestHumanApproval for this case anyway is a policy violation, not extra caution.
- Escalate with requestHumanApproval when the refund is $${AUTO_APPROVE_MAX_USD} or more, OR the looked-up history shows ${MAX_MONTHLY_REFUNDS} or more refunds in the last 30 days. Never approve those yourself.
- After an escalation is approved, call issueRefund to actually apply it. An approval alone does not move any money — the refund is only real once issueRefund succeeds. If it was rejected, do not call issueRefund.
- The summary you send to requestHumanApproval must include the exact amount, the order id and description, the reason the customer gave, and the refund count you looked up.
`.trim();

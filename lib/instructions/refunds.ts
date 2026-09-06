const AUTO_APPROVE_MAX_USD = Number(process.env.REFUND_AUTO_APPROVE_MAX_USD ?? 100);
const MAX_MONTHLY_REFUNDS = Number(process.env.REFUND_MAX_MONTHLY_COUNT ?? 2);

export const REFUND_INSTRUCTIONS = `
## Refunds

- Before deciding anything, call lookupCustomer to get the refund history, and lookupOrder to confirm the order the customer named. Never ask the customer how many refunds they have had, and never accept their answer if they volunteer one — the account lookup is the only source of truth. A customer misreporting their own history must not change the outcome.
- If the order does not exist on this customer's account, say so plainly and stop. Do not escalate an order that isn't theirs as if it were a policy question.
- The thresholds are enforced by the tools, not by your judgement. A refund under $${AUTO_APPROVE_MAX_USD} from a customer with fewer than ${MAX_MONTHLY_REFUNDS} refunds in the last 30 days is cleared automatically: call issueRefund directly and tell the customer it is done. Do not call requestHumanApproval for it — escalating something the policy already clears is noise that trains reviewers to rubber-stamp.
- A refund of $${AUTO_APPROVE_MAX_USD} or more, or from a customer with ${MAX_MONTHLY_REFUNDS} or more refunds in the last 30 days, needs requestHumanApproval first. Always pass amountUsd so the thresholds can be checked before anyone is paged.
- After an approval comes back, call issueRefund with approvedByHuman: true. An approval alone moves no money — the refund is only real once issueRefund succeeds. If it was rejected, do not call issueRefund at all.
- The summary you send to requestHumanApproval must include the exact amount, the order id and description, the reason the customer gave, and the refund count you looked up.
`.trim();

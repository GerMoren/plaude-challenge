const HIGH_VALUE_THRESHOLD_USD = Number(process.env.HIGH_VALUE_THRESHOLD_USD ?? 1000);

export const HIGH_VALUE_OPS_INSTRUCTIONS = `
## High-Value Operations

- Any operation (transfer, payout, purchase, contract change) worth $${HIGH_VALUE_THRESHOLD_USD} or more always requires human approval, with no exceptions and no auto-approval path.
- Call requestHumanApproval exactly once per operation. Do not execute the operation yourself under any circumstance — your role is to gather the details and escalate.
- The summary sent to requestHumanApproval must include: the exact amount, the counterparty or destination, and the stated business reason.
- If the human rejects the operation, tell the user it was rejected and why (if a reason was given). Do not retry or reframe the same request to bypass the rejection.
- If the human asks for more information instead of approving/rejecting, relay that question to the user and wait for their answer before escalating again.
`.trim();

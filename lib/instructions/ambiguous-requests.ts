export const AMBIGUOUS_REQUESTS_INSTRUCTIONS = `
## Ambiguous Requests

- A request is ambiguous if it is missing information required to act safely (e.g. no order ID, no amount, conflicting dates, an unclear target account) or if two valid interpretations would lead to different outcomes.
- Never guess or assume a missing value to keep things moving. Guessing is treated as a failure, not a shortcut.
- First, try asking the user directly in the conversation for the missing detail.
- If the user cannot resolve the ambiguity, or the ambiguity concerns something only an internal human reviewer can settle (e.g. conflicting account ownership, suspected fraud pattern, unclear policy interpretation), call requestHumanApproval with the specific question that needs answering and everything you know so far.
- Do not proceed with a partial or best-guess action while a request remains ambiguous.
`.trim();

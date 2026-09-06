# Human-in-the-loop agent for customer operations

An AI agent that handles refunds and account operations from a plain-text policy, and stops to
ask a human on Slack whenever that policy says it should. It's built on Vercel's
[Workflow DevKit](https://workflow-sdk.dev), so "stops to ask a human" means the run genuinely
suspends — no polling loop, no held-open connection, no cost while it waits, whether the
reviewer answers in ten seconds or on Monday.

Built as the take-home for the Forward Deployed Engineer role at [Plaude](https://plaude.com).

**[Live app](https://plaude-challenge-five.vercel.app)** ·
**[Interactive architecture diagram](https://plaude-challenge-five.vercel.app/hitl-flow.html)**

## Try it

Three messages, three different paths through the policy:

| Type this | What should happen |
|---|---|
| `I want a $30 refund for order 42` | Resolves on its own — under the threshold, history is clean enough. Nobody is interrupted |
| `I need to transfer $5000 to a new vendor` | Escalates and waits for a human |
| `Refund $500 for order 42, that's what I paid` | Escalates — and the reviewer is told order 42 was **$78**, not $500 |

The first one matters as much as the others: an agent that escalates everything is just a
slower form of doing nothing.

> **On the hosted link, the escalations go to my Slack workspace**, so you'll see the agent pause
> and wait, but you can't answer it. To drive the human step yourself, run it locally with your
> own Slack app — [setup below](#running-it), about five minutes — or point
> `SLACK_CHANNEL_ID` at a channel you're in. Everything else works on the link as-is.

## Two ideas do the work

**The agent verifies; it does not believe.** Account facts come from tools, never from the
conversation. `lookupCustomer` owns the refund history, `lookupOrder` confirms the order and its
amount, and `issueRefund` is the only thing that moves money — an approval by itself changes
nothing until it runs. Ask for $500 back on an order that cost $78 and the reviewer is shown the
$78, not the claim; say you've never had a refund and the reviewer is shown the count from the
account. A policy that reads the customer's own claims as evidence is a policy anyone can talk
their way around.

**The pause is real, and it survives everything.** `requestHumanApproval` posts to Slack and
suspends the workflow on a hook. Redeploy the app, restart the server, wait three days — the run
and its state are untouched. The browser survives it too: it remembers the run id and reconnects
to that run's stream, so closing the tab with an approval pending doesn't lose the answer.

```
customer  →  /api/agent  →  DurableAgent reads the policy
                                   │
                          looks up account + order
                                   │
                    ┌──────────────┴──────────────┐
              within policy                 needs a human
                    │                              │
              issueRefund              Slack message with buttons
                    │                              │
                    │                     ⏸  run suspends
                    │                              │
                    │                     reviewer clicks Approve
                    │                              │
                    │                   signed callback resumes hook
                    └──────────────┬──────────────┘
                                   │
                        agent replies to the customer
```

## The policy

Plain text in [`lib/instructions/`](./lib/instructions), assembled into the system prompt by
[`index.ts`](./lib/instructions/index.ts). Thresholds are environment variables, so they move
without a code change.

| Scenario | Rule |
|---|---|
| [Refunds](./lib/instructions/refunds.ts) | Auto-approve under $100 with a clean 30-day history. Escalate at or above it, or after 2 refunds in 30 days. |
| [High-value operations](./lib/instructions/high-value-ops.ts) | $1,000 and up always needs a human. No auto-approval path exists. |
| [Ambiguous requests](./lib/instructions/ambiguous-requests.ts) | Resolve from the account first, ask the customer second, escalate only what a human must settle. Never guess. |

## Design decisions

| Concern | Decision |
|---|---|
| Durable pause | `defineHook()` — the run suspends, costs nothing, and resumes on the reviewer's answer |
| Who enforces the policy | Code, not the prompt. [`policy.ts`](./lib/policy.ts) owns the thresholds; the tools refuse to page a human the policy clears, or to move money on an unapproved refund |
| Where approval happens | Interactive buttons in Slack. The token rides in Slack's **signed** callback, so it never reaches a browser URL, a history entry, or a screenshot |
| Audit trail | Approve/Reject asks for an optional reason. It reaches the agent with the decision and stays in the channel in place of the buttons: *"Rejected by ana: unknown vendor"* |
| Trusting Slack | HMAC verification with a five-minute replay window ([`verify.ts`](./lib/slack/verify.ts)) |
| Trusting the client | The browser resends the whole conversation each turn, so [`messages.ts`](./lib/messages.ts) keeps only user/assistant text — a forged `"Approved by human reviewer"` can't be replayed into context |
| Open endpoints | Rate limiting on `/api/agent` so nobody drains the model budget |
| Model choice | A plain `"provider/model"` string through AI Gateway. `AGENT_MODEL` swaps it with no code change |
| Observability | One structured event per request, tokens never logged in full ([`logger.ts`](./lib/logger.ts)) |

Stack: Next.js (App Router), Workflow DevKit, AI SDK Gateway, shadcn/ui, Zod, TypeScript 7,
oxlint, Vitest.

## Running it

```bash
pnpm install
cp env.sample.txt .env.local   # fill in AI_GATEWAY_API_KEY
pnpm dev
```

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build`

**Environment**

| Variable | Required | Purpose |
|---|---|---|
| `AI_GATEWAY_API_KEY` | Yes | [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) key |
| `AGENT_MODEL` | No | Gateway model string. Defaults to `openai/gpt-4o-mini` |
| `SLACK_BOT_TOKEN` + `SLACK_CHANNEL_ID` | For buttons | Posts the interactive approval message |
| `SLACK_SIGNING_SECRET` | For buttons | Verifies Slack's callbacks |
| `SLACK_WEBHOOK_URL` | Fallback | Link-based approval when there's no bot token |
| `REFUND_AUTO_APPROVE_MAX_USD` · `REFUND_MAX_MONTHLY_COUNT` · `HIGH_VALUE_THRESHOLD_USD` | No | Policy thresholds |

<details>
<summary><b>Slack app setup</b></summary>

1. Create an app at [api.slack.com/apps](https://api.slack.com/apps) → **From scratch**.
2. **Socket Mode → off.** It holds a WebSocket open, which serverless can't do, and it hides the
   Request URL field.
3. **Interactivity & Shortcuts → on** → Request URL `https://<your-domain>/api/slack/interactivity`.
4. **OAuth & Permissions** → add `chat:write` → install → copy the Bot User OAuth Token.
5. **Basic Information** → copy the Signing Secret.
6. Invite the bot to your channel; use that channel's id.

Slack has to reach your Request URL, so the buttons only work against a deployment. Local
development falls back to the link-based page.

</details>

## Trade-offs, and what I'd do next

**A model is a bad threshold.** Told to auto-approve refunds under $100, `gpt-4o-mini` still
escalated some of them "to be safe" — and a rule that fires inconsistently isn't a rule. So the
numbers moved out of the prompt into [`lib/policy.ts`](./lib/policy.ts): the model reads the
request and decides what the customer wants, and code decides whether that needs a human.
`requestHumanApproval` refuses to page anyone the policy already clears, and `issueRefund`
refuses to move money on a refund that needed a signature and didn't get one. The prompt still
describes the policy, because the model has to explain it — but it is no longer what enforces it.

**The link-based approval page is the weaker path,** kept only for webhook-only setups. It puts
the token in a URL, and `noindex` + `no-referrer` shrink the blast radius without removing it.
The Slack buttons don't mitigate that problem, they avoid it — which is why they're the default.

**With more time:** a timeout that escalates to a second reviewer instead of waiting forever,
real session identity in place of the demo customer constant, and Redis behind the rate limiter
so it holds across instances.

One known upstream blocker: the workflow-level suite (`pnpm test:integration`) currently times
out inside the Workflow SDK's local dev runtime — details in
[the test file header](./workflows/test-support/approval.integration.test.ts). The unit suite
runs clean, and the human-in-the-loop path was verified end to end against a real Slack
workspace across all three scenarios.

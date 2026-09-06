# Plaude Engineering Challenge

An AI agent guided by plain-text instructions that runs a **human-in-the-loop** workflow
over Slack, built with Next.js and Vercel's [Workflow DevKit](https://workflow-sdk.dev)
(`workflow` + `@workflow/ai`).

Built as the take-home for the Forward Deployed Engineer role at [Plaude](https://plaude.com).

**Live**: https://plaude-challenge-five.vercel.app — the chat UI needs `AI_GATEWAY_API_KEY`, and
the Slack variables below for the approval step; the
[interactive flow diagram](https://plaude-challenge-five.vercel.app/hitl-flow.html) works
regardless.

### Slack setup (for the interactive approval buttons)

1. Create an app at [api.slack.com/apps](https://api.slack.com/apps) → **From scratch**.
2. **Socket Mode → off.** Socket Mode holds a WebSocket open, which a serverless deployment
   can't do, and it hides the Request URL field.
3. **Interactivity & Shortcuts → on**, Request URL: `https://<your-domain>/api/slack/interactivity`.
4. **OAuth & Permissions** → add the `chat:write` scope → install the app → copy the **Bot User
   OAuth Token** into `SLACK_BOT_TOKEN`.
5. **Basic Information** → copy the **Signing Secret** into `SLACK_SIGNING_SECRET`.
6. Invite the bot to the channel and put that channel's id in `SLACK_CHANNEL_ID`.

## What it does

The agent handles customer operations requests (refunds, high-value operations, ambiguous
requests) against a plain-text policy. When the policy requires human sign-off, the agent
pauses the workflow, notifies a human reviewer on Slack, and resumes automatically once
someone approves or rejects the request — no polling, no lost state, even if the workflow
is paused for days.

## Human-in-the-loop flow

**[Live interactive diagram →](https://plaude-challenge-five.vercel.app/hitl-flow.html)**
(pan/zoom, dark/light, no login required). Source: `public/hitl-flow.html`.

In short: the user's request starts a durable workflow; if the plain-text policy requires
sign-off, the agent's `requestHumanApproval` tool notifies a human on Slack and suspends the
workflow on a hook — consuming zero resources while it waits. The reviewer approves or rejects
with buttons inside Slack, which resumes the hook, and the agent relays the outcome back to the
user in the chat UI.

The workflow is durable: if the server restarts, redeploys, or the reviewer takes days to
respond, the paused run and its state are unaffected. The **client** survives it too — the
browser stores the run id and reconnects to that run's stream
(`WorkflowChatTransport` + `/api/agent/[runId]/stream`), so closing the tab while an approval
is pending doesn't lose the answer.

## The agent looks things up; it does not take the customer's word

Account facts come from tools, never from the conversation. `lookupCustomer` returns the
authoritative refund history, `lookupOrder` confirms the order exists and its amount, and
`issueRefund` is what actually moves money — an approval alone does nothing until it runs.

This matters more than it sounds. Ask for a $50 refund while claiming *"I've never had a refund
before,"* and the agent looks up the account, finds two refunds in the last 30 days, and
escalates anyway — quoting the real number to the reviewer. A policy that reads the customer's
own claims as evidence is a policy anyone can talk their way around.

## Approval scenarios (plain-text instructions)

Defined as plain text in [`lib/instructions/`](./lib/instructions), combined into the
agent's system prompt in [`lib/instructions/index.ts`](./lib/instructions/index.ts):

- **[Refunds](./lib/instructions/refunds.ts)** — auto-approve under `REFUND_AUTO_APPROVE_MAX_USD`
  (default $100) with a clean refund history; escalate to a human at that threshold or above,
  or after `REFUND_MAX_MONTHLY_COUNT` (default 2) refunds in 30 days.
- **[High-value operations](./lib/instructions/high-value-ops.ts)** — any operation worth
  `HIGH_VALUE_THRESHOLD_USD` (default $1,000) or more always requires human approval, with
  no auto-approval path.
- **[Ambiguous requests](./lib/instructions/ambiguous-requests.ts)** — if required
  information is missing or contradictory, the agent asks the user first, and escalates to
  a human only if the user can't resolve it.

All four tools live in [`lib/tools/index.ts`](./lib/tools/index.ts): `lookupCustomer`,
`lookupOrder`, `issueRefund`, and `requestHumanApproval`. The instructions above are what tell
the agent when to reach for each one. It never approves high-risk actions on its own judgment —
only the plain-text policy and a human reviewer can.

## Stack

- **Next.js** (App Router) — chat UI (`useChat`) and API routes.
- **shadcn/ui** + Tailwind — chat bubbles, approval alerts, and forms.
- **Workflow DevKit** (`workflow`, `@workflow/ai`) — `"use workflow"` / `"use step"`
  directives, `DurableAgent`, and `defineHook()` for the durable pause/resume.
- **AI SDK Gateway** — model specified as a plain string (`"openai/gpt-4o-mini"`), no
  provider-specific SDK required. Swappable to any Gateway model by editing
  `workflows/agent-workflow.ts`.
- **Slack interactive messages** — the reviewer approves or rejects with buttons in Slack.
  The approval token travels in the button payload, which comes back inside Slack's
  **signed** request (`lib/slack/verify.ts` checks the HMAC and rejects replays), so it never
  appears in a browser URL, history entry, or screenshot. If only `SLACK_WEBHOOK_URL` is
  configured, it falls back to posting a link to `/approve/[token]` — see
  [Known limitations](#known-limitations) for why that path is weaker.
- **Zod** — validates tool inputs and the approval hook's payload.
- **oxlint** for linting, **TypeScript 7** for type-checking, **Vitest** for tests, structured
  JSON logging (one contextual event per request — `lib/logger.ts`).

## Hardening

- **Signed approvals.** Only a request Slack signed, within a five-minute window, can resolve
  an approval (`lib/slack/verify.ts`).
- **Client input is treated as hostile.** The browser sends the whole conversation each turn,
  so `lib/messages.ts` strips everything but user/assistant text — a client can't replay a
  forged `"Approved by human reviewer"` tool result into the model's context to talk its way
  past the policy.
- **Rate limiting** on `/api/agent` (`lib/rate-limit.ts`) so an open endpoint can't burn the
  Gateway budget. Per-instance only; a real deployment would back it with Redis.
- **Tokens are never logged in full** — logs carry a short prefix (`redactToken`).

## Known limitations

- **The model doesn't always follow the "don't escalate" instruction perfectly.** With
  `gpt-4o-mini` (used here to stay within AI Gateway's free tier), a refund that the policy
  says to auto-approve (e.g. $50, no prior refunds) sometimes still gets escalated to
  `requestHumanApproval` — the model even says "I can approve this automatically" in its own
  text response, then calls the tool anyway. This is a genuine limitation of relying on a
  small model to strictly gate a single always-available tool, not a bug in the workflow or
  hook logic — the escalation itself, and the resume once a human answers, work correctly
  every time. A larger model (e.g. `anthropic/claude-sonnet-5`, `openai/gpt-4.1`) follows the
  negative instruction more reliably, at a higher per-request cost. In one observed session
  it also misreported an *approved* outcome to the user as rejected, contradicting its own
  tool result — `lib/instructions/index.ts` now explicitly instructs the model to treat the
  tool's returned string as ground truth rather than reasoning about the outcome itself, but
  this class of error is inherent to a small model and not fully eliminable by prompting.
- The human-in-the-loop step depends on a human actually being reachable on Slack. There's no
  timeout/escalation-to-a-second-reviewer path — the workflow will wait indefinitely (which
  Workflow DevKit supports natively, at zero cost while paused).
- **The web approval fallback (`/approve/[token]`) is the weaker path**, kept only for setups
  with just an incoming webhook. It puts the approval token in a URL, which means it lands in
  browser history and any screenshot of the page; `noindex` + `no-referrer` limit the blast
  radius but don't remove it. The Slack-button path avoids the problem entirely rather than
  mitigating it, which is why it's the default whenever `SLACK_BOT_TOKEN` and
  `SLACK_CHANNEL_ID` are set.
- **Slack's Request URL must be reachable from the internet**, so the interactive buttons only
  work against a deployment. Locally, buttons still render but resolve against whatever URL the
  Slack app points at — use the web fallback for local testing.
- The customer identity is a constant (`DEMO_CUSTOMER_ID`) because the demo has no login. Real
  deployments would resolve it from the session; the tools already take a customer id.
- **`pnpm test:integration` currently times out** — this is an upstream bug, not an issue with the code
  under test or the tests themselves. `workflow@4.8.5`'s local dev "world" runtime (used by
  `@workflow/vitest`) fails with `ERR_IMPORT_ATTRIBUTE_MISSING` while loading a bundled copy
  of `builtin-modules/builtin-modules.json`, even though that package's own source correctly
  declares `with { type: "json" }`. Reproduces identically on Node 24 (LTS) and Node 25, and
  with Vite 7 and 8 — see the header comment in
  [`workflows/test-support/approval.integration.test.ts`](./workflows/test-support/approval.integration.test.ts).
  The exact mechanism these tests target (hook creation, Slack notification, resume via
  `/api/hooks/approval`) was validated manually end-to-end against a real Slack workspace
  for all three policy scenarios (refund, high-value operation, ambiguous request). CI runs
  the suite with `continue-on-error` so it stays visible without blocking the pipeline.

## Running locally

```bash
pnpm install
pnpm dev
```

Other scripts: `pnpm lint` (oxlint), `pnpm typecheck` (`tsc --noEmit`), `pnpm build`,
`pnpm test` / `pnpm test:watch` (unit tests), and `pnpm test:integration` (workflow-level
suite — see [Known limitations](#known-limitations) for a current upstream blocker).

Environment variables (see [`env.sample.txt`](./env.sample.txt) for the template — copy it
to `.env.local`):

| Variable | Required | Description |
|---|---|---|
| `AI_GATEWAY_API_KEY` | Yes | [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) key. |
| `AGENT_MODEL` | No | AI Gateway model string passed to `DurableAgent`. Defaults to `"openai/gpt-4o-mini"` (works on the Gateway free tier). Swap to `"anthropic/claude-sonnet-5"` or similar for stricter tool-use policy adherence — see [Known limitations](#known-limitations). |
| `SLACK_BOT_TOKEN` | No | Bot token (`xoxb-…`) with `chat:write`. Set together with `SLACK_CHANNEL_ID` to get interactive approval buttons in Slack (the preferred path). |
| `SLACK_CHANNEL_ID` | No | Channel the approval message is posted to (e.g. `C09…`). |
| `SLACK_SIGNING_SECRET` | Yes, with buttons | Verifies that interactivity requests really came from Slack. Without it, `/api/slack/interactivity` refuses every request. |
| `SLACK_WEBHOOK_URL` | No | Incoming webhook, used only as a fallback when the bot token/channel aren't set. Posts a link to the web approval page. With no Slack config at all, the approval link is logged to the server console (non-production only) so local testing still works. |
| `APP_URL` | No | Public base URL used to build the fallback `/approve/[token]` link. Defaults to `http://localhost:3000`. |
| `REFUND_AUTO_APPROVE_MAX_USD` | No | Refund auto-approval ceiling. Defaults to `100`. |
| `REFUND_MAX_MONTHLY_COUNT` | No | Refund count in 30 days that forces escalation regardless of amount. Defaults to `2`. |
| `HIGH_VALUE_THRESHOLD_USD` | No | Amount at/above which any operation requires human approval. Defaults to `1000`. |

Try it: ask for something small ("$50 refund, no prior refunds") and it resolves instantly.
Ask for something bigger ("$5,000 wire transfer to a new vendor") and the agent will tell
you it's waiting on a human — open the approval link shown in the UI (or in Slack, if
configured) to approve or reject it, and watch the chat resume.

Inspect workflow runs and steps with the Workflow SDK CLI:

```bash
npx workflow web
```

## Why this approach

This challenge reuses the same engineering instincts behind [Junando](https://github.com/GerMoren/junando),
my AIOps alert-correlation agent: scenario-specific behavior driven by plain-text
instructions rather than hardcoded branching logic, and resilience built into the
infrastructure layer rather than bolted on. There, retries and durable state came from
SQS/DLQ and Redis; here, they come natively from Workflow DevKit's steps and hooks — same
principle, better-fitted primitive for an agent that needs to pause on a human for
arbitrarily long stretches of time.

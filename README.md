# Plaude Engineering Challenge

An AI agent guided by plain-text instructions that runs a **human-in-the-loop** workflow
over Slack, built with Next.js and Vercel's [Workflow DevKit](https://workflow-sdk.dev)
(`workflow` + `@workflow/ai`).

Built as the take-home for the Forward Deployed Engineer role at [Plaude](https://plaude.com).

**Live**: https://plaude-challenge-five.vercel.app — the chat UI needs `AI_GATEWAY_API_KEY`
(and optionally `SLACK_WEBHOOK_URL`) set as Vercel project env vars to fully function; the
[interactive flow diagram](https://plaude-challenge-five.vercel.app/hitl-flow.html) works
regardless.

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
workflow on a hook — consuming zero resources while it waits. The human approves or rejects
via `/approve/[token]`, which resumes the hook, and the agent relays the outcome back to the
user in the chat UI.

The workflow is durable: if the server restarts, redeploys, or the reviewer takes days to
respond, the paused run and its state are unaffected.

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

The agent has a single tool, `requestHumanApproval` ([`lib/tools/index.ts`](./lib/tools/index.ts)),
that the instructions above tell it when to call. It never approves high-risk actions on
its own judgment — only the plain-text policy and a human reviewer can.

## Stack

- **Next.js** (App Router) — chat UI (`useChat`) and API routes.
- **shadcn/ui** + Tailwind — chat bubbles, approval alerts, and forms.
- **Workflow DevKit** (`workflow`, `@workflow/ai`) — `"use workflow"` / `"use step"`
  directives, `DurableAgent`, and `defineHook()` for the durable pause/resume.
- **AI SDK Gateway** — model specified as a plain string (`"openai/gpt-4o-mini"`), no
  provider-specific SDK required. Swappable to any Gateway model by editing
  `workflows/agent-workflow.ts`.
- **Slack Incoming Webhook** — simplest possible integration for the human notification
  step (no Slack app/OAuth setup required). The approval itself happens on a page in this
  app (`/approve/[token]`), which the Slack message links to.
- **Zod** — validates the tool's input and the approval hook's payload.
- **oxlint** for linting, **TypeScript 7** for type-checking, **Vitest** (`@workflow/vitest`)
  for integration tests, structured JSON logging (one contextual event per request —
  `lib/logger.ts`).

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
- **`pnpm test` currently times out** — this is an upstream bug, not an issue with the code
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
`pnpm test` / `pnpm test:watch` (integration tests — see
[Known limitations](#known-limitations) for a current upstream blocker).

Environment variables (see [`env.sample.txt`](./env.sample.txt) for the template — copy it
to `.env.local`):

| Variable | Required | Description |
|---|---|---|
| `AI_GATEWAY_API_KEY` | Yes | [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) key. |
| `AGENT_MODEL` | No | AI Gateway model string passed to `DurableAgent`. Defaults to `"openai/gpt-4o-mini"` (works on the Gateway free tier). Swap to `"anthropic/claude-sonnet-5"` or similar for stricter tool-use policy adherence — see [Known limitations](#known-limitations). |
| `SLACK_WEBHOOK_URL` | No | A Slack [Incoming Webhook](https://api.slack.com/messaging/webhooks) URL. If unset, the approval link is logged to the server console instead — useful for local testing without a Slack workspace. |
| `APP_URL` | No | Public base URL used to build the `/approve/[token]` link sent to Slack. Defaults to `http://localhost:3000`. |
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

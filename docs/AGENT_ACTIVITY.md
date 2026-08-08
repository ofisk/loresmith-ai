# Agent activity log

An append-only record of what agents did: one row per tool call, with lifecycle
state, timing, attribution, and parent/child linkage.

It exists because five separate features each needed the same thing and none of
them had it. Issues #273 (agent dashboard), #276 (autonomy levels), #277
(interrupt controls), #279 (guided flows) and #281 (multi-agent visualization)
are all views over, or hooks into, one durable trace of agent actions — so each
was individually large and none was individually startable. This is that trace
(issue #739).

## Why nothing recorded this before

Agents run in Durable Objects, and `BaseAgent` executes tools inside
`streamText`. Tool results flow back into the response stream and are then gone.
The only surviving evidence that a tool ran was the chat transcript and whatever
the tool itself happened to write to D1. Nothing said which agent ran it, what
it touched, how long it took, or whether it succeeded.

## Where rows come from

`BaseAgent.createEnhancedTools` already rewraps every tool's `execute` for every
agent — it is where JWT injection, campaign-id override, the infinite-loop guard
and the stale-command block live. The activity log is written from that same
wrapper, so **every agent is logged with no per-agent instrumentation**, and an
agent added tomorrow is logged the day it is added.

```
BaseAgent.createEnhancedTools
  └─ withActivityRecording(recorder, toolName, …)   ← src/services/agent-activity
       ├─ recorder.begin()   → status: running
       ├─ the tool's actual execute
       └─ recorder.finish()  → status: succeeded | failed
```

Recording wraps the *whole* wrapper, not just the tool, so calls the wrapper
blocks itself — a loop-limited tool, a mutating tool blocked as stale — appear
as failures rather than silently succeeding. Those return a failure envelope
instead of throwing, so status is read from `result.success`, not from whether
an exception escaped.

## Multi-agent turns form a tree

`askAnotherAgent` is itself a tool, so it gets a row like any other — typed
`delegation` rather than `tool_call`. The delegate's tools are then built
through the same wrapper with a child context, so everything the delegate does
is recorded under *its* `agent_type` with the delegating call as `parent_id`.

Every row also carries `root_id`, set to its own id when it is a root. One
indexed equality therefore fetches a whole multi-agent turn — no recursive
query — which is what `GET /api/agent-activity/tree/:rootId` serves.

## Schema

`migrations/0036_agent_activity.sql`. The columns that are not self-evident:

| Column | Notes |
|---|---|
| `username` | Denormalized from the JWT. This is the **entire** authorization check on the table — every read is scoped to it, and no read joins to prove ownership. |
| `session_id` | The Durable Object id, i.e. one chat thread. |
| `action_type` | `tool_call` or `delegation`. Coarser than `tool_name` so a future generation or indexing step lands without a migration. |
| `status` | `running`, `succeeded`, `failed`, plus `cancelled` and `awaiting_approval`, which nothing writes yet — see below. |
| `root_id` | Set even on roots (to their own id). |
| `duration_ms` | Measured in the Worker: D1 stores timestamps at second resolution and most tool calls finish inside one. |
| `summary` | JSON. Redacted, size-capped view of the arguments and of what was touched. |

### The summary is never raw tool input

The wrapper injects the caller's JWT into arguments before calling `execute`, so
a verbatim copy of the input would persist a live credential in a table built to
be displayed. `src/lib/agent-activity-summary.ts` therefore:

- redacts by key — an explicit list plus a substring pass for the `*Token`,
  `*Secret`, `*Password` and `*ApiKey` families, so a tool added later is
  covered without being added to a list;
- keeps redacted keys as `[redacted]` rather than dropping them, because "this
  call carried a JWT" is worth knowing and a missing key makes an authenticated
  action look anonymous;
- truncates every value, caps the key count, and caps the serialized payload,
  shedding the input map entirely rather than emitting oversized JSON.

Touched ids (entities, files, campaigns, shards) are collected by a bounded,
depth-limited walk over the tool's result, keyed on field name. That is a
heuristic on purpose: a per-tool output contract would be exactly the per-agent
instrumentation this primitive exists to avoid. Missing an id costs a dimmer
badge in the UI; making 200 tools declare their outputs would cost the feature.

## Write cost

A D1 round-trip per tool call — twice, for start and finish — on the path a user
is waiting on would be a real regression. Nothing on the hot path is awaited:

- `begin` and `finish` mutate an in-memory map and mark the row dirty.
- Flushes chain onto a single promise, so enqueues during an in-flight flush
  coalesce into the next one, and each flush drains everything dirty in one
  `db.batch()`.
- A tool that starts and finishes between two flushes — the common case — is
  written **once**, with its final state, because the DAO upserts on `id`.

Losing a row is acceptable; losing a turn is not. Every failure path logs and
continues.

## Degradation

Merging to `main` deploys the Worker automatically but does **not** apply D1
migrations (`docs/DEPLOYMENT.md`). Because this table is written from inside
every agent's tool path, throwing during that window would not lose a log line —
it would break every agent in production. So `AgentActivityDAO` checks
`isSchemaReady()` and degrades every method to a no-op or an empty result.

Logging is also skipped entirely when:

- there is no `DB` binding (the normal state in unit tests);
- the turn is unauthenticated — a row with no owner could never be read back;
- `LORESMITH_AGENT_ACTIVITY_LOG` is set to a falsy value. Unset means enabled;
  the variable exists as a kill switch that needs no deploy.

## Retention

14 days, swept on the fast cron (`*/5`) alongside the other prunes. Shorter than
the 90-day cost ledger because this table gains a row per tool call rather than
per turn, and its readers care about the last few days. Anything needing a
longer horizon should aggregate into telemetry rather than lengthen this window.

The same sweep closes out rows left `running` by a Worker that died mid-call.
The finish write is best-effort by design, so without it a dashboard would show
work that never ends. Those rows are marked `failed`, not `cancelled` — nobody
asked for them to stop, they simply never came back.

## API

All read-only, all scoped to the authenticated caller. There is deliberately no
write endpoint: rows come from the agents, and an endpoint that accepted them
would be a way to forge a record of work that never happened.

| Endpoint | Returns |
|---|---|
| `GET /api/agent-activity` | The caller's actions, newest first. Filters: `campaignId`, `sessionId`, `agentType`, `status`, `since`, `limit`, `offset`. |
| `GET /api/agent-activity/summary` | Counts over the same filters, minus paging — totals by status and by agent type. |
| `GET /api/agent-activity/tree/:rootId` | One turn's actions, oldest first, including a delegate's work. |

A `username` in the query string is ignored. The caller's own username is taken
from the JWT and pinned, because the row's username is the only thing standing
between one user's dashboard and everyone else's campaigns.

## What this unblocks

| Issue | What is left to build |
|---|---|
| #273 Agent dashboard | A view over `GET /api/agent-activity` and its summary. |
| #281 Multi-agent visualization | A join on `agent_type` and `root_id`, rendered as badges on existing chat and entity UI. |
| #277 Interrupt controls | Write `cancelled`, plus a cancellation check in the agent loop — `stopWhen: stepCountIs(MAX_AGENT_STEPS)` in `src/agents/base-agent.ts` is the natural interception point. |
| #276 Autonomy levels | Write `awaiting_approval` as a gate on write-capable tools; the status already exists. |
| #279 Guided flows | Parent/child linkage plus a flow definition. |

## Files

| Path | Role |
|---|---|
| `migrations/0036_agent_activity.sql` | Table and indexes. |
| `src/types/agent-activity.ts` | Statuses, action types, record and query shapes. |
| `src/lib/agent-activity-summary.ts` | Redaction, truncation, touched-id collection. |
| `src/dao/agent-activity-dao.ts` | Upsert, queries, counts, retention, stale-row sweep. |
| `src/services/agent-activity/agent-activity-recorder.ts` | Buffered writer and the `withActivityRecording` decorator. |
| `src/agents/base-agent.ts` | The one call site that makes every agent report. |
| `src/routes/agent-activity.ts` | Read API. |

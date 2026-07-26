# LLM batch processing (Anthropic Message Batches)

Queue-driven entity extraction can be routed through the [Anthropic Message
Batches API](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
instead of one synchronous request per chunk. Batch pricing is roughly half the
standard rate, and this workload already tolerates minutes of delay: the user
uploads a file and gets a notification when indexing completes.

Off by default. Set `LLM_BATCH_EXTRACTION_ENABLED=true` to turn it on.

## Why this needs a state machine

Anthropic allows a batch up to 24 hours; most finish within an hour. A Cloudflare
Worker invocation cannot wait that long, so "submit → poll → resume" cannot be
one async function. Instead:

1. A cron tick **submits** the current chunk window as one batch and records it
   in `llm_batch_jobs`. The discovery job stays queued.
2. Later ticks **poll** the batch. Still running → the job stays queued.
3. The tick that finds the batch `ended` **collects** the results and hands the
   payloads back to the extraction pipeline, which merges, dedupes, embeds and
   notifies exactly as it does for inline extraction.

The existing `*/5 * * * *` cron (`CRON_SCHEDULE_FAST`) drives all three.

### Polling is cheap on purpose

A polling tick calls `peekPendingBatch()` **before** entering the staging
pipeline, and requeues the job without going further if the batch is still
running. This is load-bearing, not an optimization: staging front-loads content
extraction plus 1–3 character-sheet-detection LLM calls before it ever plans
chunks. Reaching the batch seam through staging on every poll would repeat those
interactive calls once per tick for the life of the batch — easily enough to
cancel out the batch discount. A waiting tick costs one D1 read, one Anthropic
status GET, and one D1 write.

## Components

| Piece | File |
| --- | --- |
| Batch submission / poll / results client | `src/services/llm/anthropic-batch-provider.ts` |
| State machine + fallback policy | `src/services/llm/entity-extraction-batch-service.ts` |
| Feature flag, deadlines, timestamp parsing | `src/services/llm/llm-batch-config.ts` |
| Persistence for in-flight batches | `src/dao/llm-batch-job-dao.ts`, `migrations/0032_llm_batch_jobs.sql` |
| Seam into the extraction pipeline | `src/services/campaign/entity-extraction-batch-coordinator.ts` |
| Owning queue job | `src/services/campaign/library-entity-discovery-queue-service.ts` |

The synchronous path uses the AI SDK (`@ai-sdk/anthropic`), which has no batches
support, so the batch path uses the official `@anthropic-ai/sdk` — mainly for
decoding the JSONL results stream. It is imported lazily.

## The coordinator seam

Entity staging plans its chunks, then asks the coordinator what to do with them.
The coordinator returns one of three verdicts, and staging does the rest:

| Verdict | Staging behavior |
| --- | --- |
| `awaiting` | Return immediately with `awaitingBatch: true`, resume cursor unchanged. No model calls. |
| `ready` | Use the supplied payload per chunk. Chunks missing from the map fall through to an inline call. |
| `inline` | Extract every chunk inline — identical to the pre-batch behavior. |

This keeps batch ids, deadlines, and cron ticks out of the extraction pipeline,
and means everything downstream of extraction is shared by both paths.

## Fallback: batching never wedges indexing

Every failure resolves to inline extraction. There is no state in which a batch
problem stops a file from being indexed:

| Situation | Outcome |
| --- | --- |
| Flag off, or provider is not Anthropic | `inline` |
| `llm_batch_jobs` table missing (Worker ahead of its migration) | `inline` |
| Fewer than `LLM_BATCH_MIN_REQUESTS` chunks in the window | `inline` — batch overhead is not worth it |
| Per-user batch request budget exhausted | `inline` |
| Submit throws | Row marked `failed`, `inline` |
| Poll throws | Row marked `failed`, `inline` |
| Batch past `LLM_BATCH_DEADLINE_MINUTES` (default 180) | Batch canceled, row `expired`, `inline` |
| File content or chunk window changed since submit | Batch canceled, row `canceled`, `inline` |
| Some requests errored / expired / returned unparseable JSON | Only those chunks go inline; the rest use their batch results |
| Worker lost mid-submit | Row swept to `failed` by `cleanupStaleBatchJobs`, `inline` |

A partly-failed batch therefore costs only the requests that actually failed.

## Single-flight

A partial unique index on `(owner_kind, owner_key)` over non-terminal rows means
one pipeline job can have at most one batch in flight. Two concurrent cron ticks
cannot submit duplicate work: the losing insert is rejected and that tick runs
inline (or waits, if the winner is still submitting).

## Prompt caching

Every request in a batch shares a byte-identical instruction prefix, marked
`cache_control: ephemeral`; only the document chunk varies. The prefix is built
by the same helper the synchronous path uses
(`src/lib/llm-structured-output.ts`) so the two cannot drift — if they built
different prompts, a chunk could extract cleanly inline and fail in a batch, and
the batch→inline fallback would stop being a true fallback.

## Rate limits and spend

Batch requests draw on the org's `batchRequestsPerMinute` line, which is
separate from the interactive RPM that per-tier `qph`/`qpd` limits derive from
(`deriveBatchRequestBudget` in `src/config/anthropic-org-rate-budget.ts`). So
background indexing does not spend the budget a user's chat needs, and vice
versa.

Token caps still apply. On collect, spend is recorded once via
`recordBatchUsage`, which records token counts verbatim — including cache-write
and cache-read input tokens, or every request after the first would be
under-reported — with `queryCount: 0`, since the request volume was already
gated against the batch budget line.

## Retry accounting

Per-file retry caps (`retriesPerFilePerDay` / `retriesPerFilePerMonth`) count
**user-initiated retries of a file**, not model calls, so batching does not
change them. Waiting on a batch is neither progress nor failure: the discovery
job is requeued at the same cursor without touching `retry_count`, so a slow
batch never burns a job's retry budget.

## Progress UX

Chunks in one batch complete together, so `PROGRESS:a/b` cannot advance until
the batch lands — a correct-but-frozen bar reads as a stall. While a batch is in
flight, `queue_message` carries a `BATCH:<chunkCount>:<submittedAt>` marker
alongside the `PROGRESS` line, and the UI says how many chunks are queued for
batch processing (`LibraryEntityIndexingProgress`).

## Configuration

| Setting | Default | Meaning |
| --- | --- | --- |
| `LLM_BATCH_EXTRACTION_ENABLED` | off | Master switch. Anthropic provider only. |
| `LLM_BATCH_MIN_REQUESTS` | 2 | Below this, extract inline. |
| `LLM_BATCH_DEADLINE_MINUTES` | 180 | Abandon the batch and fall back after this. |
| `LLM_BATCH_SUBMITTING_TIMEOUT_MINUTES` | 15 | Sweep rows abandoned mid-submit. |

## Currently routed

Only **library entity discovery** — the largest queue-driven LLM consumer, and
the one the cron already resumes chunk-by-chunk. The coordinator interface is
generic, so other non-interactive paths named in issue #735 (file content
extraction, metadata generation, community summaries) can adopt it by supplying
a coordinator; they are not routed yet.

## Rollout

1. Apply migrations (`npm run migrate:dev` / `migrate:prod:apply`).
2. Set `LLM_BATCH_EXTRACTION_ENABLED=true`.
3. Watch the `[EntityExtractionBatch]` logs: `batch_submitted`,
   `batch_collected` (with `servedChunks` / `fallbackChunks`),
   `batch_deadline_exceeded`, `batch_budget_declined`.
4. To roll back, unset the flag. In-flight batches are collected or expire on
   their own; new work goes inline immediately.

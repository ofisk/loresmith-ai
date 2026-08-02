# LLM Result Cache

A content-addressed cache for expensive model results, so the same document is
never extracted twice.

`CommunitySummaryService.generateOrGetSummary` has always checked for an existing
summary before calling a model. That was the only place doing it. Re-uploading the
same PDF, adding a document to a second campaign, or retrying a failed index
re-paid full extraction cost on Sonnet 5 every time — nothing keyed a result by
its content. This closes that gap (issue #761, finding 8).

## What is cached

| Kind | Pipeline | Tier | Why it is worth caching |
|---|---|---|---|
| `entity_extraction` | Per-chunk entity extraction | `PIPELINE_STRUCTURED` (Sonnet 5) | The volume path — every chunk of every uploaded document |
| `character_sheet_detection` | Character-sheet detection | `ANALYSIS` (Haiku 4.5) | Runs on **every** upload, character sheet or not |
| `character_sheet_parse` | Character-sheet parsing | `SESSION_PLANNING` (Sonnet 5) | A full document in one call |

## The key

`cache_key` is a SHA-256 digest over `(namespace, kind, model, rendered prompt
prefix, per-call content)`. Three properties follow from that, and each of them
is the answer to a way this kind of cache usually goes wrong:

**There is no prompt-version constant to forget.** Issue #761 asks for a key over
`(model, prompt-version, chunk-content)`. A hand-maintained `PROMPT_VERSION = 3`
is a step someone eventually does not take, and a cache that silently serves
results from a superseded prompt is worse than no cache. Hashing the *rendered
prompt* means an instruction edit and a content edit invalidate by the same
mechanism.

**A tier change cannot serve the old model's output.** The resolved model id is
in the key, so moving a pipeline from Haiku to Sonnet misses rather than
returning what Haiku said.

**Components are hashed before being joined**, so no rearrangement of text across
the prompt/content boundary can collide — a plain `${prefix}|${content}` join
cannot promise that.

## The payload is campaign-independent

This is the property that makes the cache worth having, and it constrains *where*
the cache sits in the call.

For entity extraction the stored value is the validated model output, captured
**before** entity IDs are minted and scoped to a campaign. `mapExtractionPayload`
then re-mints them per campaign. So adding the same document to a second campaign
is a cache hit that still produces entities belonging to that campaign — not to
the one that paid for the extraction.

If the cache sat one layer higher, around the campaign-scoped result, it would
hit only on a literal re-upload into the same campaign, which is the rarer case.

## Every failure is a miss

Missing table, missing DB binding, a D1 error, a stored payload that no longer
parses — all of them fall through to the model. A cache that can break the
extraction pipeline is not worth having.

The table-not-yet-migrated window is real rather than hypothetical: merging to
`main` deploys the Worker automatically, while D1 migrations are applied
separately (see [Database Migrations](DATABASE_MIGRATIONS.md)). A Worker running
ahead of its migration pays full model cost and logs nothing alarming.

Two more deliberate non-behaviours:

- **A model failure is never cached.** When a call returns no usable output, the
  compute step returns `undefined` and nothing is stored, so the next attempt
  retries the model rather than inheriting one bad response permanently.
- **Oversized payloads are not stored.** Above `MAX_CACHEABLE_PAYLOAD_BYTES`
  (512 KB) the result is returned but not written; such a result is simply always
  recomputed.

## Storage and eviction

One D1 table, `llm_result_cache` (migration `0035_llm_result_cache.sql`), read
and written through `LlmResultCacheDAO`.

Age is the whole eviction policy: `pruneOldRows()` runs on the fast cron
alongside the LLM usage-log prunes and deletes rows older than 90 days. Nothing
more is needed — a cached value is always re-derivable, and a stale prompt's rows
are already unreachable because their key can never be derived again. They cost
storage, not correctness.

## Turning it off

On by default. Unlike the extraction chunk gate, a hit changes no model output —
it returns a payload an identical call already produced — so the conservative
default is on.

```
LLM_RESULT_CACHE_ENABLED=false
```

Anything other than `false` / `0` / `no` / `off` leaves it enabled. The switch
exists so the cache can be taken out during an incident without a deploy.

## Measuring what it saved

Set `LORESMITH_VERBOSE_LLM_USAGE=true` and read a `wrangler tail`:

| Event | Meaning |
|---|---|
| `llm_result_cache_hit` | A model call that did not happen. Carries `kind`, `model`, `payloadBytes`, `priorHits` |
| `llm_result_cache_miss` | A key with no stored row |
| `llm_result_cache_payload_too_large` | Result returned but not stored |

Entity-extraction telemetry also records `servedFromResultCache` on each
extraction count, so the extraction count and the spend log in
[Cost Attribution](COST_ATTRIBUTION.md) can be reconciled — without it a drop in
spend with a flat extraction count looks like a bug.

## Adding another call site

1. Take an `LlmResultCache` in the constructor, defaulting to
   `NOOP_LLM_RESULT_CACHE` so existing construction sites and unit tests are
   unchanged.
2. Add a `kind` to `LlmResultCacheKind`.
3. Wrap **only the model call** in `getOrCompute`, with `promptPrefix` set to the
   instruction text the call actually sends (render the prompt with empty content
   to get it) and `variablePart` set to the per-call content.
4. Return `undefined` from the compute step for a model failure, so it is not
   stored.

Pass the real cache at the call site with `await createLlmResultCache(env)`.

# Campaign Continuity Checker

Long campaigns accumulate contradictions. An NPC killed in session 12 gets
referenced as alive in session 19. A location's ruler changes without anyone
noting it. A house rule contradicts a ruling made three months ago.

LoreSmith already holds every input needed to catch this — session digests,
world state changes, the entity graph, timeline data, house rules. The
continuity checker is the feature that actually looks.

## What it detects

| Type | Signal | Data source |
| --- | --- | --- |
| `state_contradiction` | Entity recorded dead/destroyed/departed, then referenced as present | `world_state_changelog` × `session_digests` |
| `timeline_contradiction` | Session dates that run backwards against session numbers; an entity named before the session that introduces it | `session_digests`, `world_state_changelog` |
| `relationship_contradiction` | Allied factions later described as hostile (or the reverse) with no intervening session recording why | `world_state_changelog.relationship_updates` |
| `rules_contradiction` | A ruling recorded in a digest that clashes with an active house rule | `session_digests` × campaign rules |
| `dangling_thread` | A hook introduced and never picked up again. Not an error — a planning prompt | `session_digests.open_threads` |

## Design constraint: false positives destroy this feature

A checker that cries wolf gets switched off after one use. Fiction is *full* of
legitimate apparent contradictions — resurrection, disguise, unreliable
narrators, deliberate retcon, players being lied to by NPCs.

Five mechanisms enforce this:

1. **Restoration clears the mark.** `collectOpenStatusMarks` walks the changelog
   in order and *deletes* an entity's death mark when a later status reads
   "resurrected", "returned", "rebuilt", etc. Resurrections never reach a model.
2. **Both prompt tiers are biased toward silence.** They share an explicit list
   of innocent explanations (disguise, faked death, flashback, shared names,
   memorials) and are told that missing a real problem is cheaper than raising a
   false one.
3. **Every finding cites both sides.** `evidence` is `NOT NULL` and every
   candidate carries at least two entries with deep-linkable reference ids, so
   the GM adjudicates in seconds rather than investigating.
4. **Findings are questions, never errors.** *"Session 12 recorded Vane's death;
   session 19 references him. Intentional?"* A GM who deliberately faked a death
   should think the tool is sharp, not broken.
5. **Dismissals are permanent.** See below.

### Dismissals never resurface

Every candidate carries a `fingerprint` — a stable FNV-1a hash over the
normalized facts that produced it. `continuity_findings` has
`UNIQUE(campaign_id, fingerprint)` and inserts use `INSERT OR IGNORE`.

Re-detection therefore produces the same fingerprint and the insert is a no-op,
whatever the existing row's status. There is no separate dismissal list to keep
in sync. A scan also subtracts known fingerprints *before* spending a model
token, so dismissed findings cost nothing on later runs.

## Cost model

Naive implementation is combinatorial: every entity against every digest, over
history that only grows. Four things keep it bounded.

**Incremental by default.** `continuity_scan_state` holds a per-campaign
watermark. An incremental scan only treats sessions *newer* than the watermark
as the later side of a contradiction, so routine checks cost O(new sessions).
Full scans are explicit (`mode: "full"`).

**Narrow deterministically before calling a model.** All five detectors are pure
functions over an in-memory corpus loaded in three queries. Candidate volume
scales with *recorded state changes*, not entity count — an entity nobody ever
killed is never a candidate.

**Cheap tier triages, quality tier adjudicates.** Triage runs on
`PIPELINE_ANALYSIS` (Haiku on Anthropic) to shortlist; only survivors reach
`PIPELINE_STRUCTURED` (Sonnet). Dangling threads skip adjudication entirely —
they are planning prompts, not conflicts.

**Batched and capped.** Triage batches 12 candidates per call, adjudication 5.
`maxCandidates` (default 60) caps a single run; when it bites, the scan reports
`truncated: true` and says how many candidates went unreviewed rather than
silently pretending it covered everything.

## Architecture

```
src/services/continuity/
  continuity-corpus.ts                    load digests + changelog + graph (3 queries)
  continuity-text-utils.ts                name matching, token overlap, fingerprints
  continuity-vocabulary.ts                free-text status → coarse buckets
  detect-state-contradictions.ts          ─┐
  detect-relationship-contradictions.ts    │ deterministic detectors
  detect-timeline-contradictions.ts        │ (pure, no LLM, no I/O)
  detect-dangling-threads.ts               │
  detect-rules-contradictions.ts          ─┘
  continuity-adjudication-service.ts      triage (cheap) → adjudicate (quality)
  continuity-checker-service.ts           orchestration, dedupe, persistence
```

Flow:

```
loadContinuityCorpus
  → detectors                    (deterministic candidates)
  → subtract known fingerprints  (dismissal memory, free)
  → sort + cap                   (state > relationship > timeline > rules > threads)
  → triage        [Haiku]        (shortlist)
  → adjudicate    [Sonnet]       (verdict + confidence + phrasing)
  → filter by minConfidence
  → INSERT OR IGNORE
  → record watermark
```

## API

All endpoints are GM-only (`requireCanEdit`).

### `POST /campaigns/:campaignId/continuity/scan`

```jsonc
{
  "mode": "incremental",        // or "full"
  "types": ["state_contradiction"],   // optional subset
  "minConfidence": "medium",    // lowest confidence to persist
  "maxCandidates": 60
}
```

Returns a `scan` object with counts (`candidatesGenerated`,
`candidatesAlreadyKnown`, `findingsCreated`), `truncated`, `warnings` and the
findings created.

### `GET /campaigns/:campaignId/continuity/findings`

Query params: `status` (default `open`), `types`, `limit`, `minConfidence`
(**default `high`** — the report is trusted precisely because it is quiet).

### `POST /campaigns/:campaignId/continuity/findings/:findingId/resolve`

```jsonc
{
  "action": "confirm" | "dismiss" | "correct",
  "note": "Vane faked his death on purpose.",
  "correctedEntityId": "camp-1_vane",   // 'correct' only; defaults to the subject
  "correctedStatus": "alive",           // 'correct' only; required
  "campaignSessionId": 19
}
```

`correct` additionally writes a `world_state_changelog` entry setting the
corrected status, tagged `source: "continuity_correction"` with the originating
finding id. The fix therefore flows into the graph on the next rebuild rather
than living only in the report.

## Agent tools

Registered in `campaignContextToolsBundle` (GM-only — not in the player bundle):

- `checkCampaignContinuityTool` — run a scan
- `listContinuityFindingsTool` — list findings, high-confidence only by default
- `resolveContinuityFindingTool` — confirm / dismiss / correct

## Schema

`migrations/0029_continuity_findings.sql`

- `continuity_findings` — findings, with `UNIQUE(campaign_id, fingerprint)`
- `continuity_scan_state` — per-campaign incremental watermark

Both are mirrored in `scripts/d1/d1-bootstrap.sql`.

## Tuning

| Constant | File | Purpose |
| --- | --- | --- |
| `MIN_SINGLE_WORD_NAME_LENGTH`, `AMBIGUOUS_SINGLE_WORD_NAMES` | `continuity-text-utils.ts` | Reject collision-prone names before matching |
| `RESOLUTION_OVERLAP_THRESHOLD`, `MIN_SESSIONS_DANGLING` | `detect-dangling-threads.ts` | How forgiving thread-resolution detection is |
| `SUBJECT_OVERLAP_THRESHOLD` | `detect-rules-contradictions.ts` | When a digest ruling and a house rule count as the same subject |
| `TRIAGE_BATCH_SIZE`, `ADJUDICATION_BATCH_SIZE` | `continuity-adjudication-service.ts` | Cost/attention trade-off per model call |
| `DEFAULT_MAX_CANDIDATES` | `continuity-checker-service.ts` | Per-scan ceiling |

When tuning, prefer the direction that produces **fewer** findings. A missed
contradiction is a silent gap; a false one costs the GM's trust in the whole
report.

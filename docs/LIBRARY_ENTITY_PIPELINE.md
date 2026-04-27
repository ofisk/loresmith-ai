# Library entity pipeline

This document describes how **library-scoped entity discovery** works, how it ties to **campaign resources**, and how it differs from the removed per-campaign extraction queue.

## Goals

- **One extraction per library file** (`file_key`), stored in `library_entity_discovery` and related candidate/relationship tables.
- **Campaigns receive copies** of staged entities (same shard approval flow as before), not a separate LLM run per campaign.
- **Clear readiness**: the API and UI combine **ingestion** (chunking / indexing) and **discovery** so users know when a file is safe to rely on for campaign add and GraphRAG.

## Pipeline stages

1. **Upload and RAG indexing**  
   File lands in R2; the sync pipeline chunks content, writes `file_processing_chunks`, and eventually marks `file_metadata` / file status as completed for RAG.

2. **Library entity discovery**  
   `LibraryEntityDiscoveryQueueService` processes rows in `library_entity_discovery` (`pending` → `processing` → `complete` | `failed`). On success, candidates and relationships are stored library-side for later copy into campaigns.

3. **Campaign add**  
   When a resource is added to a campaign (`handleAddResourceToCampaign`):

   - If discovery is **complete** and the **content fingerprint** still matches the file, **`tryCopyLibraryEntitiesToCampaign`** inserts staged entities and relationships into that campaign.
   - Otherwise **`ensureLibraryDiscoveryAndMarkResourcePending`** queues discovery (if needed) and sets `campaign_resources.entity_copy_status` to `pending_library`.

4. **When discovery finishes**  
   **`processPendingCampaignEntityCopiesForFile`** finds campaign rows waiting on that `file_key`, runs the copy, then sets `entity_copy_status` to `complete` or `failed`.

## Campaign resource columns (migration 0022)

| Column | Purpose |
|--------|---------|
| `entity_copy_status` | `complete` — copy done or not needed; `pending_library` — waiting on library discovery/copy; `failed` — copy could not complete after discovery. |
| `pending_attribution` | Optional JSON for proposal/approval attribution while pending. |

The legacy **`entity_extraction_queue`** table was **removed** in `0022`; older migration files that still reference it rely on a minimal stub in `migrations/0000_entity_extraction_queue_legacy.sql` on empty databases. See [database/d1-indexes.md](./database/d1-indexes.md).

## API surface

### List library files (enriched)

**`GET /api/library/files`**

Each file may include:

- **`ingestion_chunk_stats`** — when present, counts for `file_processing_chunks` (`total`, `completed`, `failed`, `pending`, `processing`) for ingestion progress.
- **`library_pipeline_ready`** — `true` when the file is indexed and library discovery is `complete` (or discovery schema is unavailable, in which case the API treats the pipeline as ready for backward compatibility).
- **`library_entity_discovery_status`** / **`library_entity_discovery_queue_message`** — when a discovery row exists, status and optional queue/debug text.

### Retry discovery (library-owned file)

**`POST /api/library/retry-entity-pipeline`**

- **Body:** `{ "fileKey": "<library file key>" }`
- **Requires:** file exists for the user and indexing has **completed**.
- **Behavior:** clears staged library state for that file and **re-queues** discovery (`LibraryEntityDAO.resetForReExtraction` + queue processing). Use when discovery failed or you need a full re-run after fixing content.

### Retry from a campaign resource (legacy path name)

**`POST /api/campaigns/:campaignId/resource/:resourceId/retry-entity-extraction`**

- Still named “entity extraction” for URLs and clients, but implementation is **library-first**: re-queues library discovery and marks the resource **`pending_library`**, subject to **retry rate limits** (`RetryLimitService`).
- Returns **409** if discovery is already **in flight** for that file.

### Removed HTTP surface

There is **no** `POST /api/campaigns/:campaignId/entities/extract` route; extraction is not triggered per campaign from arbitrary text via that endpoint.

## Delete behavior

Deleting a **library** file does **not** delete **`campaign_resources`** rows in the same operation. Campaigns keep their resource references; operators may clean up separately if needed.

## Operations: failures, backoff, and escalation

Discovery failures are recorded on `library_entity_discovery` with retry metadata (`retry_count`, `next_retry_at`). After terminal failure, the queue service can hand off to **DLQ** / **support escalation** (see `library-entity-discovery-queue-service.ts` and `services/support/library-pipeline-support.ts`).

## Related code (starting points)

| Area | Location |
|------|----------|
| Queue + processing | `src/services/campaign/library-entity-discovery-queue-service.ts` |
| Copy into campaign | `src/services/campaign/library-entity-copy-to-campaign-service.ts` |
| Pending campaign rows | `src/services/campaign/pending-campaign-entity-copy.ts` |
| List files enrichment | `src/routes/upload.ts` (`handleGetFiles`) |
| Library retry handler | `src/routes/library.ts` (`handleRetryLibraryEntityPipeline`) |
| Campaign add + retry | `src/routes/campaigns.ts` |

## See also

- [File upload system](./FILE_UPLOAD_SYSTEM.md) — upload and processing entrypoints
- [GraphRAG integration](./GRAPHRAG_INTEGRATION.md) — how staged entities feed the graph
- [API reference](./API.md) — endpoint summary
- [D1 indexes](./database/d1-indexes.md) — tables and indexes

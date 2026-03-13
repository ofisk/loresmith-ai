# D1 database indexes

Reference for Cloudflare D1 (SQLite) tables, indexes, and hot query paths. See [issue #490](https://github.com/ofisk/loresmith-ai/issues/490) for context.

## D1 constraints

- **100 bound parameters per query**: DAOs batch `IN (...)` clauses to stay under this limit.
- **Entity relationships batch size**: 49 items max (2×N for `from_entity_id` + `to_entity_id` IN lists). See `RELATIONSHIPS_BATCH_SIZE` in [entity-dao.ts](../src/dao/entity-dao.ts).
- **Entity batch get**: `getEntitiesByIds` uses batches of ~49 IDs per query.

## Schema sources

- Base: [scripts/d1-bootstrap.sql](../scripts/d1-bootstrap.sql)
- Migrations: [migrations/](../migrations/) (0001–0015; 0014–0015 for performance indexes)

---

## Tables and indexes

### campaigns

| Index | Columns | Source |
|-------|---------|--------|
| PK | `id` | bootstrap |
| idx_campaigns_username | `username` | 0014 |
| idx_campaigns_username_updated | `username`, `updated_at DESC` | 0014 |

**Hot paths**: User campaign listing (`WHERE username = ? ORDER BY updated_at DESC`), campaign by ID.

---

### campaign_members

| Index | Columns | Source |
|-------|---------|--------|
| PK | `campaign_id`, `username` | 0001 |
| idx_campaign_members_username | `username` | 0001 |

**Hot paths**: Lookup by campaign+user, list members by campaign.

---

### campaign_resources

| Index | Columns | Source |
|-------|---------|--------|
| PK | `id` | bootstrap |
| idx_campaign_resources_campaign | `campaign_id` | 0014 |
| idx_campaign_resources_campaign_file | `campaign_id`, `file_key` | 0014 |

**Hot paths**: List resources by campaign, lookup by campaign+file_key.

---

### campaign_share_links

| Index | Columns | Source |
|-------|---------|--------|
| PK | `token` | 0001 |
| idx_campaign_share_links_campaign_id | `campaign_id` | 0001 |

---

### campaign_resource_proposals

| Index | Columns | Source |
|-------|---------|--------|
| PK | `id` | 0001 |
| idx_campaign_resource_proposals_campaign_id | `campaign_id` | 0001 |
| idx_campaign_resource_proposals_proposed_by | `proposed_by` | 0001 |

---

### campaign_player_character_claims

| Index | Columns | Source |
|-------|---------|--------|
| PK | `campaign_id`, `username` | 0004 |
| idx_pc_claims_campaign_entity | `campaign_id`, `entity_id` (UNIQUE) | 0004 |
| idx_pc_claims_campaign_username | `campaign_id`, `username` | 0004 |

---

### campaign_session_plan_readouts

| Index | Columns | Source |
|-------|---------|--------|
| PK | `campaign_id`, `next_session_number` | 0010 |

---

### campaign_checklist_status

| Index | Columns | Source |
|-------|---------|--------|
| PK | `id` | bootstrap |
| UNIQUE | `campaign_id`, `checklist_item_key` | bootstrap |
| idx_checklist_status_campaign | `campaign_id` | bootstrap |
| idx_checklist_status_key | `checklist_item_key` | bootstrap |
| idx_checklist_status_status | `status` | bootstrap |

---

### campaign_context, campaign_characters, campaign_planning_sessions, campaign_context_chunks

No additional indexes. Filtered by `campaign_id` or `context_id`; consider composite indexes if these tables grow.

---

### file_metadata

| Index | Columns | Source |
|-------|---------|--------|
| PK | `file_key` | bootstrap |
| idx_file_metadata_username | `username` | 0014 |
| idx_file_metadata_username_status | `username`, `status` | 0014 |
| idx_file_metadata_status_updated | `status`, `updated_at` | 0014 |

**Hot paths**: User file listing, stuck-file cleanup (`status IN (...) AND updated_at < ?`).

---

### file_processing_chunks

| Index | Columns | Source |
|-------|---------|--------|
| PK | `id` | bootstrap |
| idx_file_processing_chunks_file_key | `file_key` | bootstrap |
| idx_file_processing_chunks_status | `status` | bootstrap |

---

### file_retry_usage

| Index | Columns | Source |
|-------|---------|--------|
| PK | `username`, `file_key`, `retry_date` | 0008 |
| idx_file_retry_usage_lookup | `username`, `file_key` | 0008 |

---

### entities

| Index | Columns | Source |
|-------|---------|--------|
| PK | `id` | bootstrap |
| idx_entities_campaign_source | `campaign_id`, `source_id` | 0006 |
| idx_entities_campaign_shard_status_updated | `campaign_id`, `shard_status`, `updated_at DESC` | 0006 |

**Hot paths**: `WHERE id IN (...)`, `WHERE campaign_id = ?` (+ filters). PK covers batch get; composite covers list-by-campaign.

---

### entity_relationships

| Index | Columns | Source |
|-------|---------|--------|
| PK | `id` | bootstrap |
| UNIQUE | `from_entity_id`, `to_entity_id`, `relationship_type` | bootstrap |
| idx_entity_relationships_from | `from_entity_id` | 0014 |
| idx_entity_relationships_to | `to_entity_id` | 0014 |
| idx_entity_relationships_campaign_type | `campaign_id`, `relationship_type` | 0014 |

**Hot paths**: Batch lookup by entity IDs (uses UNION with from/to indexes), get by campaign+type.

---

### entity_deduplication_pending

| Index | Columns | Source |
|-------|---------|--------|
| PK | `id` | bootstrap |
| idx_entity_dedup_campaign_status | `campaign_id`, `status` | 0014 |

---

### entity_extraction_queue

| Index | Columns | Source |
|-------|---------|--------|
| UNIQUE | `campaign_id`, `resource_id` | bootstrap |
| idx_entity_extraction_queue_status | `status` | bootstrap |
| idx_entity_extraction_queue_next_retry | `next_retry_at` | bootstrap |
| idx_entity_extraction_queue_campaign | `campaign_id` | bootstrap |
| idx_entity_extraction_queue_status_retry | `status`, `next_retry_at` | 0014 |
| idx_entity_extraction_queue_status_updated | `status`, `updated_at` | 0014 |

**Hot paths**: Pending/rate-limited items, stuck processing items.

---

### entity_importance

| Index | Columns | Source |
|-------|---------|--------|
| PK | `entity_id` | bootstrap |
| idx_importance_campaign | `campaign_id` | bootstrap |
| idx_importance_score | `importance_score DESC` | bootstrap |

---

### shard_registry

| Index | Columns | Source |
|-------|---------|--------|
| PK | `shard_id` | bootstrap |
| idx_shard_registry_campaign | `campaign_id` | 0014 |
| idx_shard_registry_resource | `resource_id` | 0014 |
| idx_shard_registry_campaign_status | `campaign_id`, `status` | 0014 |

---

### communities

| Index | Columns | Source |
|-------|---------|--------|
| PK | `id` | bootstrap |
| idx_communities_campaign | `campaign_id` | 0014 |
| idx_communities_parent | `parent_community_id` | 0014 |

---

### community_entities

| Index | Columns | Source |
|-------|---------|--------|
| PK | `community_id`, `entity_id` | bootstrap |
| idx_community_entities_community_id | `community_id` | bootstrap |
| idx_community_entities_entity_id | `entity_id` | bootstrap |

---

### community_summaries

| Index | Columns | Source |
|-------|---------|--------|
| idx_summaries_community | `community_id` | bootstrap |
| idx_summaries_level | `level` | bootstrap |
| idx_summaries_name | `name` | bootstrap |

---

### changelog_archive_metadata

| Index | Columns | Source |
|-------|---------|--------|
| PK | `id` | bootstrap |
| UNIQUE | `archive_key` | bootstrap |
| idx_archive_campaign | `campaign_id` | bootstrap |
| idx_archive_rebuild | `rebuild_id` | bootstrap |
| idx_archive_session_range | `campaign_id`, `session_range_min`, `session_range_max` | bootstrap |
| idx_archive_timestamp_range | `campaign_id`, `timestamp_range_from`, `timestamp_range_to` | bootstrap |

---

### world_state_changelog

| Index | Columns | Source |
|-------|---------|--------|
| idx_changelog_campaign | `campaign_id` | bootstrap |
| idx_changelog_campaign_session | `campaign_session_id` | bootstrap |
| idx_changelog_timestamp | `timestamp` | bootstrap |
| idx_changelog_applied | `applied_to_graph` | bootstrap |

---

### session_digests

| Index | Columns | Source |
|-------|---------|--------|
| UNIQUE | `campaign_id`, `session_number` | bootstrap |
| idx_digests_campaign | `campaign_id` | bootstrap |
| idx_digests_session | `campaign_id`, `session_number` | bootstrap |
| idx_digests_date | `session_date` | bootstrap |
| idx_digests_status | `campaign_id`, `status` | bootstrap |
| idx_digests_template | `template_id` | bootstrap |
| idx_digests_source_type | `source_type` | bootstrap |

---

### session_digest_templates

| Index | Columns | Source |
|-------|---------|--------|
| idx_digest_templates_campaign | `campaign_id` | bootstrap |

---

### planning_tasks

| Index | Columns | Source |
|-------|---------|--------|
| idx_planning_tasks_campaign | `campaign_id` | bootstrap |
| idx_planning_tasks_status | `status` | bootstrap |
| idx_planning_tasks_created_at | `created_at` | bootstrap |

---

### rebuild_status

| Index | Columns | Source |
|-------|---------|--------|
| idx_rebuild_status_campaign | `campaign_id` | bootstrap |
| idx_rebuild_status_status | `status` | bootstrap |
| idx_rebuild_status_created | `created_at` | bootstrap |

---

### graphrag_telemetry

| Index | Columns | Source |
|-------|---------|--------|
| idx_telemetry_campaign | `campaign_id` | bootstrap |
| idx_telemetry_type | `metric_type` | bootstrap |
| idx_telemetry_date | `recorded_at` | bootstrap |

---

### llm_usage_log

| Index | Columns | Source |
|-------|---------|--------|
| idx_llm_usage_username_time | `username`, `created_at` | 0003 |

---

### message_history

| Index | Columns | Source |
|-------|---------|--------|
| idx_message_history_session_id | `session_id` | bootstrap |
| idx_message_history_username | `username` | bootstrap |
| idx_message_history_campaign_id | `campaign_id` | bootstrap |
| idx_message_history_created_at | `created_at` | bootstrap |
| idx_message_history_role | `role` | bootstrap |
| idx_message_history_session_created | `session_id`, `created_at` | bootstrap |

---

### users, email_verification_tokens

| Table | Index | Columns |
|-------|-------|---------|
| users | idx_users_username | `username` |
| users | idx_users_email | `email` |
| email_verification_tokens | idx_email_verification_tokens_username | `username` |
| email_verification_tokens | idx_email_verification_tokens_expires_at | `expires_at` |

---

### subscriptions, user_monthly_usage, user_indexing_credits, user_free_tier_usage

| Table | Indexes |
|-------|---------|
| subscriptions | idx_subscriptions_username, idx_subscriptions_stripe_customer, idx_subscriptions_stripe_subscription |
| user_monthly_usage | idx_user_monthly_usage_username |
| user_indexing_credits | idx_user_indexing_credits_username |
| user_free_tier_usage | idx_user_free_tier_usage_username |

---

### resource_add_log

| Index | Columns |
|-------|---------|
| idx_resource_add_log_lookup | `username`, `campaign_id`, `created_at` |

---

### graph_dirty_entities, graph_dirty_relationships, graph_rebuild_job_dedupe

| Table | Index | Source |
|-------|-------|--------|
| graph_dirty_entities | idx_graph_dirty_entities_campaign_marked | 0005 |
| graph_dirty_relationships | idx_graph_dirty_relationships_campaign_marked | 0005 |
| graph_dirty_relationships | idx_graph_dirty_relationships_campaign_from | 0015 |
| graph_dirty_relationships | idx_graph_dirty_relationships_campaign_to | 0015 |
| graph_rebuild_job_dedupe | idx_graph_rebuild_job_dedupe_campaign_status | 0005 |

**Hot paths**: `clearDirtyForEntities` uses two DELETEs (campaign_id + from_entity_id IN, campaign_id + to_entity_id IN) instead of OR for index use.

---

### entity_search_cache_version

| Index | Columns |
|-------|---------|
| PK | `campaign_id` |

---

### character_sheets, file_chunks, sync_queue, user_openai_keys, user_notifications

No additional indexes beyond PKs. Add campaign_id or username indexes if these tables become hot.

---

## Relationship query pattern: OR vs UNION

`getRelationshipsForEntities` in [entity-dao.ts](../src/dao/entity-dao.ts) previously used:

```sql
WHERE (from_entity_id IN (...) OR to_entity_id IN (...))
```

SQLite often cannot use indexes efficiently with `OR` across different columns. The refactored pattern uses `UNION`:

```sql
SELECT * FROM entity_relationships WHERE from_entity_id IN (?)
UNION
SELECT * FROM entity_relationships WHERE to_entity_id IN (?)
ORDER BY created_at DESC
```

Each branch can use `idx_entity_relationships_from` or `idx_entity_relationships_to`. `UNION` deduplicates (a relationship matching both branches appears once).

---

## graph_dirty_relationships: OR vs two DELETEs

`clearDirtyForEntities` in [graph-rebuild-dirty-dao.ts](../src/dao/graph-rebuild-dirty-dao.ts) previously used:

```sql
WHERE campaign_id = ? AND (from_entity_id IN (...) OR to_entity_id IN (...))
```

Same OR pitfall. Refactored to two DELETEs in a batch, each using `idx_graph_dirty_relationships_campaign_from` or `idx_graph_dirty_relationships_campaign_to`.

---

## entity_dao listEntities: json_each for entity ID filtering

`listEntitiesByCampaign` with `options.entityIds` uses:

```sql
id IN (SELECT value FROM json_each(?))
```

with `JSON.stringify(options.entityIds)` bound. This avoids the 100-param limit when filtering by many IDs. Trade-off: verify with `EXPLAIN QUERY PLAN`; if the plan shows full scan on `entities`, consider switching to batched `IN (...)` (max ~49 IDs per batch) like `getEntitiesByIds`. Run the [EXPLAIN audit](../../scripts/d1-explain-audit.sh) to check.

---

## Verifying index usage

Run the [EXPLAIN audit script](../../scripts/d1-explain-audit.sh) to verify query plans:

```bash
npm run d1:explain-audit           # defaults to dev (remote)
./scripts/d1-explain-audit.sh local
./scripts/d1-explain-audit.sh dev
```

Output is written to `docs/database/explain-results.md`. Run `npm run migrate:dev` (or `migrate:bootstrap:dev` + `migrate:dev`) before the audit so migrations 0014 and 0015 indexes are present.

import { BaseDAOClass } from "./base-dao";

export interface DirtyRelationshipKey {
	fromEntityId: string;
	toEntityId: string;
	relationshipType: string;
}

export interface DirtySnapshot {
	entityIds: string[];
	relationships: DirtyRelationshipKey[];
}

export interface GraphRebuildDedupeRecord {
	campaignId: string;
	idempotencyKey: string;
	rebuildMode: "incremental" | "full";
	status: "pending" | "running" | "completed" | "failed";
	lastRebuildId?: string;
	payload?: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
}

export class GraphRebuildDirtyDAO extends BaseDAOClass {
	private static readonly IN_CLAUSE_CHUNK_SIZE = 40;

	async markEntitiesDirty(
		campaignId: string,
		entityIds: string[],
		reason?: string
	): Promise<void> {
		if (entityIds.length === 0) {
			return;
		}
		const deduped = Array.from(new Set(entityIds));
		const stmt = this.db.prepare(`
      INSERT INTO graph_dirty_entities (campaign_id, entity_id, dirty_reason, marked_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(campaign_id, entity_id) DO UPDATE SET
        dirty_reason = excluded.dirty_reason,
        marked_at = datetime('now')
    `);
		await this.db.batch(
			deduped.map((entityId) => stmt.bind(campaignId, entityId, reason ?? null))
		);
	}

	async markRelationshipsDirty(
		campaignId: string,
		relationships: DirtyRelationshipKey[],
		reason?: string
	): Promise<void> {
		if (relationships.length === 0) {
			return;
		}
		const stmt = this.db.prepare(`
      INSERT INTO graph_dirty_relationships (
        campaign_id,
        from_entity_id,
        to_entity_id,
        relationship_type,
        dirty_reason,
        marked_at
      )
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(campaign_id, from_entity_id, to_entity_id, relationship_type) DO UPDATE SET
        dirty_reason = excluded.dirty_reason,
        marked_at = datetime('now')
    `);
		await this.db.batch(
			relationships.map((rel) =>
				stmt.bind(
					campaignId,
					rel.fromEntityId,
					rel.toEntityId,
					rel.relationshipType,
					reason ?? null
				)
			)
		);
	}

	async getDirtySnapshot(campaignId: string): Promise<DirtySnapshot> {
		const [entityRows, relationshipRows] = await Promise.all([
			this.queryAll<{ entity_id: string }>(
				`SELECT entity_id FROM graph_dirty_entities WHERE campaign_id = ?`,
				[campaignId]
			),
			this.queryAll<{
				from_entity_id: string;
				to_entity_id: string;
				relationship_type: string;
			}>(
				`SELECT from_entity_id, to_entity_id, relationship_type
         FROM graph_dirty_relationships
         WHERE campaign_id = ?`,
				[campaignId]
			),
		]);

		return {
			entityIds: entityRows.map((row) => row.entity_id),
			relationships: relationshipRows.map((row) => ({
				fromEntityId: row.from_entity_id,
				toEntityId: row.to_entity_id,
				relationshipType: row.relationship_type,
			})),
		};
	}

	async clearDirtyForCampaign(campaignId: string): Promise<void> {
		await Promise.all([
			this.execute(`DELETE FROM graph_dirty_entities WHERE campaign_id = ?`, [
				campaignId,
			]),
			this.execute(
				`DELETE FROM graph_dirty_relationships WHERE campaign_id = ?`,
				[campaignId]
			),
		]);
	}

	async clearDirtyForEntities(
		campaignId: string,
		entityIds: string[]
	): Promise<void> {
		if (entityIds.length === 0) {
			return;
		}
		const deduped = Array.from(new Set(entityIds));
		for (
			let i = 0;
			i < deduped.length;
			i += GraphRebuildDirtyDAO.IN_CLAUSE_CHUNK_SIZE
		) {
			const chunk = deduped.slice(
				i,
				i + GraphRebuildDirtyDAO.IN_CLAUSE_CHUNK_SIZE
			);
			const placeholders = chunk.map(() => "?").join(", ");
			await this.execute(
				`DELETE FROM graph_dirty_entities
         WHERE campaign_id = ? AND entity_id IN (${placeholders})`,
				[campaignId, ...chunk]
			);
			await this.execute(
				`DELETE FROM graph_dirty_relationships
         WHERE campaign_id = ?
           AND (from_entity_id IN (${placeholders}) OR to_entity_id IN (${placeholders}))`,
				[campaignId, ...chunk, ...chunk]
			);
		}
	}

	async getTwoHopNeighborhood(
		campaignId: string,
		seedEntityIds: string[],
		radius = 2
	): Promise<{ entityIds: string[]; edgeCount: number }> {
		if (seedEntityIds.length === 0) {
			return { entityIds: [], edgeCount: 0 };
		}
		const relationships = await this.queryAll<{
			from_entity_id: string;
			to_entity_id: string;
			metadata: string | null;
		}>(
			`SELECT from_entity_id, to_entity_id, metadata
       FROM entity_relationships
       WHERE campaign_id = ?`,
			[campaignId]
		);

		const adjacency = new Map<string, Set<string>>();
		for (const rel of relationships) {
			const rejected = this.relationshipIsIgnored(rel.metadata);
			if (rejected) {
				continue;
			}
			if (!adjacency.has(rel.from_entity_id)) {
				adjacency.set(rel.from_entity_id, new Set());
			}
			if (!adjacency.has(rel.to_entity_id)) {
				adjacency.set(rel.to_entity_id, new Set());
			}
			adjacency.get(rel.from_entity_id)!.add(rel.to_entity_id);
			adjacency.get(rel.to_entity_id)!.add(rel.from_entity_id);
		}

		const visited = new Set<string>(seedEntityIds);
		let frontier = new Set<string>(seedEntityIds);
		for (let depth = 0; depth < radius; depth++) {
			const next = new Set<string>();
			for (const entityId of frontier) {
				const neighbors = adjacency.get(entityId);
				if (!neighbors) continue;
				for (const neighbor of neighbors) {
					if (!visited.has(neighbor)) {
						visited.add(neighbor);
						next.add(neighbor);
					}
				}
			}
			if (next.size === 0) {
				break;
			}
			frontier = next;
		}

		let edgeCount = 0;
		for (const rel of relationships) {
			if (
				visited.has(rel.from_entity_id) &&
				visited.has(rel.to_entity_id) &&
				!this.relationshipIsIgnored(rel.metadata)
			) {
				edgeCount++;
			}
		}

		return {
			entityIds: Array.from(visited),
			edgeCount,
		};
	}

	async getExistingDedupeJob(
		campaignId: string,
		idempotencyKey: string
	): Promise<GraphRebuildDedupeRecord | null> {
		const row = await this.queryFirst<{
			campaign_id: string;
			idempotency_key: string;
			rebuild_mode: "incremental" | "full";
			status: "pending" | "running" | "completed" | "failed";
			last_rebuild_id: string | null;
			payload: string | null;
			created_at: string;
			updated_at: string;
		}>(
			`SELECT *
       FROM graph_rebuild_job_dedupe
       WHERE campaign_id = ? AND idempotency_key = ?`,
			[campaignId, idempotencyKey]
		);
		if (!row) {
			return null;
		}
		return {
			campaignId: row.campaign_id,
			idempotencyKey: row.idempotency_key,
			rebuildMode: row.rebuild_mode,
			status: row.status,
			lastRebuildId: row.last_rebuild_id ?? undefined,
			payload: row.payload
				? (this.safeParseJson(row.payload) as Record<string, unknown>)
				: undefined,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
	}

	async upsertDedupeJob(input: {
		campaignId: string;
		idempotencyKey: string;
		rebuildMode: "incremental" | "full";
		status: "pending" | "running" | "completed" | "failed";
		lastRebuildId?: string;
		payload?: Record<string, unknown>;
	}): Promise<void> {
		await this.execute(
			`INSERT INTO graph_rebuild_job_dedupe (
          campaign_id, idempotency_key, rebuild_mode, status, last_rebuild_id, payload, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(campaign_id, idempotency_key) DO UPDATE SET
          rebuild_mode = excluded.rebuild_mode,
          status = excluded.status,
          last_rebuild_id = excluded.last_rebuild_id,
          payload = excluded.payload,
          updated_at = datetime('now')`,
			[
				input.campaignId,
				input.idempotencyKey,
				input.rebuildMode,
				input.status,
				input.lastRebuildId ?? null,
				input.payload ? JSON.stringify(input.payload) : null,
			]
		);
	}

	private relationshipIsIgnored(metadataRaw: string | null): boolean {
		if (!metadataRaw) {
			return false;
		}
		try {
			const metadata = JSON.parse(metadataRaw) as Record<string, unknown>;
			return metadata.ignored === true || metadata.rejected === true;
		} catch (_error) {
			return false;
		}
	}

	private safeParseJson(value: string): unknown {
		try {
			return JSON.parse(value);
		} catch (_error) {
			return null;
		}
	}
}

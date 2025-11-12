import { BaseDAOClass } from "./base-dao";

// Raw row shape returned directly from D1 queries against the `entities` table.
// All fields mirror the database column names and use snake_case to match D1 results.
export interface EntityRecord {
  id: string;
  campaign_id: string;
  entity_type: string;
  name: string;
  content: string | null;
  metadata: string | null;
  confidence: number | null;
  source_type: string | null;
  source_id: string | null;
  embedding_id: string | null;
  created_at: string;
  updated_at: string;
}

// Normalized entity object exposed to the rest of the application. Uses camelCase,
// parses JSON fields to richer types, and hides DB-specific implementation details.
export interface Entity {
  id: string;
  campaignId: string;
  entityType: string;
  name: string;
  content?: unknown;
  metadata?: unknown;
  confidence?: number;
  sourceType?: string | null;
  sourceId?: string | null;
  embeddingId?: string | null;
  createdAt: string;
  updatedAt: string;
}

// Payload required when inserting a brand-new entity into the database. Consumers
// provide campaign + entity metadata, while timestamps are handled automatically.
export interface CreateEntityInput {
  id: string;
  campaignId: string;
  entityType: string;
  name: string;
  content?: unknown;
  metadata?: unknown;
  confidence?: number | null;
  sourceType?: string | null;
  sourceId?: string | null;
  embeddingId?: string | null;
}

// Partial payload for updates to an existing entity. Only supplied fields are
// persisted, allowing targeted updates without overwriting other values.
export interface UpdateEntityInput {
  name?: string;
  content?: unknown;
  metadata?: unknown;
  confidence?: number | null;
  sourceType?: string | null;
  sourceId?: string | null;
  embeddingId?: string | null;
}

// Raw row structure for the `entity_relationships` table. Matches the D1 schema
// exactly and is primarily used internally before normalization.
export interface EntityRelationshipRecord {
  id: string;
  campaign_id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  metadata: string | null;
  created_at: string;
}

// Application-facing relationship shape with camelCase keys and parsed metadata.
// Returned by DAO helpers when listing relationships for an entity/campaign.
export interface EntityRelationship {
  id: string;
  campaignId: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType: string;
  metadata?: unknown;
  createdAt: string;
}

// Parameters required to create a new directional relationship between two entities.
// The caller is responsible for providing a unique ID (usually crypto.randomUUID()).
export interface CreateEntityRelationshipInput {
  id: string;
  campaignId: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType: string;
  metadata?: unknown;
}

// Lightweight representation used by traversal helpers (e.g. breadth-first search)
// to expose nearby entities and relationship metadata up to a requested depth.
export interface EntityNeighbor {
  entityId: string;
  depth: number;
  relationshipType: string;
  name: string;
  entityType: string;
}

export interface EntityDeduplicationRecord {
  id: string;
  campaign_id: string;
  new_entity_id: string;
  potential_duplicate_ids: string;
  similarity_scores: string;
  status: string;
  user_decision: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface EntityDeduplicationEntry {
  id: string;
  campaignId: string;
  newEntityId: string;
  potentialDuplicateIds: string[];
  similarityScores: number[];
  status: string;
  userDecision?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

export interface CreateEntityDeduplicationInput {
  id: string;
  campaignId: string;
  newEntityId: string;
  potentialDuplicateIds: string[];
  similarityScores: number[];
  status?: string;
  userDecision?: string | null;
}

export interface UpdateEntityDeduplicationInput {
  status?: string;
  userDecision?: string | null;
  resolvedAt?: string | null;
}

export class EntityDAO extends BaseDAOClass {
  async createEntity(entity: CreateEntityInput): Promise<void> {
    const sql = `
      INSERT INTO entities (
        id,
        campaign_id,
        entity_type,
        name,
        content,
        metadata,
        confidence,
        source_type,
        source_id,
        embedding_id,
        created_at,
        updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `;

    await this.execute(sql, [
      entity.id,
      entity.campaignId,
      entity.entityType,
      entity.name,
      entity.content ? JSON.stringify(entity.content) : null,
      entity.metadata ? JSON.stringify(entity.metadata) : null,
      entity.confidence ?? null,
      entity.sourceType ?? null,
      entity.sourceId ?? null,
      entity.embeddingId ?? null,
    ]);
  }

  async updateEntity(
    entityId: string,
    updates: UpdateEntityInput
  ): Promise<void> {
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      setClauses.push("name = ?");
      values.push(updates.name);
    }

    if (updates.content !== undefined) {
      setClauses.push("content = ?");
      values.push(updates.content ? JSON.stringify(updates.content) : null);
    }

    if (updates.metadata !== undefined) {
      setClauses.push("metadata = ?");
      values.push(updates.metadata ? JSON.stringify(updates.metadata) : null);
    }

    if (updates.confidence !== undefined) {
      setClauses.push("confidence = ?");
      values.push(updates.confidence);
    }

    if (updates.sourceType !== undefined) {
      setClauses.push("source_type = ?");
      values.push(updates.sourceType);
    }

    if (updates.sourceId !== undefined) {
      setClauses.push("source_id = ?");
      values.push(updates.sourceId);
    }

    if (updates.embeddingId !== undefined) {
      setClauses.push("embedding_id = ?");
      values.push(updates.embeddingId);
    }

    if (setClauses.length === 0) {
      return;
    }

    const sql = `
      UPDATE entities
      SET ${setClauses.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    values.push(entityId);
    await this.execute(sql, values);
  }

  async getEntityById(entityId: string): Promise<Entity | null> {
    const sql = `SELECT * FROM entities WHERE id = ?`;
    const record = await this.queryFirst<EntityRecord>(sql, [entityId]);
    return record ? this.mapEntityRecord(record) : null;
  }

  async listEntitiesByCampaign(
    campaignId: string,
    options: { entityType?: string; limit?: number; offset?: number } = {}
  ): Promise<Entity[]> {
    const conditions = ["campaign_id = ?"];
    const params: any[] = [campaignId];

    if (options.entityType) {
      conditions.push("entity_type = ?");
      params.push(options.entityType);
    }

    let sql = `
      SELECT * FROM entities
      WHERE ${conditions.join(" AND ")}
      ORDER BY updated_at DESC
    `;

    if (typeof options.limit === "number") {
      sql += " LIMIT ?";
      params.push(options.limit);
    }

    if (typeof options.offset === "number") {
      sql += " OFFSET ?";
      params.push(options.offset);
    }

    const records = await this.queryAll<EntityRecord>(sql, params);
    return records.map((record) => this.mapEntityRecord(record));
  }

  async deleteEntity(entityId: string): Promise<void> {
    await this.execute(
      "DELETE FROM entity_relationships WHERE source_entity_id = ? OR target_entity_id = ?",
      [entityId, entityId]
    );
    await this.execute("DELETE FROM entities WHERE id = ?", [entityId]);
  }

  async createRelationship(
    relationship: CreateEntityRelationshipInput
  ): Promise<void> {
    const sql = `
      INSERT INTO entity_relationships (
        id,
        campaign_id,
        source_entity_id,
        target_entity_id,
        relationship_type,
        metadata,
        created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
      )
    `;

    await this.execute(sql, [
      relationship.id,
      relationship.campaignId,
      relationship.sourceEntityId,
      relationship.targetEntityId,
      relationship.relationshipType,
      relationship.metadata ? JSON.stringify(relationship.metadata) : null,
    ]);
  }

  async deleteRelationship(relationshipId: string): Promise<void> {
    await this.execute("DELETE FROM entity_relationships WHERE id = ?", [
      relationshipId,
    ]);
  }

  async getRelationshipsForEntity(
    entityId: string
  ): Promise<EntityRelationship[]> {
    const sql = `
      SELECT * FROM entity_relationships
      WHERE source_entity_id = ? OR target_entity_id = ?
      ORDER BY created_at DESC
    `;
    const records = await this.queryAll<EntityRelationshipRecord>(sql, [
      entityId,
      entityId,
    ]);
    return records.map((record) => this.mapRelationshipRecord(record));
  }

  async getNeighbors(
    campaignId: string,
    entityId: string,
    maxDepth: number = 1
  ): Promise<EntityNeighbor[]> {
    if (maxDepth < 1) {
      return [];
    }

    const sql = `
      WITH RECURSIVE neighbor_tree AS (
        SELECT
          er.source_entity_id,
          er.target_entity_id,
          er.relationship_type,
          1 AS depth
        FROM entity_relationships er
        WHERE er.campaign_id = ? AND er.source_entity_id = ?
        UNION ALL
        SELECT
          er.source_entity_id,
          er.target_entity_id,
          er.relationship_type,
          nt.depth + 1 AS depth
        FROM entity_relationships er
        INNER JOIN neighbor_tree nt ON er.source_entity_id = nt.target_entity_id
        WHERE er.campaign_id = ? AND nt.depth < ?
      )
      SELECT
        nt.target_entity_id AS entity_id,
        nt.relationship_type,
        nt.depth,
        e.name,
        e.entity_type
      FROM neighbor_tree nt
      INNER JOIN entities e ON e.id = nt.target_entity_id
      ORDER BY nt.depth, e.name
    `;

    const records = await this.queryAll<{
      entity_id: string;
      relationship_type: string;
      depth: number;
      name: string;
      entity_type: string;
    }>(sql, [campaignId, entityId, campaignId, maxDepth]);

    return records.map((row) => ({
      entityId: row.entity_id,
      relationshipType: row.relationship_type,
      depth: row.depth,
      name: row.name,
      entityType: row.entity_type,
    }));
  }

  mapEntityRecord(record: EntityRecord): Entity {
    return {
      id: record.id,
      campaignId: record.campaign_id,
      entityType: record.entity_type,
      name: record.name,
      content: record.content ? this.safeParseJson(record.content) : undefined,
      metadata: record.metadata
        ? this.safeParseJson(record.metadata)
        : undefined,
      confidence: record.confidence ?? undefined,
      sourceType: record.source_type,
      sourceId: record.source_id,
      embeddingId: record.embedding_id,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
  }

  mapRelationshipRecord(record: EntityRelationshipRecord): EntityRelationship {
    return {
      id: record.id,
      campaignId: record.campaign_id,
      sourceEntityId: record.source_entity_id,
      targetEntityId: record.target_entity_id,
      relationshipType: record.relationship_type,
      metadata: record.metadata
        ? this.safeParseJson(record.metadata)
        : undefined,
      createdAt: record.created_at,
    };
  }

  private safeParseJson(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch (_error) {
      return undefined;
    }
  }

  async createDeduplicationEntry(
    entry: CreateEntityDeduplicationInput
  ): Promise<void> {
    const sql = `
      INSERT INTO entity_deduplication_pending (
        id,
        campaign_id,
        new_entity_id,
        potential_duplicate_ids,
        similarity_scores,
        status,
        user_decision,
        created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
      )
    `;

    await this.execute(sql, [
      entry.id,
      entry.campaignId,
      entry.newEntityId,
      JSON.stringify(entry.potentialDuplicateIds),
      JSON.stringify(entry.similarityScores),
      entry.status ?? "pending",
      entry.userDecision ?? null,
    ]);
  }

  async updateDeduplicationEntry(
    id: string,
    updates: UpdateEntityDeduplicationInput
  ): Promise<void> {
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      setClauses.push("status = ?");
      values.push(updates.status);
    }

    if (updates.userDecision !== undefined) {
      setClauses.push("user_decision = ?");
      values.push(updates.userDecision);
    }

    if (updates.resolvedAt !== undefined) {
      setClauses.push("resolved_at = ?");
      values.push(updates.resolvedAt);
    }

    if (setClauses.length === 0) {
      return;
    }

    const sql = `
      UPDATE entity_deduplication_pending
      SET ${setClauses.join(", ")}
      WHERE id = ?
    `;

    values.push(id);
    await this.execute(sql, values);
  }

  async getDeduplicationEntryById(
    id: string
  ): Promise<EntityDeduplicationEntry | null> {
    const sql = `
      SELECT * FROM entity_deduplication_pending
      WHERE id = ?
    `;

    const record = await this.queryFirst<EntityDeduplicationRecord>(sql, [id]);
    return record ? this.mapDeduplicationRecord(record) : null;
  }

  async listDeduplicationEntries(
    campaignId: string,
    status: string = "pending"
  ): Promise<EntityDeduplicationEntry[]> {
    const sql = `
      SELECT * FROM entity_deduplication_pending
      WHERE campaign_id = ? AND status = ?
      ORDER BY created_at ASC
    `;

    const records = await this.queryAll<EntityDeduplicationRecord>(sql, [
      campaignId,
      status,
    ]);
    return records.map((record) => this.mapDeduplicationRecord(record));
  }

  private mapDeduplicationRecord(
    record: EntityDeduplicationRecord
  ): EntityDeduplicationEntry {
    return {
      id: record.id,
      campaignId: record.campaign_id,
      newEntityId: record.new_entity_id,
      potentialDuplicateIds: this.safeParseArray(
        record.potential_duplicate_ids
      ),
      similarityScores: this.safeParseArray(record.similarity_scores),
      status: record.status,
      userDecision: record.user_decision,
      createdAt: record.created_at,
      resolvedAt: record.resolved_at,
    };
  }

  private safeParseArray<T = any>(value: string): T[] {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }
}

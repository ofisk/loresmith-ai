import { BaseDAOClass } from "./base-dao";

// Raw row shape returned directly from D1 queries against the `communities` table.
export interface CommunityRecord {
  id: string;
  campaign_id: string;
  level: number;
  parent_community_id: string | null;
  entity_ids: string;
  metadata: string | null;
  created_at: string;
}

// Normalized community object exposed to the rest of the application.
export interface Community {
  id: string;
  campaignId: string;
  level: number;
  parentCommunityId: string | null;
  entityIds: string[];
  metadata?: unknown;
  createdAt: string;
}

// Payload required when creating a new community.
export interface CreateCommunityInput {
  id: string;
  campaignId: string;
  level: number;
  parentCommunityId?: string | null;
  entityIds: string[];
  metadata?: unknown;
}

// Partial payload for updates to an existing community.
export interface UpdateCommunityInput {
  entityIds?: string[];
  metadata?: unknown;
}

export class CommunityDAO extends BaseDAOClass {
  async createCommunity(community: CreateCommunityInput): Promise<void> {
    // Insert community record (keep entity_ids for backward compatibility during migration)
    const sql = `
      INSERT INTO communities (
        id,
        campaign_id,
        level,
        parent_community_id,
        entity_ids,
        metadata,
        created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
      )
    `;

    await this.execute(sql, [
      community.id,
      community.campaignId,
      community.level,
      community.parentCommunityId ?? null,
      JSON.stringify(community.entityIds), // Keep for backward compatibility
      community.metadata ? JSON.stringify(community.metadata) : null,
    ]);

    // Insert entity relationships into join table
    if (community.entityIds.length > 0) {
      await this.syncCommunityEntities(community.id, community.entityIds);
    }
  }

  /**
   * Sync community-entity relationships in join table
   */
  private async syncCommunityEntities(
    communityId: string,
    entityIds: string[]
  ): Promise<void> {
    // Delete existing relationships for this community
    await this.execute(
      "DELETE FROM community_entities WHERE community_id = ?",
      [communityId]
    );

    // Insert new relationships (batch insert)
    if (entityIds.length > 0) {
      const placeholders = entityIds.map(() => "(?, ?)").join(", ");
      const values: string[] = [];
      for (const entityId of entityIds) {
        values.push(communityId, entityId);
      }

      const sql = `
        INSERT INTO community_entities (community_id, entity_id)
        VALUES ${placeholders}
      `;
      await this.execute(sql, values);
    }
  }

  async getCommunityById(communityId: string): Promise<Community | null> {
    const sql = `SELECT * FROM communities WHERE id = ?`;
    const record = await this.queryFirst<CommunityRecord>(sql, [communityId]);
    return record ? await this.mapCommunityRecordAsync(record) : null;
  }

  async listCommunitiesByCampaign(
    campaignId: string,
    options: { level?: number; limit?: number; offset?: number } = {}
  ): Promise<Community[]> {
    const conditions = ["campaign_id = ?"];
    const params: any[] = [campaignId];

    if (options.level !== undefined) {
      conditions.push("level = ?");
      params.push(options.level);
    }

    let sql = `
      SELECT * FROM communities
      WHERE ${conditions.join(" AND ")}
      ORDER BY level ASC, created_at DESC
    `;

    if (typeof options.limit === "number") {
      sql += " LIMIT ?";
      params.push(options.limit);
    }

    if (typeof options.offset === "number") {
      sql += " OFFSET ?";
      params.push(options.offset);
    }

    const records = await this.queryAll<CommunityRecord>(sql, params);
    return this.mapCommunityRecords(records);
  }

  async getCommunitiesByLevel(
    campaignId: string,
    level: number
  ): Promise<Community[]> {
    return this.listCommunitiesByCampaign(campaignId, { level });
  }

  async getChildCommunities(parentCommunityId: string): Promise<Community[]> {
    const sql = `
      SELECT * FROM communities
      WHERE parent_community_id = ?
      ORDER BY created_at DESC
    `;

    const records = await this.queryAll<CommunityRecord>(sql, [
      parentCommunityId,
    ]);
    return this.mapCommunityRecords(records);
  }

  async updateCommunity(
    communityId: string,
    updates: UpdateCommunityInput
  ): Promise<void> {
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.entityIds !== undefined) {
      // Update JSON column for backward compatibility during migration
      setClauses.push("entity_ids = ?");
      values.push(JSON.stringify(updates.entityIds));
      // Sync join table
      await this.syncCommunityEntities(communityId, updates.entityIds);
    }

    if (updates.metadata !== undefined) {
      setClauses.push("metadata = ?");
      values.push(updates.metadata ? JSON.stringify(updates.metadata) : null);
    }

    if (setClauses.length === 0) {
      return;
    }

    const sql = `
      UPDATE communities
      SET ${setClauses.join(", ")}
      WHERE id = ?
    `;

    values.push(communityId);
    await this.execute(sql, values);
  }

  async deleteCommunity(communityId: string): Promise<void> {
    // First, delete all child communities (cascade)
    const children = await this.getChildCommunities(communityId);
    for (const child of children) {
      await this.deleteCommunity(child.id);
    }

    // Then delete this community
    await this.execute("DELETE FROM communities WHERE id = ?", [communityId]);
  }

  async deleteCommunitiesByCampaign(campaignId: string): Promise<void> {
    await this.execute("DELETE FROM communities WHERE campaign_id = ?", [
      campaignId,
    ]);
  }

  async findCommunitiesContainingEntity(
    campaignId: string,
    entityId: string
  ): Promise<Community[]> {
    // Use join table for efficient lookup (replaces LIKE pattern on JSON)
    const sql = `
      SELECT DISTINCT c.*
      FROM communities c
      INNER JOIN community_entities ce ON c.id = ce.community_id
      WHERE c.campaign_id = ?
        AND ce.entity_id = ?
      ORDER BY c.level ASC, c.created_at DESC
    `;

    const records = await this.queryAll<CommunityRecord>(sql, [
      campaignId,
      entityId,
    ]);
    return this.mapCommunityRecords(records);
  }

  /**
   * Count entities of a type in communities that contain at least minCount of that type
   * More efficient than findCommunitiesWithMultipleEntityType when you only need a count
   * Example: Count all factions in communities that have at least 2 factions
   */
  async countEntityTypeInCommunitiesWithMinCount(
    campaignId: string,
    entityType: string,
    minCount: number = 2
  ): Promise<number> {
    const sql = `
      SELECT COUNT(DISTINCT ce.entity_id) as count
      FROM communities c
      INNER JOIN community_entities ce ON c.id = ce.community_id
      INNER JOIN entities e ON ce.entity_id = e.id
      WHERE c.campaign_id = ?
        AND e.entity_type = ?
        AND c.id IN (
          SELECT c2.id
          FROM communities c2
          INNER JOIN community_entities ce2 ON c2.id = ce2.community_id
          INNER JOIN entities e2 ON ce2.entity_id = e2.id
          WHERE c2.campaign_id = ?
            AND e2.entity_type = ?
          GROUP BY c2.id
          HAVING COUNT(DISTINCT ce2.entity_id) >= ?
        )
    `;
    const result = await this.queryFirst<{ count: number }>(sql, [
      campaignId,
      entityType,
      campaignId,
      entityType,
      minCount,
    ]);
    return result?.count || 0;
  }

  /**
   * Find communities that contain multiple entities of a specific type
   * Useful for finding communities with related entities (e.g., multiple factions)
   */
  async findCommunitiesWithMultipleEntityType(
    campaignId: string,
    entityType: string,
    minCount: number = 2
  ): Promise<Array<{ communityId: string; entityCount: number }>> {
    const sql = `
      SELECT 
        c.id as communityId,
        COUNT(DISTINCT ce.entity_id) as entityCount
      FROM communities c
      INNER JOIN community_entities ce ON c.id = ce.community_id
      INNER JOIN entities e ON ce.entity_id = e.id
      WHERE c.campaign_id = ?
        AND e.entity_type = ?
      GROUP BY c.id
      HAVING COUNT(DISTINCT ce.entity_id) >= ?
    `;
    const results = await this.queryAll<{
      communityId: string;
      entityCount: number;
    }>(sql, [campaignId, entityType, minCount]);
    return results;
  }

  /**
   * Count entities of one type in communities that also contain entities of another type
   * More efficient than findCommunitiesWithEntityTypes when you only need a count
   * Example: Count NPCs in communities that also contain locations
   */
  async countEntityTypeInCommunitiesWithOtherType(
    campaignId: string,
    entityTypeToCount: string,
    requiredOtherType: string
  ): Promise<number> {
    const sql = `
      SELECT COUNT(DISTINCT ce1.entity_id) as count
      FROM communities c
      INNER JOIN community_entities ce1 ON c.id = ce1.community_id
      INNER JOIN entities e1 ON ce1.entity_id = e1.id
      INNER JOIN community_entities ce2 ON c.id = ce2.community_id
      INNER JOIN entities e2 ON ce2.entity_id = e2.id
      WHERE c.campaign_id = ?
        AND e1.entity_type = ?
        AND e2.entity_type = ?
        AND ce1.entity_id != ce2.entity_id
    `;
    const result = await this.queryFirst<{ count: number }>(sql, [
      campaignId,
      entityTypeToCount,
      requiredOtherType,
    ]);
    return result?.count || 0;
  }

  /**
   * Find communities that contain entities of multiple specified types
   * Useful for finding communities with related entity types (e.g., NPCs and locations)
   */
  async findCommunitiesWithEntityTypes(
    campaignId: string,
    entityTypes: string[]
  ): Promise<
    Array<{
      communityId: string;
      entityTypeCounts: Record<string, number>;
    }>
  > {
    if (entityTypes.length === 0) {
      return [];
    }

    // Build a query that counts each entity type per community
    const typeConditions = entityTypes
      .map(() => "e.entity_type = ?")
      .join(" OR ");
    const sql = `
      SELECT 
        c.id as communityId,
        e.entity_type,
        COUNT(DISTINCT ce.entity_id) as count
      FROM communities c
      INNER JOIN community_entities ce ON c.id = ce.community_id
      INNER JOIN entities e ON ce.entity_id = e.id
      WHERE c.campaign_id = ?
        AND (${typeConditions})
      GROUP BY c.id, e.entity_type
    `;
    const results = await this.queryAll<{
      communityId: string;
      entity_type: string;
      count: number;
    }>(sql, [campaignId, ...entityTypes]);

    // Group by community and build entityTypeCounts map
    const communityMap = new Map<
      string,
      { communityId: string; entityTypeCounts: Record<string, number> }
    >();

    for (const row of results) {
      const existing = communityMap.get(row.communityId);
      if (existing) {
        existing.entityTypeCounts[row.entity_type] = row.count;
      } else {
        communityMap.set(row.communityId, {
          communityId: row.communityId,
          entityTypeCounts: { [row.entity_type]: row.count },
        });
      }
    }

    // Filter to only communities that have all requested types
    return Array.from(communityMap.values()).filter((community) => {
      return entityTypes.every(
        (type) => (community.entityTypeCounts[type] || 0) > 0
      );
    });
  }

  /**
   * Find communities containing any of the given entities (batch lookup)
   * This is more efficient than calling findCommunitiesContainingEntity multiple times
   */
  async findCommunitiesContainingEntities(
    campaignId: string,
    entityIds: string[]
  ): Promise<Community[]> {
    if (entityIds.length === 0) {
      return [];
    }

    const placeholders = entityIds.map(() => "?").join(", ");
    const sql = `
      SELECT DISTINCT c.*
      FROM communities c
      INNER JOIN community_entities ce ON c.id = ce.community_id
      WHERE c.campaign_id = ?
        AND ce.entity_id IN (${placeholders})
      ORDER BY c.level ASC, c.created_at DESC
    `;

    const records = await this.queryAll<CommunityRecord>(sql, [
      campaignId,
      ...entityIds,
    ]);
    return this.mapCommunityRecords(records);
  }

  /**
   * Batch load entity IDs for multiple communities (more efficient than individual queries)
   */
  private async getEntityIdsForCommunities(
    communityIds: string[]
  ): Promise<Map<string, string[]>> {
    if (communityIds.length === 0) {
      return new Map();
    }

    const placeholders = communityIds.map(() => "?").join(", ");
    const sql = `
      SELECT community_id, entity_id 
      FROM community_entities 
      WHERE community_id IN (${placeholders})
      ORDER BY community_id, entity_id
    `;
    const records = await this.queryAll<{
      community_id: string;
      entity_id: string;
    }>(sql, communityIds);

    const result = new Map<string, string[]>();
    for (const record of records) {
      if (!result.has(record.community_id)) {
        result.set(record.community_id, []);
      }
      result.get(record.community_id)!.push(record.entity_id);
    }

    // Ensure all communityIds have an entry (even if empty)
    for (const communityId of communityIds) {
      if (!result.has(communityId)) {
        result.set(communityId, []);
      }
    }

    return result;
  }

  /**
   * Map a single community record to Community object using provided entityIds map
   */
  private mapCommunityRecord(
    record: CommunityRecord,
    entityIdsMap: Map<string, string[]>
  ): Community {
    const entityIds = entityIdsMap.get(record.id) || [];
    return {
      id: record.id,
      campaignId: record.campaign_id,
      level: record.level,
      parentCommunityId: record.parent_community_id,
      entityIds,
      metadata: record.metadata
        ? this.safeParseJson(record.metadata)
        : undefined,
      createdAt: record.created_at,
    };
  }

  /**
   * Map multiple community records to Community objects with batch-loaded entityIds
   */
  private async mapCommunityRecords(
    records: CommunityRecord[]
  ): Promise<Community[]> {
    if (records.length === 0) {
      return [];
    }

    const communityIds = records.map((r) => r.id);
    const entityIdsMap = await this.getEntityIdsForCommunities(communityIds);

    return records.map((record) =>
      this.mapCommunityRecord(record, entityIdsMap)
    );
  }

  /**
   * Map a single community record with entity IDs from join table (async version)
   */
  private async mapCommunityRecordAsync(
    record: CommunityRecord
  ): Promise<Community> {
    const entityIdsMap = await this.getEntityIdsForCommunities([record.id]);
    return this.mapCommunityRecord(record, entityIdsMap);
  }

  private safeParseJson(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch (_error) {
      return undefined;
    }
  }
}

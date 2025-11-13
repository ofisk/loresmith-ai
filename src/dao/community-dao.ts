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
      JSON.stringify(community.entityIds),
      community.metadata ? JSON.stringify(community.metadata) : null,
    ]);
  }

  async getCommunityById(communityId: string): Promise<Community | null> {
    const sql = `SELECT * FROM communities WHERE id = ?`;
    const record = await this.queryFirst<CommunityRecord>(sql, [communityId]);
    return record ? this.mapCommunityRecord(record) : null;
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
    return records.map((record) => this.mapCommunityRecord(record));
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
    return records.map((record) => this.mapCommunityRecord(record));
  }

  async updateCommunity(
    communityId: string,
    updates: UpdateCommunityInput
  ): Promise<void> {
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.entityIds !== undefined) {
      setClauses.push("entity_ids = ?");
      values.push(JSON.stringify(updates.entityIds));
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
    // SQLite doesn't have native JSON array search, so we need to use LIKE
    // This is not ideal but works for small to medium datasets
    const sql = `
      SELECT * FROM communities
      WHERE campaign_id = ?
        AND entity_ids LIKE ?
      ORDER BY level ASC, created_at DESC
    `;

    // Escape special characters in entityId for LIKE pattern
    const escapedEntityId = entityId.replace(/[%_]/g, "\\$&");
    const pattern = `%"${escapedEntityId}"%`;

    const records = await this.queryAll<CommunityRecord>(sql, [
      campaignId,
      pattern,
    ]);
    return records.map((record) => this.mapCommunityRecord(record));
  }

  mapCommunityRecord(record: CommunityRecord): Community {
    return {
      id: record.id,
      campaignId: record.campaign_id,
      level: record.level,
      parentCommunityId: record.parent_community_id,
      entityIds: this.safeParseArray(record.entity_ids),
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

  private safeParseArray(value: string): string[] {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }
}

import { BaseDAOClass } from "./base-dao";

// Raw row shape returned directly from D1 queries against the `community_summaries` table.
export interface CommunitySummaryRecord {
  id: string;
  community_id: string;
  level: number;
  name: string | null;
  summary_text: string;
  key_entities: string | null;
  metadata: string | null;
  generated_at: string;
  updated_at: string;
}

// Normalized community summary object exposed to the rest of the application.
export interface CommunitySummary {
  id: string;
  communityId: string;
  level: number;
  name: string | null;
  summaryText: string;
  keyEntities: string[];
  metadata?: unknown;
  generatedAt: string;
  updatedAt: string;
}

// Payload required when creating a new community summary.
export interface CreateCommunitySummaryInput {
  id: string;
  communityId: string;
  level: number;
  name?: string | null;
  summaryText: string;
  keyEntities?: string[];
  metadata?: unknown;
}

// Partial payload for updates to an existing community summary.
export interface UpdateCommunitySummaryInput {
  name?: string | null;
  summaryText?: string;
  keyEntities?: string[];
  metadata?: unknown;
}

export class CommunitySummaryDAO extends BaseDAOClass {
  async createSummary(summary: CreateCommunitySummaryInput): Promise<void> {
    const sql = `
      INSERT INTO community_summaries (
        id,
        community_id,
        level,
        name,
        summary_text,
        key_entities,
        metadata,
        generated_at,
        updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `;

    await this.execute(sql, [
      summary.id,
      summary.communityId,
      summary.level,
      summary.name ?? null,
      summary.summaryText,
      summary.keyEntities ? JSON.stringify(summary.keyEntities) : null,
      summary.metadata ? JSON.stringify(summary.metadata) : null,
    ]);
  }

  async getSummaryByCommunityId(
    communityId: string,
    campaignId?: string
  ): Promise<CommunitySummary | null> {
    // Always join with communities to ensure campaign ownership
    let sql = `
      SELECT cs.* FROM community_summaries cs
      INNER JOIN communities c ON cs.community_id = c.id
      WHERE cs.community_id = ?
    `;
    const params: any[] = [communityId];

    if (campaignId) {
      sql += " AND c.campaign_id = ?";
      params.push(campaignId);
    }

    sql += " ORDER BY cs.updated_at DESC LIMIT 1";

    const record = await this.queryFirst<CommunitySummaryRecord>(sql, params);
    return record ? this.mapSummaryRecord(record) : null;
  }

  async getSummaryById(
    summaryId: string,
    campaignId?: string
  ): Promise<CommunitySummary | null> {
    // Always join with communities to ensure campaign ownership
    let sql = `
      SELECT cs.* FROM community_summaries cs
      INNER JOIN communities c ON cs.community_id = c.id
      WHERE cs.id = ?
    `;
    const params: any[] = [summaryId];

    if (campaignId) {
      sql += " AND c.campaign_id = ?";
      params.push(campaignId);
    }

    const record = await this.queryFirst<CommunitySummaryRecord>(sql, params);
    return record ? this.mapSummaryRecord(record) : null;
  }

  async listSummariesByCampaign(
    campaignId: string,
    options: { level?: number; limit?: number; offset?: number } = {}
  ): Promise<CommunitySummary[]> {
    // Join with communities table to filter by campaign_id
    const conditions = ["c.campaign_id = ?"];
    const params: any[] = [campaignId];

    if (options.level !== undefined) {
      conditions.push("cs.level = ?");
      params.push(options.level);
    }

    let sql = `
      SELECT cs.* FROM community_summaries cs
      INNER JOIN communities c ON cs.community_id = c.id
      WHERE ${conditions.join(" AND ")}
      ORDER BY cs.level ASC, cs.updated_at DESC
    `;

    if (typeof options.limit === "number") {
      sql += " LIMIT ?";
      params.push(options.limit);
    }

    if (typeof options.offset === "number") {
      sql += " OFFSET ?";
      params.push(options.offset);
    }

    const records = await this.queryAll<CommunitySummaryRecord>(sql, params);
    return records.map((record) => this.mapSummaryRecord(record));
  }

  async listSummariesByLevel(
    campaignId: string,
    level: number
  ): Promise<CommunitySummary[]> {
    return this.listSummariesByCampaign(campaignId, { level });
  }

  async updateSummary(
    summaryId: string,
    updates: UpdateCommunitySummaryInput
  ): Promise<void> {
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      setClauses.push("name = ?");
      values.push(updates.name ?? null);
    }

    if (updates.summaryText !== undefined) {
      setClauses.push("summary_text = ?");
      values.push(updates.summaryText);
    }

    if (updates.keyEntities !== undefined) {
      setClauses.push("key_entities = ?");
      values.push(
        updates.keyEntities ? JSON.stringify(updates.keyEntities) : null
      );
    }

    if (updates.metadata !== undefined) {
      setClauses.push("metadata = ?");
      values.push(updates.metadata ? JSON.stringify(updates.metadata) : null);
    }

    if (setClauses.length === 0) {
      return;
    }

    setClauses.push("updated_at = CURRENT_TIMESTAMP");

    const sql = `
      UPDATE community_summaries
      SET ${setClauses.join(", ")}
      WHERE id = ?
    `;

    values.push(summaryId);
    await this.execute(sql, values);
  }

  async deleteSummary(summaryId: string): Promise<void> {
    await this.execute("DELETE FROM community_summaries WHERE id = ?", [
      summaryId,
    ]);
  }

  async deleteSummariesByCommunity(communityId: string): Promise<void> {
    await this.execute(
      "DELETE FROM community_summaries WHERE community_id = ?",
      [communityId]
    );
  }

  async deleteSummariesByCampaign(campaignId: string): Promise<void> {
    // Join with communities table to delete summaries for a campaign
    const sql = `
      DELETE FROM community_summaries
      WHERE community_id IN (
        SELECT id FROM communities WHERE campaign_id = ?
      )
    `;
    await this.execute(sql, [campaignId]);
  }

  mapSummaryRecord(record: CommunitySummaryRecord): CommunitySummary {
    return {
      id: record.id,
      communityId: record.community_id,
      level: record.level,
      name: record.name ?? null,
      summaryText: record.summary_text,
      keyEntities: this.safeParseArray(record.key_entities),
      metadata: record.metadata
        ? this.safeParseJson(record.metadata)
        : undefined,
      generatedAt: record.generated_at,
      updatedAt: record.updated_at,
    };
  }

  private safeParseJson(value: string | null): unknown {
    if (!value) {
      return undefined;
    }
    try {
      return JSON.parse(value);
    } catch (_error) {
      return undefined;
    }
  }

  private safeParseArray(value: string | null): string[] {
    if (!value) {
      return [];
    }
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }
}

import { BaseDAOClass } from "./base-dao";

// Raw row structure for the `entity_importance` table. Matches the D1 schema
// exactly and is primarily used internally before normalization.
export interface EntityImportanceRecord {
  entity_id: string;
  campaign_id: string;
  pagerank: number;
  betweenness_centrality: number;
  hierarchy_level: number;
  importance_score: number;
  computed_at: string;
}

// Application-facing importance shape with camelCase keys.
export interface EntityImportance {
  entityId: string;
  campaignId: string;
  pagerank: number;
  betweennessCentrality: number;
  hierarchyLevel: number;
  importanceScore: number;
  computedAt: string;
}

export interface UpsertEntityImportanceInput {
  entityId: string;
  campaignId: string;
  pagerank: number;
  betweennessCentrality: number;
  hierarchyLevel: number;
  importanceScore: number;
}

export interface EntityImportanceQueryOptions {
  limit?: number;
  offset?: number;
  minScore?: number;
}

export class EntityImportanceDAO extends BaseDAOClass {
  async upsertImportance(input: UpsertEntityImportanceInput): Promise<void> {
    const sql = `
      INSERT INTO entity_importance (
        entity_id,
        campaign_id,
        pagerank,
        betweenness_centrality,
        hierarchy_level,
        importance_score,
        computed_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
      )
      ON CONFLICT(entity_id) DO UPDATE SET
        campaign_id = excluded.campaign_id,
        pagerank = excluded.pagerank,
        betweenness_centrality = excluded.betweenness_centrality,
        hierarchy_level = excluded.hierarchy_level,
        importance_score = excluded.importance_score,
        computed_at = CURRENT_TIMESTAMP
    `;

    await this.execute(sql, [
      input.entityId,
      input.campaignId,
      input.pagerank,
      input.betweennessCentrality,
      input.hierarchyLevel,
      input.importanceScore,
    ]);
  }

  async getImportance(entityId: string): Promise<EntityImportance | null> {
    const sql = `
      SELECT * FROM entity_importance
      WHERE entity_id = ?
    `;

    const record = await this.queryFirst<EntityImportanceRecord>(sql, [
      entityId,
    ]);
    return record ? this.mapRecord(record) : null;
  }

  async getImportanceForCampaign(
    campaignId: string,
    options: EntityImportanceQueryOptions = {}
  ): Promise<EntityImportance[]> {
    const conditions: string[] = ["campaign_id = ?"];
    const params: any[] = [campaignId];

    if (options.minScore !== undefined) {
      conditions.push("importance_score >= ?");
      params.push(options.minScore);
    }

    let sql = `
      SELECT * FROM entity_importance
      WHERE ${conditions.join(" AND ")}
      ORDER BY importance_score DESC
    `;

    if (typeof options.limit === "number") {
      sql += " LIMIT ?";
      params.push(options.limit);
    }

    if (typeof options.offset === "number") {
      sql += " OFFSET ?";
      params.push(options.offset);
    }

    const records = await this.queryAll<EntityImportanceRecord>(sql, params);
    return records.map((record) => this.mapRecord(record));
  }

  async getTopEntitiesByImportance(
    campaignId: string,
    limit: number = 10
  ): Promise<EntityImportance[]> {
    return this.getImportanceForCampaign(campaignId, { limit });
  }

  async deleteImportance(entityId: string): Promise<void> {
    const sql = `
      DELETE FROM entity_importance
      WHERE entity_id = ?
    `;

    await this.execute(sql, [entityId]);
  }

  async deleteImportanceForCampaign(campaignId: string): Promise<void> {
    const sql = `
      DELETE FROM entity_importance
      WHERE campaign_id = ?
    `;

    await this.execute(sql, [campaignId]);
  }

  private mapRecord(record: EntityImportanceRecord): EntityImportance {
    return {
      entityId: record.entity_id,
      campaignId: record.campaign_id,
      pagerank: record.pagerank,
      betweennessCentrality: record.betweenness_centrality,
      hierarchyLevel: record.hierarchy_level,
      importanceScore: record.importance_score,
      computedAt: record.computed_at,
    };
  }
}

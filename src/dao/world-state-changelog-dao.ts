import { BaseDAOClass } from "./base-dao";
import type {
  WorldStateChangelogEntry,
  WorldStateChangelogPayload,
  WorldStateChangelogRecord,
} from "@/types/world-state";

export interface CreateWorldStateChangelogInput {
  id: string;
  campaignId: string;
  campaignSessionId: number | null;
  timestamp: string;
  payload: WorldStateChangelogPayload;
  impactScore?: number | null;
}

export interface WorldStateChangelogQueryOptions {
  campaignSessionId?: number;
  fromTimestamp?: string;
  toTimestamp?: string;
  appliedToGraph?: boolean;
  limit?: number;
  offset?: number;
}

export class WorldStateChangelogDAO extends BaseDAOClass {
  async createEntry(input: CreateWorldStateChangelogInput): Promise<void> {
    const sql = `
      INSERT INTO world_state_changelog (
        id,
        campaign_id,
        campaign_session_id,
        timestamp,
        changelog_data,
        impact_score,
        applied_to_graph,
        created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, FALSE, CURRENT_TIMESTAMP
      )
    `;

    await this.execute(sql, [
      input.id,
      input.campaignId,
      input.campaignSessionId,
      input.timestamp,
      JSON.stringify(input.payload),
      input.impactScore ?? null,
    ]);
  }

  async listEntriesForCampaign(
    campaignId: string,
    options: WorldStateChangelogQueryOptions = {}
  ): Promise<WorldStateChangelogEntry[]> {
    const conditions: string[] = ["campaign_id = ?"];
    const params: any[] = [campaignId];

    if (options.campaignSessionId !== undefined) {
      conditions.push("campaign_session_id = ?");
      params.push(options.campaignSessionId);
    }

    if (options.fromTimestamp) {
      conditions.push("timestamp >= ?");
      params.push(options.fromTimestamp);
    }

    if (options.toTimestamp) {
      conditions.push("timestamp <= ?");
      params.push(options.toTimestamp);
    }

    if (options.appliedToGraph !== undefined) {
      conditions.push("applied_to_graph = ?");
      params.push(options.appliedToGraph ? 1 : 0);
    }

    let sql = `
      SELECT 
        id,
        campaign_id,
        campaign_session_id,
        timestamp,
        changelog_data,
        impact_score,
        applied_to_graph,
        created_at
      FROM world_state_changelog
      WHERE ${conditions.join(" AND ")}
      ORDER BY timestamp ASC, created_at ASC
    `;

    if (typeof options.limit === "number") {
      sql += " LIMIT ?";
      params.push(options.limit);
    }

    if (typeof options.offset === "number") {
      sql += " OFFSET ?";
      params.push(options.offset);
    }

    const records = await this.queryAll<WorldStateChangelogRecord>(sql, params);
    return records.map((record) => this.mapRecord(record));
  }

  async markEntriesApplied(ids: string[]): Promise<void> {
    if (!ids.length) return;

    const placeholders = ids.map(() => "?").join(", ");
    const sql = `
      UPDATE world_state_changelog
      SET applied_to_graph = TRUE
      WHERE id IN (${placeholders})
    `;

    await this.execute(sql, ids);
  }

  private mapRecord(
    record: WorldStateChangelogRecord
  ): WorldStateChangelogEntry {
    let payload: WorldStateChangelogPayload;
    try {
      payload = JSON.parse(record.changelog_data) as WorldStateChangelogPayload;
    } catch (_error) {
      payload = {
        campaign_session_id: record.campaign_session_id,
        timestamp: record.timestamp,
        entity_updates: [],
        relationship_updates: [],
        new_entities: [],
      };
    }

    return {
      id: record.id,
      campaignId: record.campaign_id,
      campaignSessionId: record.campaign_session_id,
      timestamp: record.timestamp,
      payload,
      impactScore: record.impact_score,
      appliedToGraph:
        typeof record.applied_to_graph === "boolean"
          ? record.applied_to_graph
          : record.applied_to_graph === 1,
      createdAt: record.created_at,
    };
  }
}

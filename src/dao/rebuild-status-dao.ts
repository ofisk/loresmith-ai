import { BaseDAOClass } from "./base-dao";

// Raw row structure for the `rebuild_status` table. Matches the D1 schema exactly.
export interface RebuildStatusRecord {
  id: string;
  campaign_id: string;
  rebuild_type: string;
  status: string;
  affected_entity_ids: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  metadata: string | null;
  created_at: string;
}

// Application-facing rebuild status shape with camelCase keys.
export type RebuildStatusType =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled";
export type RebuildType = "full" | "partial";

export interface RebuildStatus {
  id: string;
  campaignId: string;
  rebuildType: RebuildType;
  status: RebuildStatusType;
  affectedEntityIds?: string[];
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface CreateRebuildStatusInput {
  id: string;
  campaignId: string;
  rebuildType: RebuildType;
  status?: RebuildStatusType;
  affectedEntityIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateRebuildStatusInput {
  status?: RebuildStatusType;
  affectedEntityIds?: string[];
  startedAt?: string | null;
  completedAt?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RebuildStatusQueryOptions {
  status?: RebuildStatusType;
  rebuildType?: RebuildType;
  limit?: number;
  offset?: number;
}

export class RebuildStatusDAO extends BaseDAOClass {
  async createRebuild(input: CreateRebuildStatusInput): Promise<void> {
    const sql = `
      INSERT INTO rebuild_status (
        id,
        campaign_id,
        rebuild_type,
        status,
        affected_entity_ids,
        metadata,
        created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
      )
    `;

    await this.execute(sql, [
      input.id,
      input.campaignId,
      input.rebuildType,
      input.status || "pending",
      input.affectedEntityIds ? JSON.stringify(input.affectedEntityIds) : null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ]);
  }

  async updateRebuildStatus(
    rebuildId: string,
    updates: UpdateRebuildStatusInput
  ): Promise<void> {
    const updatesList: string[] = [];
    const params: any[] = [];

    if (updates.status !== undefined) {
      updatesList.push("status = ?");
      params.push(updates.status);
    }

    if (updates.startedAt !== undefined) {
      updatesList.push("started_at = ?");
      params.push(updates.startedAt);
    }

    if (updates.completedAt !== undefined) {
      updatesList.push("completed_at = ?");
      params.push(updates.completedAt);
    }

    if (updates.errorMessage !== undefined) {
      updatesList.push("error_message = ?");
      params.push(updates.errorMessage);
    }

    if (updates.affectedEntityIds !== undefined) {
      updatesList.push("affected_entity_ids = ?");
      params.push(
        updates.affectedEntityIds
          ? JSON.stringify(updates.affectedEntityIds)
          : null
      );
    }

    if (updates.metadata !== undefined) {
      updatesList.push("metadata = ?");
      params.push(updates.metadata ? JSON.stringify(updates.metadata) : null);
    }

    if (updatesList.length === 0) {
      return;
    }

    params.push(rebuildId);

    const sql = `
      UPDATE rebuild_status
      SET ${updatesList.join(", ")}
      WHERE id = ?
    `;

    await this.execute(sql, params);
  }

  async getRebuildById(rebuildId: string): Promise<RebuildStatus | null> {
    const sql = `
      SELECT * FROM rebuild_status
      WHERE id = ?
    `;

    const record = await this.queryFirst<RebuildStatusRecord>(sql, [rebuildId]);
    return record ? this.mapRecord(record) : null;
  }

  async getActiveRebuildForCampaign(
    campaignId: string
  ): Promise<RebuildStatus | null> {
    const sql = `
      SELECT * FROM rebuild_status
      WHERE campaign_id = ?
        AND status IN ('pending', 'in_progress')
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const record = await this.queryFirst<RebuildStatusRecord>(sql, [
      campaignId,
    ]);
    return record ? this.mapRecord(record) : null;
  }

  async getActiveRebuilds(campaignId?: string): Promise<RebuildStatus[]> {
    const conditions: string[] = ["status IN ('pending', 'in_progress')"];
    const params: any[] = [];

    if (campaignId) {
      conditions.push("campaign_id = ?");
      params.push(campaignId);
    }

    const sql = `
      SELECT * FROM rebuild_status
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
    `;

    const records = await this.queryAll<RebuildStatusRecord>(sql, params);
    return records.map((record) => this.mapRecord(record));
  }

  async getRebuildHistory(
    campaignId: string,
    options: RebuildStatusQueryOptions = {}
  ): Promise<RebuildStatus[]> {
    const conditions: string[] = ["campaign_id = ?"];
    const params: any[] = [campaignId];

    if (options.status) {
      conditions.push("status = ?");
      params.push(options.status);
    }

    if (options.rebuildType) {
      conditions.push("rebuild_type = ?");
      params.push(options.rebuildType);
    }

    let sql = `
      SELECT * FROM rebuild_status
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
    `;

    if (typeof options.limit === "number") {
      sql += " LIMIT ?";
      params.push(options.limit);
    }

    if (typeof options.offset === "number") {
      sql += " OFFSET ?";
      params.push(options.offset);
    }

    const records = await this.queryAll<RebuildStatusRecord>(sql, params);
    return records.map((record) => this.mapRecord(record));
  }

  async cancelRebuild(rebuildId: string): Promise<void> {
    await this.updateRebuildStatus(rebuildId, {
      status: "cancelled",
      completedAt: new Date().toISOString(),
    });
  }

  private mapRecord(record: RebuildStatusRecord): RebuildStatus {
    let affectedEntityIds: string[] | undefined;
    if (record.affected_entity_ids) {
      try {
        affectedEntityIds = JSON.parse(record.affected_entity_ids) as string[];
      } catch (_error) {
        affectedEntityIds = undefined;
      }
    }

    let metadata: Record<string, unknown> | undefined;
    if (record.metadata) {
      try {
        metadata = JSON.parse(record.metadata) as Record<string, unknown>;
      } catch (_error) {
        metadata = undefined;
      }
    }

    return {
      id: record.id,
      campaignId: record.campaign_id,
      rebuildType: record.rebuild_type as RebuildType,
      status: record.status as RebuildStatusType,
      affectedEntityIds,
      startedAt: record.started_at || undefined,
      completedAt: record.completed_at || undefined,
      errorMessage: record.error_message || undefined,
      metadata,
      createdAt: record.created_at,
    };
  }
}

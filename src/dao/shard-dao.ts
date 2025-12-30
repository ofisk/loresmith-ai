import { BaseDAOClass } from "./base-dao";
import type { ShardStatus } from "@/types/shard";

/**
 * Shard Registry Record in D1
 */
export interface ShardRegistryRecord {
  shard_id: string;
  campaign_id: string;
  resource_id: string;
  resource_name: string;
  r2_key: string;
  shard_type: string;
  status: ShardStatus;
  confidence: number | null;
  source: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Input for creating a shard registry entry
 */
export interface CreateShardRegistryInput {
  shard_id: string;
  campaign_id: string;
  resource_id: string;
  resource_name: string;
  r2_key: string;
  shard_type: string;
  status?: ShardStatus;
  confidence?: number;
  source?: string;
}

/**
 * ShardDAO - Data Access Object for shard registry operations
 * Provides efficient lookups and tracking of shards in D1
 */
export class ShardDAO extends BaseDAOClass {
  /**
   * Register a new shard in D1
   */
  async registerShard(input: CreateShardRegistryInput): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO shard_registry (
        shard_id, campaign_id, resource_id, resource_name,
        r2_key, shard_type, status, confidence, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    await stmt
      .bind(
        input.shard_id,
        input.campaign_id,
        input.resource_id,
        input.resource_name,
        input.r2_key,
        input.shard_type,
        input.status || "staging",
        input.confidence || null,
        input.source || null
      )
      .run();
  }

  /**
   * Register multiple shards in a batch (more efficient)
   */
  async registerShardsBatch(inputs: CreateShardRegistryInput[]): Promise<void> {
    if (inputs.length === 0) return;

    const stmt = this.db.prepare(`
      INSERT INTO shard_registry (
        shard_id, campaign_id, resource_id, resource_name,
        r2_key, shard_type, status, confidence, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const batch = inputs.map((input) =>
      stmt.bind(
        input.shard_id,
        input.campaign_id,
        input.resource_id,
        input.resource_name,
        input.r2_key,
        input.shard_type,
        input.status || "staging",
        input.confidence || null,
        input.source || null
      )
    );

    await this.db.batch(batch);
  }

  /**
   * Get shard by ID (O(1) lookup)
   */
  async getShardById(shardId: string): Promise<ShardRegistryRecord | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM shard_registry
      WHERE shard_id = ? AND deleted_at IS NULL
    `);

    const result = await stmt.bind(shardId).first<ShardRegistryRecord>();
    return result || null;
  }

  /**
   * Get all shards for a campaign with optional status filter
   */
  async getShardsByCampaign(
    campaignId: string,
    status?: ShardStatus
  ): Promise<ShardRegistryRecord[]> {
    let query = `
      SELECT * FROM shard_registry
      WHERE campaign_id = ? AND deleted_at IS NULL
    `;

    const params: (string | number)[] = [campaignId];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY created_at DESC";

    const stmt = this.db.prepare(query);
    const result = await stmt.bind(...params).all<ShardRegistryRecord>();
    return result.results || [];
  }

  /**
   * Get shards by resource
   */
  async getShardsByResource(
    resourceId: string,
    status?: ShardStatus
  ): Promise<ShardRegistryRecord[]> {
    let query = `
      SELECT * FROM shard_registry
      WHERE resource_id = ? AND deleted_at IS NULL
    `;

    const params: (string | number)[] = [resourceId];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY created_at DESC";

    const stmt = this.db.prepare(query);
    const result = await stmt.bind(...params).all<ShardRegistryRecord>();
    return result.results || [];
  }

  /**
   * Update shard status (approve/reject/delete)
   */
  async updateShardStatus(
    shardId: string,
    status: ShardStatus,
    r2Key: string,
    rejectionReason?: string
  ): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE shard_registry
      SET status = ?, r2_key = ?, rejection_reason = ?
      WHERE shard_id = ?
    `);

    await stmt.bind(status, r2Key, rejectionReason || null, shardId).run();
  }

  /**
   * Update shard status for multiple shards (batch operation)
   */
  async updateShardStatusBatch(
    updates: Array<{
      shardId: string;
      status: ShardStatus;
      r2Key: string;
      rejectionReason?: string;
    }>
  ): Promise<void> {
    if (updates.length === 0) return;

    const stmt = this.db.prepare(`
      UPDATE shard_registry
      SET status = ?, r2_key = ?, rejection_reason = ?
      WHERE shard_id = ?
    `);

    const batch = updates.map((update) =>
      stmt.bind(
        update.status,
        update.r2Key,
        update.rejectionReason || null,
        update.shardId
      )
    );

    await this.db.batch(batch);
  }

  /**
   * Soft delete a shard
   */
  async softDeleteShard(shardId: string): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE shard_registry
      SET status = 'deleted', deleted_at = datetime('now')
      WHERE shard_id = ?
    `);

    await stmt.bind(shardId).run();
  }

  /**
   * Hard delete a shard from registry
   */
  async deleteShard(shardId: string): Promise<void> {
    const stmt = this.db.prepare(`
      DELETE FROM shard_registry WHERE shard_id = ?
    `);

    await stmt.bind(shardId).run();
  }

  /**
   * Delete all shards for a resource
   */
  async deleteShardsByResource(resourceId: string): Promise<void> {
    const stmt = this.db.prepare(`
      DELETE FROM shard_registry WHERE resource_id = ?
    `);

    await stmt.bind(resourceId).run();
  }

  /**
   * Get shard count by status for a campaign
   */
  async getShardCountByStatus(
    campaignId: string
  ): Promise<{ status: string; count: number }[]> {
    const stmt = this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM shard_registry
      WHERE campaign_id = ? AND deleted_at IS NULL
      GROUP BY status
    `);

    const result = await stmt
      .bind(campaignId)
      .all<{ status: string; count: number }>();
    return result.results || [];
  }

  /**
   * Check if shard exists
   */
  async shardExists(shardId: string): Promise<boolean> {
    const stmt = this.db.prepare(`
      SELECT 1 FROM shard_registry
      WHERE shard_id = ? AND deleted_at IS NULL
      LIMIT 1
    `);

    const result = await stmt.bind(shardId).first<{ "1": number }>();
    return result !== null;
  }
}

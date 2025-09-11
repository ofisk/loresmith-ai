import type { D1Database } from "@cloudflare/workers-types";
import { SHARD_STATUSES, type ShardStatus } from "../lib/content-types";
import type { CreateShardData, DatabaseShard } from "../types/shard";

export type StagedShard = DatabaseShard;
export type CreateStagedShardData = CreateShardData;

export class StagedShardsDAO {
  constructor(private db: D1Database) {}

  /**
   * Create a new staged shard
   */
  async createShard(data: CreateStagedShardData): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `
      insert into staged_shards (
        id, campaign_id, resource_id, shard_type, content, metadata, 
        status, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, 'staged', ?, ?)
    `
      )
      .bind(
        data.id,
        data.campaign_id,
        data.resource_id,
        data.shard_type,
        data.content,
        data.metadata || null,
        now,
        now
      )
      .run();
  }

  /**
   * Create multiple staged shards in a batch
   */
  async createStagedShards(shards: CreateStagedShardData[]): Promise<void> {
    if (shards.length === 0) return;

    console.log(`[StagedShardsDAO] Creating ${shards.length} staged shards`);
    console.log(`[StagedShardsDAO] Shard preview:`, shards.slice(0, 2));

    const now = new Date().toISOString();
    const batch = this.db.batch(
      shards.map((shard) =>
        this.db
          .prepare(
            `
          insert into staged_shards (
            id, campaign_id, resource_id, shard_type, content, metadata, 
            status, created_at, updated_at
          ) values (?, ?, ?, ?, ?, ?, 'staged', ?, ?)
        `
          )
          .bind(
            shard.id,
            shard.campaign_id,
            shard.resource_id,
            shard.shard_type,
            shard.content,
            shard.metadata || null,
            now,
            now
          )
      )
    );

    await batch;
    console.log(
      `[StagedShardsDAO] Successfully created ${shards.length} staged shards`
    );
  }

  /**
   * Get all staged shards for a campaign
   */
  async getStagedShardsByCampaign(campaignId: string): Promise<StagedShard[]> {
    console.log(
      `[StagedShardsDAO] Querying staged shards for campaign: "${campaignId}"`
    );
    console.log(
      `[StagedShardsDAO] Looking for status: "${SHARD_STATUSES.STAGED}"`
    );

    const result = await this.db
      .prepare(
        `
      select * from staged_shards 
      where campaign_id = ? and status = ?
      order by created_at desc
    `
      )
      .bind(campaignId, SHARD_STATUSES.STAGED)
      .all<StagedShard>();

    console.log(`[StagedShardsDAO] Query result:`, {
      success: result.success,
      resultsCount: result.results?.length || 0,
      results: result.results,
    });

    return result.results || [];
  }

  /**
   * Get all shards for a campaign (any status)
   */
  async getShardsByCampaign(campaignId: string): Promise<StagedShard[]> {
    console.log(
      `[StagedShardsDAO] Querying ALL shards for campaign: "${campaignId}"`
    );

    const result = await this.db
      .prepare(
        `
      select * from staged_shards 
      where campaign_id = ?
      order by created_at desc
    `
      )
      .bind(campaignId)
      .all<StagedShard>();

    console.log(`[StagedShardsDAO] All shards query result:`, {
      success: result.success,
      resultsCount: result.results?.length || 0,
      results: result.results,
    });

    return result.results || [];
  }

  /**
   * Get shards by resource
   */
  async getShardsByResource(resourceId: string): Promise<StagedShard[]> {
    const result = await this.db
      .prepare(
        `
      select * from staged_shards 
      where resource_id = ?
      order by created_at desc
    `
      )
      .bind(resourceId)
      .all<StagedShard>();

    return result.results || [];
  }

  /**
   * Update shard status (approve/reject)
   */
  async updateShardStatus(shardId: string, status: ShardStatus): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `
      update staged_shards 
      set status = ?, updated_at = ?
      where id = ?
    `
      )
      .bind(status, now, shardId)
      .run();
  }

  /**
   * Bulk update shard statuses (approve/reject multiple shards)
   */
  async bulkUpdateShardStatuses(
    shardIds: string[],
    status: ShardStatus
  ): Promise<void> {
    if (shardIds.length === 0) return;

    const now = new Date().toISOString();
    const batch = this.db.batch(
      shardIds.map((shardId) =>
        this.db
          .prepare(
            `
          update staged_shards 
          set status = ?, updated_at = ?
          where id = ?
        `
          )
          .bind(status, now, shardId)
      )
    );

    await batch;
  }

  /**
   * Delete a shard
   */
  async deleteShard(shardId: string): Promise<void> {
    await this.db
      .prepare(
        `
      delete from staged_shards where id = ?
    `
      )
      .bind(shardId)
      .run();
  }

  /**
   * Delete all shards for a campaign
   */
  async deleteShardsByCampaign(campaignId: string): Promise<void> {
    await this.db
      .prepare(
        `
      delete from staged_shards where campaign_id = ?
    `
      )
      .bind(campaignId)
      .run();
  }

  /**
   * Delete all shards for a resource
   */
  async deleteShardsByResource(resourceId: string): Promise<void> {
    await this.db
      .prepare(
        `
      delete from staged_shards where resource_id = ?
    `
      )
      .bind(resourceId)
      .run();
  }

  /**
   * Get shard by ID
   */
  async getShardById(shardId: string): Promise<StagedShard | null> {
    const result = await this.db
      .prepare(
        `
      select * from staged_shards where id = ?
    `
      )
      .bind(shardId)
      .first<StagedShard>();

    return result || null;
  }

  /**
   * Search shards by content (for approved shards)
   */
  async searchApprovedShards(
    campaignId: string,
    query: string
  ): Promise<StagedShard[]> {
    const result = await this.db
      .prepare(
        `
      select * from staged_shards 
      where campaign_id = ? and status = ? 
      and (content like ? or shard_type like ?)
      order by created_at desc
    `
      )
      .bind(campaignId, SHARD_STATUSES.APPROVED, `%${query}%`, `%${query}%`)
      .all<StagedShard>();

    return result.results || [];
  }

  /**
   * Debug method: Get all shards in the database (for troubleshooting)
   */
  async getAllShards(): Promise<StagedShard[]> {
    console.log(`[StagedShardsDAO] DEBUG: Querying ALL shards in database`);

    const result = await this.db
      .prepare(
        `
      select * from staged_shards 
      order by created_at desc
    `
      )
      .all<StagedShard>();

    console.log(`[StagedShardsDAO] DEBUG: All shards in database:`, {
      success: result.success,
      resultsCount: result.results?.length || 0,
      results: result.results,
    });

    return result.results || [];
  }
}

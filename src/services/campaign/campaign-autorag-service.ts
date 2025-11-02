import type { Env } from "@/middleware/auth";
import type {
  RejectedShard,
  ShardCandidate,
  ShardExpansion,
} from "@/types/shard";
import type {
  AutoRAGSearchOptions,
  AutoRAGSearchResult,
} from "@/services/rag/autorag-base-service";
import { AutoRAGClientBase } from "@/services/rag/autorag-base-service";
import type { ShardDAO } from "@/dao/shard-dao";

/**
 * Campaign-specific AutoRAG service
 * Provides campaign-scoped RAG functionality with three-folder approval system:
 *
 * 1. /staging/ - Shards awaiting user review (not searchable)
 * 2. /context/approved/ - User-approved shards (searchable via enforcedFilter)
 * 3. /context/rejected/ - User-rejected shards (permanently excluded from search)
 *
 * All search operations automatically filter to approved content only via enforcedFilter()
 */
export class CampaignAutoRAG extends AutoRAGClientBase {
  private campaignRagBasePath: string;
  private shardDAO: ShardDAO | null;

  constructor(
    env: Env,
    baseUrl: string,
    campaignRagBasePath: string,
    shardDAO?: ShardDAO
  ) {
    super(env, baseUrl);
    this.campaignRagBasePath = campaignRagBasePath;
    this.shardDAO = shardDAO || null;
  }

  /**
   * Initialize campaign folders (staging, approved, rejected)
   */
  async initFolders(): Promise<void> {
    console.log(
      `[CampaignAutoRAG] Initializing folders for campaign: ${this.campaignRagBasePath}`
    );

    await this.ensureFolders(this.campaignRagBasePath, [
      "staging",
      "approved",
      "rejected",
    ]);

    console.log(`[CampaignAutoRAG] Campaign folders initialized successfully`);
  }

  /**
   * Save shard candidates to staging
   */
  async saveShardCandidates(
    sourceRef: { fileKey: string; meta?: Record<string, any> },
    shards: ShardCandidate[]
  ): Promise<void> {
    console.log(
      `[CampaignAutoRAG] Saving ${shards.length} shard candidates to staging`
    );

    const stagingKey = `${this.campaignRagBasePath}/staging/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.json`;

    const stagingData = {
      sourceRef,
      shards,
      created_at: new Date().toISOString(),
      campaignRagBasePath: this.campaignRagBasePath,
    };

    await this.r2Helper.put(
      stagingKey,
      new TextEncoder().encode(JSON.stringify(stagingData)).buffer,
      "application/json"
    );

    console.log(`[CampaignAutoRAG] Saved shard candidates to: ${stagingKey}`);
  }

  /**
   * Save shard candidates to individual staging files (preferred for per-shard approval)
   * Each shard will be written to: `${base}/staging/${resourceId}/${shardId}.json`
   */
  async saveShardCandidatesPerShard(
    resourceId: string,
    shards: ShardCandidate[],
    extraMeta?: { fileName?: string }
  ): Promise<void> {
    if (!Array.isArray(shards) || shards.length === 0) {
      console.log(
        `[CampaignAutoRAG] No shard candidates provided for resource ${resourceId}; skipping save.`
      );
      return;
    }

    const registryInputs = [];

    for (const shard of shards) {
      const key = `${this.campaignRagBasePath}/staging/${resourceId}/${shard.id}.json`;
      const payload = {
        resourceId,
        shard,
        fileName: extraMeta?.fileName,
        created_at: new Date().toISOString(),
        campaignRagBasePath: this.campaignRagBasePath,
      };
      if (!shard?.id || !shard?.metadata) {
        console.warn(
          `[CampaignAutoRAG] Skipping invalid shard for resource ${resourceId}:`,
          Object.keys(shard || {})
        );
        continue;
      }
      await this.r2Helper.put(
        key,
        new TextEncoder().encode(JSON.stringify(payload)).buffer,
        "application/json"
      );

      // Register in D1 if DAO is available
      if (this.shardDAO) {
        registryInputs.push({
          shard_id: shard.id,
          campaign_id: shard.metadata.campaignId,
          resource_id: resourceId,
          resource_name: extraMeta?.fileName || shard.metadata.fileName,
          r2_key: key,
          shard_type: shard.metadata.entityType,
          status: "staging" as const,
          confidence: shard.metadata.confidence,
          source: shard.metadata.source,
        });
      }
    }

    // Batch register all shards in D1
    if (this.shardDAO && registryInputs.length > 0) {
      await this.shardDAO.registerShardsBatch(registryInputs);
      console.log(
        `[CampaignAutoRAG] Registered ${registryInputs.length} shards in D1`
      );
    }

    console.log(
      `[CampaignAutoRAG] Saved ${shards.length} per-shard candidates under ${this.campaignRagBasePath}/staging/${resourceId}/`
    );
  }

  /**
   * List all staged shard candidate objects (supports legacy multi-shard files and per-shard files)
   */
  async listStagedCandidates(): Promise<
    {
      resourceId: string;
      shard: ShardCandidate;
      key: string;
      fileName?: string;
    }[]
  > {
    const results: {
      resourceId: string;
      shard: ShardCandidate;
      key: string;
      fileName?: string;
    }[] = [];
    const prefix = `${this.campaignRagBasePath}/staging/`;
    const list = await this.env.R2.list({ prefix, limit: 1000 });
    for (const obj of list.objects) {
      try {
        const buf = await this.r2Helper.get(obj.key);
        if (!buf) continue;
        const parsed = JSON.parse(new TextDecoder().decode(buf));
        if (Array.isArray(parsed?.shards)) {
          const resourceId: string = parsed?.sourceRef?.fileKey || "unknown";
          const fileName: string | undefined =
            parsed?.sourceRef?.meta?.fileName;
          for (const item of parsed.shards as ShardCandidate[]) {
            results.push({ resourceId, shard: item, key: obj.key, fileName });
          }
        } else if (parsed?.shard && parsed?.resourceId) {
          results.push({
            resourceId: parsed.resourceId as string,
            shard: parsed.shard as ShardCandidate,
            key: obj.key,
            fileName: parsed.fileName as string | undefined,
          });
        }
      } catch (e) {
        console.warn(
          `[CampaignAutoRAG] Failed to parse staged object ${obj.key}:`,
          e
        );
      }
    }
    return results;
  }

  /**
   * Approve shards by moving from staging to approved
   */
  async approveShards(
    stagingKey: string,
    expansions?: ShardExpansion[]
  ): Promise<void> {
    console.log(`[CampaignAutoRAG] Approving shards from: ${stagingKey}`);

    // Read staging data
    const stagingObject = await this.env.R2.get(stagingKey);
    if (!stagingObject) {
      throw new Error(`Staging file not found: ${stagingKey}`);
    }

    // Parse staging data to validate it exists
    JSON.parse(await stagingObject.text());

    // Move to approved (always use /context/approved/ regardless of staging path)
    // Extract campaign base path by finding the campaign ID and reconstructing the path
    const pathParts = stagingKey.split("/");
    // Look for campaigns directory and take the next part as campaign ID
    const campaignsIndex = pathParts.indexOf("campaigns");
    if (campaignsIndex === -1) {
      throw new Error(
        `Invalid staging path - no campaigns directory found: ${stagingKey}`
      );
    }
    const campaignBasePath = pathParts.slice(0, campaignsIndex + 2).join("/"); // campaigns + campaign-id
    const filename = pathParts[pathParts.length - 1];
    const approvedKey = `${campaignBasePath}/context/approved/${filename}`;
    await this.r2Helper.move(stagingKey, approvedKey);

    // If expansions provided, create expansion file
    if (expansions && expansions.length > 0) {
      const expansionKey = approvedKey.replace(".json", ".exp.json");
      const expansionData = {
        expansions,
        approved_at: new Date().toISOString(),
        original_staging_key: stagingKey,
      };

      await this.r2Helper.put(
        expansionKey,
        new TextEncoder().encode(JSON.stringify(expansionData)).buffer,
        "application/json"
      );

      console.log(`[CampaignAutoRAG] Created expansion file: ${expansionKey}`);
    }

    console.log(`[CampaignAutoRAG] Approved shards moved to: ${approvedKey}`);
  }

  /**
   * Reject shards by moving from staging to rejected
   */
  async rejectShards(stagingKey: string, reason: string): Promise<void> {
    console.log(
      `[CampaignAutoRAG] Rejecting shards from: ${stagingKey} with reason: ${reason}`
    );

    // Read staging data
    const stagingObject = await this.env.R2.get(stagingKey);
    if (!stagingObject) {
      throw new Error(`Staging file not found: ${stagingKey}`);
    }

    // Parse staging data to validate it exists
    const stagingData = JSON.parse(await stagingObject.text());

    // Create rejected data wrapper
    const rejectedData: RejectedShard = {
      rejectedAt: new Date().toISOString(),
      reason,
      payload: stagingData,
    };

    // Move to rejected (always use /context/rejected/ regardless of staging path)
    // Extract campaign base path by finding the campaign ID and reconstructing the path
    const pathParts = stagingKey.split("/");
    // Look for campaigns directory and take the next part as campaign ID
    const campaignsIndex = pathParts.indexOf("campaigns");
    if (campaignsIndex === -1) {
      throw new Error(
        `Invalid staging path - no campaigns directory found: ${stagingKey}`
      );
    }
    const campaignBasePath = pathParts.slice(0, campaignsIndex + 2).join("/"); // campaigns + campaign-id
    const filename = pathParts[pathParts.length - 1];
    const rejectedKey = `${campaignBasePath}/context/rejected/${filename}`;
    await this.r2Helper.put(
      rejectedKey,
      new TextEncoder().encode(JSON.stringify(rejectedData)).buffer,
      "application/json"
    );

    // Delete staging file
    await this.r2Helper.delete(stagingKey);

    console.log(`[CampaignAutoRAG] Rejected shards moved to: ${rejectedKey}`);
  }

  /**
   * Search rejected shards (admin/QA only)
   */
  async searchRejected(
    query: string,
    options: AutoRAGSearchOptions = {}
  ): Promise<AutoRAGSearchResult> {
    console.log(
      `[CampaignAutoRAG] Searching rejected shards with query: ${query}`
    );

    return await this.autoRagClient.search(query, options);
  }

  /**
   * Enforced filter that scopes search to approved content only
   */
  protected enforcedFilter(): string | null {
    return `${this.campaignRagBasePath}/context/approved/`;
  }

  /**
   * Get staged shards
   */
  async getStagedShards(): Promise<any[]> {
    console.log(
      `[CampaignAutoRAG] Getting staged shards from: ${this.campaignRagBasePath}/staging/`
    );

    try {
      const stagingFolder = `${this.campaignRagBasePath}/staging/`;
      const listResult = await this.env.R2.list({
        prefix: stagingFolder,
        limit: 1000,
      });

      const stagedShards = [];

      for (const object of listResult.objects) {
        try {
          const content = await this.r2Helper.get(object.key);
          if (content) {
            const data = JSON.parse(new TextDecoder().decode(content));
            stagedShards.push({
              key: object.key,
              ...data,
            });
          }
        } catch (error) {
          console.warn(
            `[CampaignAutoRAG] Error reading staged shard ${object.key}:`,
            error
          );
        }
      }

      console.log(
        `[CampaignAutoRAG] Found ${stagedShards.length} staged shards`
      );
      return stagedShards;
    } catch (error) {
      console.error(`[CampaignAutoRAG] Error getting staged shards:`, error);
      return [];
    }
  }

  /**
   * Get campaign RAG base path
   */
  getCampaignRagBasePath(): string {
    return this.campaignRagBasePath;
  }
}

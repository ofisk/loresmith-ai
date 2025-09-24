import type { Env } from "../middleware/auth";
import type {
  RejectedShard,
  ShardCandidate,
  ShardExpansion,
} from "../types/shard";
import type {
  AutoRAGSearchOptions,
  AutoRAGSearchResult,
} from "./autorag-client";
import { AutoRAGClientBase } from "./autorag-client";

/**
 * Campaign-specific AutoRAG service
 * Provides campaign-scoped RAG functionality with staging, approved, and rejected lanes
 */
export class CampaignAutoRAG extends AutoRAGClientBase {
  private campaignRagBasePath: string;

  constructor(env: Env, baseUrl: string, campaignRagBasePath: string) {
    super(env, baseUrl);
    this.campaignRagBasePath = campaignRagBasePath;
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

    // Move to approved
    const approvedKey = stagingKey.replace("/staging/", "/approved/");
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

    // Move to rejected
    const rejectedKey = stagingKey.replace("/staging/", "/rejected/");
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

    const rejectedFolder = `${this.campaignRagBasePath}/rejected/`;
    const searchOptions = {
      ...options,
      filters: {
        type: "and" as const,
        filters: [
          {
            type: "eq" as const,
            key: "folder",
            value: rejectedFolder,
          },
        ],
      },
    };

    return await this.autoRagClient.search(query, searchOptions);
  }

  /**
   * Enforced filter that scopes search to approved content only
   */
  protected enforcedFilter(): string | null {
    return `${this.campaignRagBasePath}/approved/`;
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

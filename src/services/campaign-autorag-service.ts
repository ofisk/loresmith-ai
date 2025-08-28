import type { Env } from "../middleware/auth";
import type {
  AutoRAGSearchOptions,
  AutoRAGSearchResult,
} from "./autorag-client";
import { AutoRAGClientBase } from "./autorag-client";

export interface SnippetCandidate {
  id: string;
  text: string;
  metadata: Record<string, any>;
  sourceRef?: {
    fileKey: string;
    meta?: Record<string, any>;
  };
}

export interface SnippetExpansion {
  originalText: string;
  expandedText: string;
  reasoning: string;
  metadata?: Record<string, any>;
}

export interface RejectedSnippet {
  rejectedAt: string;
  reason: string;
  payload: SnippetCandidate;
}

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
   * Save snippet candidates to staging
   */
  async saveSnippetCandidates(
    sourceRef: { fileKey: string; meta?: Record<string, any> },
    snippets: SnippetCandidate[]
  ): Promise<void> {
    console.log(
      `[CampaignAutoRAG] Saving ${snippets.length} snippet candidates to staging`
    );

    const stagingKey = `${this.campaignRagBasePath}/staging/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.json`;

    const stagingData = {
      sourceRef,
      snippets,
      created_at: new Date().toISOString(),
      campaignRagBasePath: this.campaignRagBasePath,
    };

    await this.r2Helper.put(
      stagingKey,
      new TextEncoder().encode(JSON.stringify(stagingData)).buffer,
      "application/json"
    );

    console.log(`[CampaignAutoRAG] Saved snippet candidates to: ${stagingKey}`);
  }

  /**
   * Approve snippets by moving from staging to approved
   */
  async approveSnippets(
    stagingKey: string,
    expansions?: SnippetExpansion[]
  ): Promise<void> {
    console.log(`[CampaignAutoRAG] Approving snippets from: ${stagingKey}`);

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

    console.log(`[CampaignAutoRAG] Approved snippets moved to: ${approvedKey}`);
  }

  /**
   * Reject snippets by moving from staging to rejected
   */
  async rejectSnippets(stagingKey: string, reason: string): Promise<void> {
    console.log(
      `[CampaignAutoRAG] Rejecting snippets from: ${stagingKey} with reason: ${reason}`
    );

    // Read staging data
    const stagingObject = await this.env.R2.get(stagingKey);
    if (!stagingObject) {
      throw new Error(`Staging file not found: ${stagingKey}`);
    }

    // Parse staging data to validate it exists
    const stagingData = JSON.parse(await stagingObject.text());

    // Create rejected data wrapper
    const rejectedData: RejectedSnippet = {
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

    console.log(`[CampaignAutoRAG] Rejected snippets moved to: ${rejectedKey}`);
  }

  /**
   * Search rejected snippets (admin/QA only)
   */
  async searchRejected(
    query: string,
    options: AutoRAGSearchOptions = {}
  ): Promise<AutoRAGSearchResult> {
    console.log(
      `[CampaignAutoRAG] Searching rejected snippets with query: ${query}`
    );

    const rejectedFolder = `${this.campaignRagBasePath}/rejected/`;
    const searchOptions = { ...options, folder: rejectedFolder };

    return await this.autoRagClient.search(query, searchOptions);
  }

  /**
   * Enforced filter that scopes search to approved content only
   */
  protected enforcedFilter(): string | null {
    return `${this.campaignRagBasePath}/approved/`;
  }

  /**
   * Get staged snippets
   */
  async getStagedSnippets(): Promise<any[]> {
    console.log(
      `[CampaignAutoRAG] Getting staged snippets from: ${this.campaignRagBasePath}/staging/`
    );

    try {
      const stagingFolder = `${this.campaignRagBasePath}/staging/`;
      const listResult = await this.env.R2.list({
        prefix: stagingFolder,
        limit: 1000,
      });

      const stagedSnippets = [];

      for (const object of listResult.objects) {
        try {
          const content = await this.r2Helper.get(object.key);
          if (content) {
            const data = JSON.parse(new TextDecoder().decode(content));
            stagedSnippets.push({
              key: object.key,
              ...data,
            });
          }
        } catch (error) {
          console.warn(
            `[CampaignAutoRAG] Error reading staged snippet ${object.key}:`,
            error
          );
        }
      }

      console.log(
        `[CampaignAutoRAG] Found ${stagedSnippets.length} staged snippets`
      );
      return stagedSnippets;
    } catch (error) {
      console.error(`[CampaignAutoRAG] Error getting staged snippets:`, error);
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

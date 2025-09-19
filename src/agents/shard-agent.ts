import { getDAOFactory } from "../dao/dao-factory";
import { SHARD_STATUSES } from "../lib/content-types";
import { ShardFactory } from "../lib/shard-factory";
import { resolveCampaignIdentifier } from "../tools/campaign";
import { shardTools } from "../tools/shard";
import type {
  AISearchResponse,
  CampaignResource,
  ShardCandidate,
  StagedShardGroup,
} from "../types/shard";
import { BaseAgent } from "./base-agent";
import { buildSystemPrompt } from "./systemPrompts";

// Shard Agent System Prompt Configuration
const SHARD_AGENT_CONFIG = {
  agentName: "Shard Management Agent",
  responsibilities: [
    "Shard Discovery: Help users find and explore shards in their campaigns",
    "Shard Creation: Assist with creating new shards from AI responses",
    "Shard Management: Guide users through approval and rejection workflows",
    "Shard Integration: Help users leverage approved shards",
  ],
  tools: {
    discover_shards: "Find shards with various filters",
    search_approved_shards: "Search through approved content",
    get_shard_stats: "Get campaign shard statistics",
    approve_shards: "Approve selected shards",
    reject_shards: "Reject shards with reasoning",
    create_shards: "Create new shards from AI responses",
    get_shard_details: "Get detailed shard information",
    get_all_campaigns:
      "Get all campaigns to help identify correct campaign names",
    extract_campaign_name_from_message:
      "Extract campaign name from user messages and resolve to campaign ID",
    render_shard_management_ui:
      "Render shard management interface in chat for user interaction",
    render_shard_approval_ui: "Render focused shard approval interface in chat",
  },
  workflowGuidelines: [
    "Always consider the campaign context when making decisions",
    "Provide clear reasoning for approval/rejection decisions",
    "Help users understand the value of different shard types",
    "Suggest ways to use approved shards in gameplay",
    "Maintain consistency with campaign themes and settings",
    "Be helpful and informative",
    "Ask clarifying questions when needed",
    "Provide actionable advice",
    "Explain the impact of decisions",
    "Help users make informed choices about their content",
    "When a campaign is not found, use get_all_campaigns to show available campaigns",
    "Never assume campaign names from file names - always verify campaign existence",
    "If shards are not found, check if the campaign name is correct and suggest alternatives",
    "Look for Campaign ID in user messages - they may contain the exact campaign ID to use",
    "Extract campaign names from user messages (format: Campaign: name) and resolve to campaign ID",
    "Never ask users for technical details like campaign IDs - guide them through the natural workflow instead",
    "When users mention files, guide them to add files to campaigns from their library to extract shards and enhance planning capabilities",
    "IMPORTANT: When users ask to see shards, ALWAYS call discover_shards first to get the actual shard data, then use render_shard_management_ui to display them",
    "NEVER use render_shard_management_ui without first calling discover_shards to get the shard data",
    "Always extract campaign name from user messages and resolve to campaign ID before calling discover_shards",
  ],
  specialization:
    "You're helping users curate and organize their campaign knowledge base. Quality over quantity - help them focus on content that will enhance their gaming experience.",
};

const SHARD_AGENT_PROMPT = buildSystemPrompt(SHARD_AGENT_CONFIG);

import type { Env } from "../middleware/auth";

/**
 * Shard Agent
 * Centralized agent for handling all shard-related operations:
 * - Discovery: Query existing shards, search approved content
 * - Creation: Generate shards from resources, parse AI responses
 * - Management: Approve/reject shards, organize by campaign
 * - Integration: Connect with existing campaign and resource systems
 */
export class ShardAgent extends BaseAgent {
  private stagedShardsDAO: ReturnType<typeof getDAOFactory>["stagedShardsDAO"];

  /** Agent metadata for registration and routing */
  static readonly agentMetadata = {
    type: "shards" as const,
    description:
      "Manages RPG campaign shards including discovery, creation, approval, and rejection workflows",
    systemPrompt: SHARD_AGENT_PROMPT,
    tools: shardTools,
  };

  constructor(ctx: DurableObjectState, env: Env, model: any) {
    super(ctx, env as any, model, shardTools);

    const daoFactory = getDAOFactory(env);
    this.stagedShardsDAO = daoFactory.stagedShardsDAO;
  }

  /**
   * Discover shards for a campaign
   */
  async discoverShards(
    campaignId: string,
    options: {
      status?: "staged" | "approved" | "rejected" | "all";
      resourceId?: string;
      shardType?: string;
      limit?: number;
    } = {}
  ): Promise<{
    shards: StagedShardGroup[];
    total: number;
    status: string;
  }> {
    const { status = "staged", resourceId, shardType, limit = 100 } = options;

    try {
      console.log(
        `[ShardAgent] Discovering shards for campaign: ${campaignId}`,
        options
      );

      // Resolve campaign identifier if not a UUID
      const uuidRegex =
        /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
      let effectiveCampaignId = campaignId;
      console.log(`[ShardAgent] Original campaignId: "${campaignId}"`);
      console.log(
        `[ShardAgent] Is UUID format: ${uuidRegex.test(String(campaignId))}`
      );

      if (!uuidRegex.test(String(campaignId))) {
        console.log(
          `[ShardAgent] Campaign ID is not UUID format, attempting to resolve...`
        );
        console.log(
          `[ShardAgent] DEBUG: Attempting to resolve campaign name: "${campaignId}"`
        );
        try {
          const res = await (resolveCampaignIdentifier as any).execute(
            { campaignName: campaignId },
            { env: (this as any).env }
          );
          console.log(`[ShardAgent] Campaign resolution result:`, res);
          if (res?.success && res.data?.campaignId) {
            effectiveCampaignId = res.data.campaignId;
            console.log(
              `[ShardAgent] Resolved campaign name '${campaignId}' -> '${effectiveCampaignId}'`
            );
          } else {
            console.warn(
              `[ShardAgent] Campaign resolution failed for '${campaignId}' - this campaign does not exist`
            );
            console.log(
              `[ShardAgent] DEBUG: Available campaigns should be checked with getAllCampaignsTool`
            );
            // Return empty result instead of throwing error
            return {
              shards: [],
              total: 0,
              status: "campaign_not_found",
            };
          }
        } catch (e) {
          console.warn(`[ShardAgent] Failed to resolve campaign id:`, e);
          // Return empty result instead of throwing error
          return {
            shards: [],
            total: 0,
            status: "campaign_resolution_failed",
          };
        }
      } else {
        console.log(
          `[ShardAgent] Campaign ID is already in UUID format, using as-is`
        );
        console.log(
          `[ShardAgent] DEBUG: Using UUID campaign ID: "${campaignId}"`
        );
      }

      console.log(
        `[ShardAgent] Effective campaign ID: "${effectiveCampaignId}"`
      );

      let shards: any[] = [];

      if (status === "staged" || status === "all") {
        console.log(
          `[ShardAgent] Querying staged shards for campaign: "${effectiveCampaignId}"`
        );
        const stagedShards =
          await this.stagedShardsDAO.getStagedShardsByCampaign(
            effectiveCampaignId
          );
        console.log(
          `[ShardAgent] Found ${stagedShards.length} staged shards:`,
          stagedShards
        );
        shards.push(...stagedShards);
      }

      if (status === "approved" || status === "all") {
        // Get approved shards (implement search if needed)
        const allShardsList =
          await this.stagedShardsDAO.getShardsByCampaign(effectiveCampaignId);
        const approvedShards = allShardsList.filter(
          (s: any) => s.status === SHARD_STATUSES.APPROVED
        );
        shards.push(...approvedShards);
      }

      if (status === "rejected" || status === "all") {
        const allShardsList2 =
          await this.stagedShardsDAO.getShardsByCampaign(effectiveCampaignId);
        const rejectedShards = allShardsList2.filter(
          (s: any) => s.status === SHARD_STATUSES.REJECTED
        );
        shards.push(...rejectedShards);
      }

      // Filter by resource if specified
      if (resourceId) {
        shards = shards.filter((s) => s.resource_id === resourceId);
      }

      // Filter by shard type if specified
      if (shardType) {
        shards = shards.filter((s) => s.shard_type === shardType);
      }

      // Apply limit
      if (limit && shards.length > limit) {
        shards = shards.slice(0, limit);
      }

      // Group shards by resource for better organization
      const groupedShards = this.groupShardsByResource(
        shards,
        effectiveCampaignId
      );

      console.log(
        `[ShardAgent] Found ${shards.length} shards, grouped into ${groupedShards.length} resources`
      );

      return {
        shards: groupedShards,
        total: shards.length,
        status: "success",
      };
    } catch (error) {
      console.error(`[ShardAgent] Error discovering shards:`, error);
      throw new Error(
        `Failed to discover shards: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Create shards from AI response
   */
  async createShards(
    aiResponse: AISearchResponse,
    resource: CampaignResource,
    campaignId: string
  ): Promise<{
    created: number;
    shards: ShardCandidate[];
    status: string;
  }> {
    try {
      console.log(
        `[ShardAgent] Creating shards from AI response for resource: ${resource.id}`
      );
      console.log(
        `[ShardAgent] Campaign ID for shard creation: "${campaignId}"`
      );
      console.log(`[ShardAgent] Resource details:`, resource);

      // Parse AI response into shard candidates
      const shardCandidates = ShardFactory.parseAISearchResponse(
        aiResponse,
        resource,
        campaignId
      );

      if (shardCandidates.length === 0) {
        console.log(`[ShardAgent] No valid shards found in AI response`);
        return {
          created: 0,
          shards: [],
          status: "no_shards_found",
        };
      }

      // Convert to database format
      const dbShards = ShardFactory.toDatabaseFormat(
        shardCandidates,
        campaignId,
        resource.id
      );

      console.log(
        `[ShardAgent] Converted ${dbShards.length} shards to database format`
      );
      console.log(
        `[ShardAgent] Database shards preview:`,
        dbShards.slice(0, 2)
      );

      // Store in database
      await this.stagedShardsDAO.createStagedShards(dbShards);

      console.log(
        `[ShardAgent] Successfully created ${dbShards.length} shards`
      );

      return {
        created: dbShards.length,
        shards: shardCandidates,
        status: "success",
      };
    } catch (error) {
      console.error(`[ShardAgent] Error creating shards:`, error);
      throw new Error(
        `Failed to create shards: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Approve shards
   */
  async approveShards(
    campaignId: string,
    shardIds: string[]
  ): Promise<{
    approved: number;
    status: string;
  }> {
    try {
      console.log(
        `[ShardAgent] Approving ${shardIds.length} shards for campaign: ${campaignId}`
      );

      if (shardIds.length === 0) {
        return { approved: 0, status: "no_shards_to_approve" };
      }

      // Update shard statuses to approved
      await this.stagedShardsDAO.bulkUpdateShardStatuses(
        shardIds,
        SHARD_STATUSES.APPROVED
      );

      console.log(
        `[ShardAgent] Successfully approved ${shardIds.length} shards`
      );

      return {
        approved: shardIds.length,
        status: "success",
      };
    } catch (error) {
      console.error(`[ShardAgent] Error approving shards:`, error);
      throw new Error(
        `Failed to approve shards: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Reject shards
   */
  async rejectShards(
    campaignId: string,
    shardIds: string[],
    reason: string
  ): Promise<{
    rejected: number;
    status: string;
  }> {
    try {
      console.log(
        `[ShardAgent] Rejecting ${shardIds.length} shards for campaign: ${campaignId}`,
        { reason }
      );

      if (shardIds.length === 0) {
        return { rejected: 0, status: "no_shards_to_reject" };
      }

      // Update shard statuses to rejected
      await this.stagedShardsDAO.bulkUpdateShardStatuses(
        shardIds,
        SHARD_STATUSES.REJECTED
      );

      console.log(
        `[ShardAgent] Successfully rejected ${shardIds.length} shards`
      );

      return {
        rejected: shardIds.length,
        status: "success",
      };
    } catch (error) {
      console.error(`[ShardAgent] Error rejecting shards:`, error);
      throw new Error(
        `Failed to reject shards: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Search approved shards
   */
  async searchApprovedShards(
    campaignId: string,
    query: string
  ): Promise<{
    results: any[];
    total: number;
    status: string;
  }> {
    try {
      console.log(
        `[ShardAgent] Searching approved shards for campaign: ${campaignId}`,
        { query }
      );

      const results = await this.stagedShardsDAO.searchApprovedShards(
        campaignId,
        query
      );

      console.log(`[ShardAgent] Found ${results.length} search results`);

      return {
        results,
        total: results.length,
        status: "success",
      };
    } catch (error) {
      console.error(`[ShardAgent] Error searching shards:`, error);
      throw new Error(
        `Failed to search shards: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Get shard statistics for a campaign
   */
  async getShardStats(campaignId: string): Promise<{
    total: number;
    staged: number;
    approved: number;
    rejected: number;
    byType: Record<string, number>;
    status: string;
  }> {
    try {
      console.log(
        `[ShardAgent] Getting shard statistics for campaign: ${campaignId}`
      );

      const allShards =
        await this.stagedShardsDAO.getShardsByCampaign(campaignId);

      const stats = {
        total: allShards.length,
        staged: allShards.filter((s: any) => s.status === SHARD_STATUSES.STAGED)
          .length,
        approved: allShards.filter(
          (s: any) => s.status === SHARD_STATUSES.APPROVED
        ).length,
        rejected: allShards.filter(
          (s: any) => s.status === SHARD_STATUSES.REJECTED
        ).length,
        byType: {} as Record<string, number>,
        status: "success",
      };

      // Count by shard type
      allShards.forEach((shard: any) => {
        const type = shard.shard_type;
        stats.byType[type] = (stats.byType[type] || 0) + 1;
      });

      console.log(`[ShardAgent] Campaign statistics:`, stats);

      return stats;
    } catch (error) {
      console.error(`[ShardAgent] Error getting shard statistics:`, error);
      throw new Error(
        `Failed to get shard statistics: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Group shards by resource for better organization
   */
  private groupShardsByResource(
    shards: any[],
    campaignId: string
  ): StagedShardGroup[] {
    const groups = new Map<string, StagedShardGroup>();

    shards.forEach((shard) => {
      const resourceId = shard.resource_id;

      if (!groups.has(resourceId)) {
        groups.set(resourceId, {
          key: `${campaignId}_${resourceId}_${Date.now()}`,
          sourceRef: {
            fileKey: resourceId,
            meta: {
              fileName: shard.metadata
                ? JSON.parse(shard.metadata).fileName
                : resourceId,
              campaignId,
            },
          },
          shards: [],
          created_at: shard.created_at,
          campaignRagBasePath: `campaigns/${campaignId}`,
        });
      }

      const group = groups.get(resourceId)!;

      // Convert database shard to ShardCandidate format
      const shardCandidate: ShardCandidate = {
        id: shard.id,
        text: shard.content,
        metadata: shard.metadata
          ? JSON.parse(shard.metadata)
          : {
              fileKey: resourceId,
              fileName: resourceId,
              source: "database",
              campaignId,
              entityType: shard.shard_type,
              confidence: 1.0,
            },
        sourceRef: {
          fileKey: resourceId,
          meta: {
            fileName: shard.metadata
              ? JSON.parse(shard.metadata).fileName
              : resourceId,
            campaignId,
            entityType: shard.shard_type,
          },
        },
      };

      group.shards.push(shardCandidate);
    });

    return Array.from(groups.values());
  }
}

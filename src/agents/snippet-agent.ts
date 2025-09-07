import { BaseAgent } from "./base-agent";
import { SnippetFactory } from "../lib/snippet-factory";
import { getDAOFactory } from "../dao/dao-factory";
import type {
  SnippetCandidate,
  CampaignResource,
  AISearchResponse,
  StagedSnippetGroup,
} from "../types/snippet";
import { SNIPPET_STATUSES } from "../lib/content-types";
import { buildSystemPrompt } from "./systemPrompts";
import { snippetTools } from "../tools/snippet";
import { resolveCampaignIdentifier } from "../tools/campaign";

// Snippet Agent System Prompt Configuration
const SNIPPET_AGENT_CONFIG = {
  agentName: "Snippet Management Agent",
  responsibilities: [
    "Snippet Discovery: Help users find and explore snippets in their campaigns",
    "Snippet Creation: Assist with creating new snippets from AI responses",
    "Snippet Management: Guide users through approval and rejection workflows",
    "Snippet Integration: Help users leverage approved snippets",
  ],
  tools: {
    discover_snippets: "Find snippets with various filters",
    search_approved_snippets: "Search through approved content",
    get_snippet_stats: "Get campaign snippet statistics",
    approve_snippets: "Approve selected snippets",
    reject_snippets: "Reject snippets with reasoning",
    create_snippets: "Create new snippets from AI responses",
    get_snippet_details: "Get detailed snippet information",
    render_snippet_management_ui:
      "Render snippet management interface in chat for user interaction",
    render_snippet_approval_ui:
      "Render focused snippet approval interface in chat",
  },
  workflowGuidelines: [
    "Always consider the campaign context when making decisions",
    "Provide clear reasoning for approval/rejection decisions",
    "Help users understand the value of different snippet types",
    "Suggest ways to use approved snippets in gameplay",
    "Maintain consistency with campaign themes and settings",
    "Be helpful and informative",
    "Ask clarifying questions when needed",
    "Provide actionable advice",
    "Explain the impact of decisions",
    "Help users make informed choices about their content",
  ],
  specialization:
    "You're helping users curate and organize their campaign knowledge base. Quality over quantity - help them focus on content that will enhance their gaming experience.",
};

const SNIPPET_AGENT_PROMPT = buildSystemPrompt(SNIPPET_AGENT_CONFIG);
import type { Env } from "../middleware/auth";

/**
 * Snippet Agent
 * Centralized agent for handling all snippet-related operations:
 * - Discovery: Query existing snippets, search approved content
 * - Creation: Generate snippets from resources, parse AI responses
 * - Management: Approve/reject snippets, organize by campaign
 * - Integration: Connect with existing campaign and resource systems
 */
export class SnippetAgent extends BaseAgent {
  private stagedSnippetsDAO: ReturnType<
    typeof getDAOFactory
  >["stagedSnippetsDAO"];

  /** Agent metadata for registration and routing */
  static readonly agentMetadata = {
    type: "snippets" as const,
    description:
      "Manages RPG campaign snippets including discovery, creation, approval, and rejection workflows",
    systemPrompt: SNIPPET_AGENT_PROMPT,
    tools: snippetTools,
  };

  constructor(ctx: DurableObjectState, env: Env, model: any) {
    super(ctx, env as any, model, snippetTools);

    const daoFactory = getDAOFactory(env);
    this.stagedSnippetsDAO = daoFactory.stagedSnippetsDAO;
  }

  /**
   * Discover snippets for a campaign
   */
  async discoverSnippets(
    campaignId: string,
    options: {
      status?: "staged" | "approved" | "rejected" | "all";
      resourceId?: string;
      snippetType?: string;
      limit?: number;
    } = {}
  ): Promise<{
    snippets: StagedSnippetGroup[];
    total: number;
    status: string;
  }> {
    const { status = "staged", resourceId, snippetType, limit = 100 } = options;

    try {
      console.log(
        `[SnippetAgent] Discovering snippets for campaign: ${campaignId}`,
        options
      );

      // Resolve campaign identifier if not a UUID
      const uuidRegex =
        /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
      let effectiveCampaignId = campaignId;
      console.log(`[SnippetAgent] Original campaignId: "${campaignId}"`);
      console.log(
        `[SnippetAgent] Is UUID format: ${uuidRegex.test(String(campaignId))}`
      );

      if (!uuidRegex.test(String(campaignId))) {
        console.log(
          `[SnippetAgent] Campaign ID is not UUID format, attempting to resolve...`
        );
        try {
          const res = await (resolveCampaignIdentifier as any).execute(
            { campaignName: campaignId },
            { env: (this as any).env }
          );
          console.log(`[SnippetAgent] Campaign resolution result:`, res);
          if (res?.success && res.data?.campaignId) {
            effectiveCampaignId = res.data.campaignId;
            console.log(
              `[SnippetAgent] Resolved campaign name '${campaignId}' -> '${effectiveCampaignId}'`
            );
          } else {
            console.warn(
              `[SnippetAgent] Campaign resolution failed or returned no ID`
            );
          }
        } catch (e) {
          console.warn(`[SnippetAgent] Failed to resolve campaign id:`, e);
        }
      } else {
        console.log(
          `[SnippetAgent] Campaign ID is already in UUID format, using as-is`
        );
      }

      console.log(
        `[SnippetAgent] Effective campaign ID: "${effectiveCampaignId}"`
      );

      let snippets: any[] = [];

      if (status === "staged" || status === "all") {
        console.log(
          `[SnippetAgent] Querying staged snippets for campaign: "${effectiveCampaignId}"`
        );
        const stagedSnippets =
          await this.stagedSnippetsDAO.getStagedSnippetsByCampaign(
            effectiveCampaignId
          );
        console.log(
          `[SnippetAgent] Found ${stagedSnippets.length} staged snippets:`,
          stagedSnippets
        );
        snippets.push(...stagedSnippets);
      }

      if (status === "approved" || status === "all") {
        // Get approved snippets (implement search if needed)
        const allSnippets =
          await this.stagedSnippetsDAO.getSnippetsByCampaign(
            effectiveCampaignId
          );
        const approvedSnippets = allSnippets.filter(
          (s) => s.status === SNIPPET_STATUSES.APPROVED
        );
        snippets.push(...approvedSnippets);
      }

      if (status === "rejected" || status === "all") {
        const allSnippets =
          await this.stagedSnippetsDAO.getSnippetsByCampaign(
            effectiveCampaignId
          );
        const rejectedSnippets = allSnippets.filter(
          (s) => s.status === SNIPPET_STATUSES.REJECTED
        );
        snippets.push(...rejectedSnippets);
      }

      // Filter by resource if specified
      if (resourceId) {
        snippets = snippets.filter((s) => s.resource_id === resourceId);
      }

      // Filter by snippet type if specified
      if (snippetType) {
        snippets = snippets.filter((s) => s.snippet_type === snippetType);
      }

      // Apply limit
      if (limit && snippets.length > limit) {
        snippets = snippets.slice(0, limit);
      }

      // Group snippets by resource for better organization
      const groupedSnippets = this.groupSnippetsByResource(
        snippets,
        effectiveCampaignId
      );

      console.log(
        `[SnippetAgent] Found ${snippets.length} snippets, grouped into ${groupedSnippets.length} resources`
      );

      return {
        snippets: groupedSnippets,
        total: snippets.length,
        status: "success",
      };
    } catch (error) {
      console.error(`[SnippetAgent] Error discovering snippets:`, error);
      throw new Error(
        `Failed to discover snippets: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Create snippets from AI response
   */
  async createSnippets(
    aiResponse: AISearchResponse,
    resource: CampaignResource,
    campaignId: string
  ): Promise<{
    created: number;
    snippets: SnippetCandidate[];
    status: string;
  }> {
    try {
      console.log(
        `[SnippetAgent] Creating snippets from AI response for resource: ${resource.id}`
      );
      console.log(
        `[SnippetAgent] Campaign ID for snippet creation: "${campaignId}"`
      );
      console.log(`[SnippetAgent] Resource details:`, resource);

      // Parse AI response into snippet candidates
      const snippetCandidates = SnippetFactory.parseAISearchResponse(
        aiResponse,
        resource,
        campaignId
      );

      if (snippetCandidates.length === 0) {
        console.log(`[SnippetAgent] No valid snippets found in AI response`);
        return {
          created: 0,
          snippets: [],
          status: "no_snippets_found",
        };
      }

      // Convert to database format
      const dbSnippets = SnippetFactory.toDatabaseFormat(
        snippetCandidates,
        campaignId,
        resource.id
      );

      console.log(
        `[SnippetAgent] Converted ${dbSnippets.length} snippets to database format`
      );
      console.log(
        `[SnippetAgent] Database snippets preview:`,
        dbSnippets.slice(0, 2)
      );

      // Store in database
      await this.stagedSnippetsDAO.createStagedSnippets(dbSnippets);

      console.log(
        `[SnippetAgent] Successfully created ${dbSnippets.length} snippets`
      );

      return {
        created: dbSnippets.length,
        snippets: snippetCandidates,
        status: "success",
      };
    } catch (error) {
      console.error(`[SnippetAgent] Error creating snippets:`, error);
      throw new Error(
        `Failed to create snippets: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Approve snippets
   */
  async approveSnippets(
    campaignId: string,
    snippetIds: string[]
  ): Promise<{
    approved: number;
    status: string;
  }> {
    try {
      console.log(
        `[SnippetAgent] Approving ${snippetIds.length} snippets for campaign: ${campaignId}`
      );

      if (snippetIds.length === 0) {
        return { approved: 0, status: "no_snippets_to_approve" };
      }

      // Update snippet statuses to approved
      await this.stagedSnippetsDAO.bulkUpdateSnippetStatuses(
        snippetIds,
        SNIPPET_STATUSES.APPROVED
      );

      console.log(
        `[SnippetAgent] Successfully approved ${snippetIds.length} snippets`
      );

      return {
        approved: snippetIds.length,
        status: "success",
      };
    } catch (error) {
      console.error(`[SnippetAgent] Error approving snippets:`, error);
      throw new Error(
        `Failed to approve snippets: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Reject snippets
   */
  async rejectSnippets(
    campaignId: string,
    snippetIds: string[],
    reason: string
  ): Promise<{
    rejected: number;
    status: string;
  }> {
    try {
      console.log(
        `[SnippetAgent] Rejecting ${snippetIds.length} snippets for campaign: ${campaignId}`,
        { reason }
      );

      if (snippetIds.length === 0) {
        return { rejected: 0, status: "no_snippets_to_reject" };
      }

      // Update snippet statuses to rejected
      await this.stagedSnippetsDAO.bulkUpdateSnippetStatuses(
        snippetIds,
        SNIPPET_STATUSES.REJECTED
      );

      console.log(
        `[SnippetAgent] Successfully rejected ${snippetIds.length} snippets`
      );

      return {
        rejected: snippetIds.length,
        status: "success",
      };
    } catch (error) {
      console.error(`[SnippetAgent] Error rejecting snippets:`, error);
      throw new Error(
        `Failed to reject snippets: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Search approved snippets
   */
  async searchApprovedSnippets(
    campaignId: string,
    query: string
  ): Promise<{
    results: any[];
    total: number;
    status: string;
  }> {
    try {
      console.log(
        `[SnippetAgent] Searching approved snippets for campaign: ${campaignId}`,
        { query }
      );

      const results = await this.stagedSnippetsDAO.searchApprovedSnippets(
        campaignId,
        query
      );

      console.log(`[SnippetAgent] Found ${results.length} search results`);

      return {
        results,
        total: results.length,
        status: "success",
      };
    } catch (error) {
      console.error(`[SnippetAgent] Error searching snippets:`, error);
      throw new Error(
        `Failed to search snippets: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Get snippet statistics for a campaign
   */
  async getSnippetStats(campaignId: string): Promise<{
    total: number;
    staged: number;
    approved: number;
    rejected: number;
    byType: Record<string, number>;
    status: string;
  }> {
    try {
      console.log(
        `[SnippetAgent] Getting snippet statistics for campaign: ${campaignId}`
      );

      const allSnippets =
        await this.stagedSnippetsDAO.getSnippetsByCampaign(campaignId);

      const stats = {
        total: allSnippets.length,
        staged: allSnippets.filter((s) => s.status === SNIPPET_STATUSES.STAGED)
          .length,
        approved: allSnippets.filter(
          (s) => s.status === SNIPPET_STATUSES.APPROVED
        ).length,
        rejected: allSnippets.filter(
          (s) => s.status === SNIPPET_STATUSES.REJECTED
        ).length,
        byType: {} as Record<string, number>,
        status: "success",
      };

      // Count by snippet type
      allSnippets.forEach((snippet) => {
        const type = snippet.snippet_type;
        stats.byType[type] = (stats.byType[type] || 0) + 1;
      });

      console.log(`[SnippetAgent] Campaign statistics:`, stats);

      return stats;
    } catch (error) {
      console.error(`[SnippetAgent] Error getting snippet statistics:`, error);
      throw new Error(
        `Failed to get snippet statistics: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Group snippets by resource for better organization
   */
  private groupSnippetsByResource(
    snippets: any[],
    campaignId: string
  ): StagedSnippetGroup[] {
    const groups = new Map<string, StagedSnippetGroup>();

    snippets.forEach((snippet) => {
      const resourceId = snippet.resource_id;

      if (!groups.has(resourceId)) {
        groups.set(resourceId, {
          key: `${campaignId}_${resourceId}_${Date.now()}`,
          sourceRef: {
            fileKey: resourceId,
            meta: {
              fileName: snippet.metadata
                ? JSON.parse(snippet.metadata).fileName
                : resourceId,
              campaignId,
            },
          },
          snippets: [],
          created_at: snippet.created_at,
          campaignRagBasePath: `campaigns/${campaignId}`,
        });
      }

      const group = groups.get(resourceId)!;

      // Convert database snippet to SnippetCandidate format
      const snippetCandidate: SnippetCandidate = {
        id: snippet.id,
        text: snippet.content,
        metadata: snippet.metadata
          ? JSON.parse(snippet.metadata)
          : {
              fileKey: resourceId,
              fileName: resourceId,
              source: "database",
              campaignId,
              entityType: snippet.snippet_type,
              confidence: 1.0,
            },
        sourceRef: {
          fileKey: resourceId,
          meta: {
            fileName: snippet.metadata
              ? JSON.parse(snippet.metadata).fileName
              : resourceId,
            campaignId,
            entityType: snippet.snippet_type,
          },
        },
      };

      group.snippets.push(snippetCandidate);
    });

    return Array.from(groups.values());
  }
}

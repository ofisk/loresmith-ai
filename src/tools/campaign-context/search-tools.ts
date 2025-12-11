import { tool } from "ai";
import { z } from "zod";
import { AUTH_CODES, type ToolResult } from "../../app-constants";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
} from "../utils";
import { getDAOFactory } from "../../dao/dao-factory";
import { PlanningContextService } from "../../services/rag/planning-context-service";
import { EntityEmbeddingService } from "../../services/vectorize/entity-embedding-service";

// Helper function to get environment from context
function getEnvFromContext(context: any): any {
  if (context?.env) {
    return context.env;
  }
  if (typeof globalThis !== "undefined" && "env" in globalThis) {
    return (globalThis as any).env;
  }
  return null;
}

// Tool to search campaign context
export const searchCampaignContext = tool({
  description:
    "Search through campaign context using semantic search. Searches session digests (recaps, planning notes, key events) and world state changelog entries. Results include graph-augmented entity relationships when relevant entities are mentioned in the query. Use this to find relevant past sessions, character development, plot threads, and world state information.",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    query: z
      .string()
      .describe(
        "The search query - can include entity names, plot points, or topics"
      ),
    searchType: z
      .enum(["all", "characters", "resources", "context"])
      .optional()
      .describe(
        "Type of content to search (default: all). 'context' searches session digests and changelog; 'characters'/'resources' searches entities; 'all' searches everything"
      ),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { campaignId, query, searchType = "all", jwt },
    context?: any
  ): Promise<ToolResult> => {
    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[searchCampaignContext] Using toolCallId:", toolCallId);

    console.log("[Tool] searchCampaignContext received:", {
      campaignId,
      query,
      searchType,
    });

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] searchCampaignContext - Environment found:", !!env);
      console.log("[Tool] searchCampaignContext - JWT provided:", !!jwt);

      // If we have environment, use semantic search
      if (env) {
        const userId = extractUsernameFromJwt(jwt);
        console.log(
          "[Tool] searchCampaignContext - User ID extracted:",
          userId
        );

        if (!userId) {
          return createToolError(
            "Invalid authentication token",
            "Authentication failed",
            AUTH_CODES.INVALID_KEY,
            toolCallId
          );
        }

        // Verify campaign exists and belongs to user using DAO
        const campaignDAO = getDAOFactory(env).campaignDAO;
        const campaign = await campaignDAO.getCampaignByIdWithMapping(
          campaignId,
          userId
        );

        if (!campaign) {
          return createToolError(
            "Campaign not found",
            "Campaign not found",
            404,
            toolCallId
          );
        }

        const results: any[] = [];
        const daoFactory = getDAOFactory(env);
        const requiresPlanningContext =
          searchType === "all" || searchType === "context";
        let planningService: PlanningContextService | null = null;

        try {
          planningService = new PlanningContextService(
            env.DB!,
            env.VECTORIZE!,
            env.OPENAI_API_KEY as string,
            env
          );
        } catch (error) {
          // If required, this is an error; if optional, just log and continue
          if (requiresPlanningContext) {
            return createToolError(
              "Failed to initialize PlanningContextService",
              error instanceof Error ? error.message : String(error),
              500,
              toolCallId
            );
          }
          console.warn(
            "[Tool] searchCampaignContext - PlanningContextService initialization failed (optional for entity search):",
            error
          );
        }

        // Primary search: Use PlanningContextService for semantic search of session digests and changelog
        // This searches through session recaps, planning notes, key events, and world state changes
        if (requiresPlanningContext && planningService) {
          console.log(
            "[Tool] searchCampaignContext - Using PlanningContextService for semantic search"
          );

          const planningResults = await planningService.search({
            campaignId,
            query,
            limit: 10,
            applyRecencyWeighting: true,
          });

          // Transform planning context results to match expected format
          for (const result of planningResults) {
            results.push({
              type: "planning_context",
              source: "session_digest",
              sessionNumber: result.sessionNumber,
              sessionDate: result.sessionDate,
              sectionType: result.sectionType,
              title: `Session ${result.sessionNumber} - ${result.sectionType}`,
              text: result.sectionContent,
              score: result.recencyWeightedScore,
              similarityScore: result.similarityScore,
              digestId: result.digestId,
              relatedEntities: result.relatedEntities,
              filename: `session-${result.sessionNumber}`,
            });
          }

          console.log(
            `[Tool] searchCampaignContext - Found ${planningResults.length} planning context results`
          );
        }

        // Secondary search: Entity search (characters, resources, etc.)
        if (
          searchType === "all" ||
          searchType === "characters" ||
          searchType === "resources"
        ) {
          try {
            let entities: Awaited<
              ReturnType<typeof daoFactory.entityDAO.listEntitiesByCampaign>
            > = [];

            if (searchType === "characters") {
              entities = await daoFactory.entityDAO.listEntitiesByCampaign(
                campaignId,
                {
                  entityType: "character",
                  limit: 20,
                }
              );
            } else if (searchType === "resources") {
              entities = await daoFactory.entityDAO.listEntitiesByCampaign(
                campaignId,
                {
                  entityType: "resource",
                  limit: 20,
                }
              );
            } else {
              // For "all", try semantic entity search if available
              // If that fails, use the same entity finding logic as PlanningContextService
              try {
                if (planningService && env.VECTORIZE) {
                  // Use PlanningContextService to generate embeddings
                  const queryEmbeddings =
                    await planningService.generateEmbeddings([query]);
                  const queryEmbedding = queryEmbeddings[0];

                  if (queryEmbedding) {
                    const entityEmbeddingService = new EntityEmbeddingService(
                      env.VECTORIZE
                    );

                    const similarEntities =
                      await entityEmbeddingService.findSimilarByEmbedding(
                        queryEmbedding,
                        {
                          campaignId,
                          topK: 10,
                        }
                      );

                    // Get full entity details for semantic matches
                    const entityIds = similarEntities.map((e) => e.entityId);
                    if (entityIds.length > 0) {
                      const allEntities =
                        await daoFactory.entityDAO.listEntitiesByCampaign(
                          campaignId,
                          { limit: 100 }
                        );
                      entities = allEntities.filter((e) =>
                        entityIds.includes(e.id)
                      );
                      console.log(
                        `[Tool] searchCampaignContext - Semantic search found ${entities.length} entities via embeddings`
                      );
                    } else {
                      throw new Error("No semantic matches found");
                    }
                  } else {
                    throw new Error("Failed to generate embedding");
                  }
                } else {
                  // Fallback to keyword-based entity search
                  throw new Error("PlanningService or VECTORIZE not available");
                }
              } catch (searchError) {
                console.log(
                  `[Tool] searchCampaignContext - Semantic entity search failed, falling back to keyword search:`,
                  searchError instanceof Error
                    ? searchError.message
                    : String(searchError)
                );

                // Use PlanningContextService's entity finding logic which includes LLM extraction
                try {
                  if (planningService) {
                    const queryEmbeddings =
                      await planningService.generateEmbeddings([query]);
                    const queryEmbedding = queryEmbeddings[0];

                    if (queryEmbedding) {
                      // Use PlanningContextService's findMatchingEntityIds which uses the same
                      const entityIds =
                        await planningService.findMatchingEntityIds(
                          campaignId,
                          query,
                          queryEmbedding,
                          20
                        );

                      if (entityIds.length > 0) {
                        // Get full entity details for matching entity IDs
                        const allEntities =
                          await daoFactory.entityDAO.listEntitiesByCampaign(
                            campaignId,
                            { limit: 100 }
                          );
                        entities = allEntities.filter((e) =>
                          entityIds.includes(e.id)
                        );
                        console.log(
                          `[Tool] searchCampaignContext - Found ${entities.length} entities via PlanningContextService entity finding (entity IDs: ${entityIds.join(", ")})`
                        );
                      }
                    }
                  }
                } catch (planningError) {
                  console.warn(
                    "[Tool] searchCampaignContext - PlanningContextService entity finding failed:",
                    planningError
                  );
                }

                // If still no entities, fall back to simple keyword search
                if (!entities || entities.length === 0) {
                  // Extract meaningful keywords - include the full query as a keyword too
                  const words = query.split(/\s+/).filter((w) => w.length > 2);
                  const keywordNames = [
                    query.toLowerCase(), // Try full query as one keyword
                    ...words.map((w) => w.toLowerCase()),
                  ].slice(0, 10);

                  console.log(
                    `[Tool] searchCampaignContext - Searching entities with keywords: ${keywordNames.join(", ")}`
                  );

                  entities = await daoFactory.entityDAO.searchEntitiesByName(
                    campaignId,
                    keywordNames,
                    { limit: 20 }
                  );

                  console.log(
                    `[Tool] searchCampaignContext - Keyword search returned ${entities.length} entities before filtering`
                  );
                }
              }
            }

            // Filter out rejected/ignored entities
            const approvedEntities = entities.filter((entity) => {
              try {
                const metadata = entity.metadata
                  ? (JSON.parse(entity.metadata as string) as Record<
                      string,
                      unknown
                    >)
                  : {};
                const shardStatus = metadata.shardStatus;
                const ignored = metadata.ignored === true;
                const rejected = metadata.rejected === true;
                return shardStatus !== "rejected" && !ignored && !rejected;
              } catch {
                return true; // Include if metadata parsing fails
              }
            });

            // Transform entities to match expected format
            for (const entity of approvedEntities) {
              results.push({
                type: "entity",
                source: "entity_graph",
                entityType: entity.entityType,
                title: entity.name,
                text: JSON.stringify(entity.content),
                score: 0.8, // Default score for entity matches
                entityId: entity.id,
                filename: entity.name,
              });
            }

            console.log(
              `[Tool] searchCampaignContext - Found ${approvedEntities.length} entity results`
            );
          } catch (error) {
            console.warn(
              "[Tool] searchCampaignContext - Entity search failed:",
              error
            );
            // Continue even if entity search fails
          }
        }

        // Sort results by score (highest first)
        results.sort((a, b) => (b.score || 0) - (a.score || 0));

        return createToolSuccess(
          `Found ${results.length} results for "${query}"${searchType && searchType !== "all" ? ` in ${searchType}` : ""}`,
          {
            query,
            searchType,
            results,
            totalCount: results.length,
          },
          toolCallId
        );
      }

      // Fallback: Environment not available, return error
      return createToolError(
        "Environment not available for campaign search",
        "Unable to access campaign data",
        500,
        toolCallId
      );
    } catch (error) {
      console.error("Error searching campaign context:", error);
      return createToolError(
        "Failed to search campaign context",
        error,
        500,
        toolCallId
      );
    }
  },
});

// Tool to search external resources
export const searchExternalResources = tool({
  description:
    "Search for external resources and references that might be relevant to the campaign",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    query: z.string().describe("The search query for external resources"),
    resourceType: z
      .enum(["adventures", "maps", "characters", "monsters", "items"])
      .optional()
      .describe("Type of external resource to search for"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { campaignId, query, resourceType, jwt },
    context?: any
  ): Promise<ToolResult> => {
    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[searchExternalResources] Using toolCallId:", toolCallId);

    console.log("[Tool] searchExternalResources received:", {
      campaignId,
      query,
      resourceType,
    });

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] searchExternalResources - Environment found:", !!env);
      console.log("[Tool] searchExternalResources - JWT provided:", !!jwt);

      // If we have environment, work directly with the database
      if (env) {
        const userId = extractUsernameFromJwt(jwt);
        console.log(
          "[Tool] searchExternalResources - User ID extracted:",
          userId
        );

        if (!userId) {
          return createToolError(
            "Invalid authentication token",
            "Authentication failed",
            AUTH_CODES.INVALID_KEY,
            toolCallId
          );
        }

        // Verify campaign exists and belongs to user using DAO
        const campaignDAO = getDAOFactory(env).campaignDAO;
        const campaign = await campaignDAO.getCampaignByIdWithMapping(
          campaignId,
          userId
        );

        if (!campaign) {
          return createToolError(
            "Campaign not found",
            "Campaign not found",
            404,
            toolCallId
          );
        }

        // For now, return mock external resource suggestions
        // In a real implementation, this would search external APIs or databases
        const mockResults = [
          {
            title: `${resourceType || "Adventure"} for "${query}"`,
            url: `https://dmsguild.com/search?q=${encodeURIComponent(query)}`,
            description: `Find ${resourceType || "adventure"} content related to "${query}"`,
            type: resourceType || "adventure",
            relevance: "high",
          },
          {
            title: `Reddit discussion about "${query}"`,
            url: `https://reddit.com/r/DMAcademy/search?q=${encodeURIComponent(query)}`,
            description: `Community discussions and advice about "${query}"`,
            type: "discussion",
            relevance: "medium",
          },
        ];

        console.log("[Tool] External search results:", mockResults.length);

        return createToolSuccess(
          `Found ${mockResults.length} external resources for "${query}"`,
          {
            query,
            resourceType,
            results: mockResults,
            totalCount: mockResults.length,
          },
          toolCallId
        );
      }

      // Fallback: Environment not available, return error
      return createToolError(
        "Environment not available for external resource search",
        "Unable to access external resources",
        500,
        toolCallId
      );
    } catch (error) {
      console.error("Error searching external resources:", error);
      return createToolError(
        "Failed to search external resources",
        error,
        500,
        toolCallId
      );
    }
  },
});

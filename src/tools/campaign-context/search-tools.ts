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
import { WorldStateChangelogService } from "../../services/graph/world-state-changelog-service";
import { PlanningContextService } from "../../services/rag/planning-context-service";
import { EntityEmbeddingService } from "../../services/vectorize/entity-embedding-service";
import { EntityGraphService } from "../../services/graph/entity-graph-service";
import { STRUCTURED_ENTITY_TYPES } from "../../lib/entity-types";

// Dynamically build entity types list for descriptions
const ENTITY_TYPES_LIST = STRUCTURED_ENTITY_TYPES.join(", ");

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

// Query intent parsing result
interface QueryIntent {
  entityType: string | null;
  searchPlanningContext: boolean;
  isListAll: boolean;
  searchQuery: string;
}

/**
 * Parse query string to infer search intent
 * - Detects entity types in query (e.g., "monsters", "npcs")
 * - Detects planning context intent via "context:" or "session:" prefix
 * - Detects "list all" intent (empty query, just entity type, or "all <type>")
 * - Extracts clean search query for semantic search
 */
function parseQueryIntent(query: string): QueryIntent {
  const queryTrimmed = query.trim();
  const queryLower = queryTrimmed.toLowerCase();

  // Check for planning context prefix
  const hasContextPrefix =
    queryLower.startsWith("context:") || queryLower.startsWith("session:");
  const searchPlanningContext = hasContextPrefix;

  // Extract query without prefix for further processing
  let queryWithoutPrefix = queryTrimmed;
  if (hasContextPrefix) {
    const colonIndex = queryTrimmed.indexOf(":");
    queryWithoutPrefix = queryTrimmed.substring(colonIndex + 1).trim();
  }

  // Detect entity type in query (whole word matching against structured entity types)
  // The LLM should map synonyms (e.g., "beasts", "creatures" → "monsters") before calling this tool
  let detectedEntityType: string | null = null;
  for (const entityType of STRUCTURED_ENTITY_TYPES) {
    // Match whole word to avoid false positives (e.g., "monsters" not "monster")
    const regex = new RegExp(`\\b${entityType}\\b`, "i");
    if (regex.test(queryWithoutPrefix)) {
      detectedEntityType = entityType;
      break; // Use first match
    }
  }

  // Map entity type names to database entity types
  const entityTypeMap: Record<string, string> = {
    characters: "character",
    resources: "resource",
  };
  const targetEntityType = detectedEntityType
    ? entityTypeMap[detectedEntityType] || detectedEntityType
    : null;

  // Detect "list all" intent
  let isListAll = false;
  if (queryWithoutPrefix.length === 0) {
    // Empty query (after removing prefix) → list all entities
    isListAll = true;
  } else if (detectedEntityType) {
    const queryLowerNoPrefix = queryWithoutPrefix.toLowerCase();
    const typeLower = detectedEntityType.toLowerCase();
    // Check if query is just the entity type or "all <type>"
    if (
      queryLowerNoPrefix === typeLower ||
      queryLowerNoPrefix === `all ${typeLower}` ||
      queryLowerNoPrefix === `list ${typeLower}` ||
      queryLowerNoPrefix === `list all ${typeLower}`
    ) {
      isListAll = true;
    }
  }

  // Extract clean search query for semantic search
  // Remove entity type keywords and "all" prefix
  let searchQuery = queryWithoutPrefix;
  if (detectedEntityType && !isListAll) {
    // Remove entity type keyword from query for semantic search
    const typeRegex = new RegExp(`\\b${detectedEntityType}\\b`, "gi");
    searchQuery = searchQuery.replace(typeRegex, "").trim();
    // Remove "all" prefix if present
    searchQuery = searchQuery.replace(/^all\s+/i, "").trim();
  }

  return {
    entityType: targetEntityType,
    searchPlanningContext,
    isListAll,
    searchQuery,
  };
}

/**
 * Calculate name similarity between a query and an entity name.
 * Returns a score between 0.0 and 1.0, where 1.0 is an exact match.
 * Used to detect when users are asking about a specific named entity.
 */
function calculateNameSimilarity(query: string, entityName: string): number {
  // Normalize both strings: lowercase, trim, remove articles
  const normalize = (str: string): string => {
    return str
      .toLowerCase()
      .trim()
      .replace(/^(the|a|an)\s+/i, "") // Remove articles
      .replace(/\s+/g, " "); // Normalize whitespace
  };

  const normalizedQuery = normalize(query);
  const normalizedEntityName = normalize(entityName);

  // Exact match (after normalization)
  if (normalizedQuery === normalizedEntityName) {
    return 1.0;
  }

  // Check if entity name contains query or vice versa (partial match)
  if (
    normalizedEntityName.includes(normalizedQuery) ||
    normalizedQuery.includes(normalizedEntityName)
  ) {
    // Boost if the longer string starts with the shorter string (better match)
    const shorter =
      normalizedQuery.length < normalizedEntityName.length
        ? normalizedQuery
        : normalizedEntityName;
    const longer =
      normalizedQuery.length >= normalizedEntityName.length
        ? normalizedQuery
        : normalizedEntityName;
    if (longer.startsWith(shorter)) {
      return 0.8;
    }
    return 0.6;
  }

  // Check for word-level matches (e.g., "entity name" vs "Entity Name")
  const queryWords = normalizedQuery.split(/\s+/);
  const entityWords = normalizedEntityName.split(/\s+/);
  const matchingWords = queryWords.filter((word) => entityWords.includes(word));
  if (
    matchingWords.length > 0 &&
    matchingWords.length === Math.min(queryWords.length, entityWords.length)
  ) {
    // All words match (possibly in different order)
    return 0.7;
  }
  if (matchingWords.length > 0) {
    // Some words match
    return 0.5;
  }

  // No meaningful match
  return 0.0;
}

// Tool to search campaign context
export const searchCampaignContext = tool({
  description: `Search through campaign context using semantic search and graph traversal. 

CRITICAL: Use this tool FIRST when users ask about entities "from my campaign", "in my world", "I've created", or similar phrases indicating existing campaign content. This tool retrieves the user's APPROVED entities (shards) that they've already added to their campaign. NEVER use searchExternalResources for entities the user has in their campaign.

CRITICAL - CALL THIS TOOL ONLY ONCE: When users mention multiple synonyms (e.g., "monsters or beasts", "beasts or creatures"), these are synonyms for the SAME entity type. You MUST map all synonyms to the correct entity type name and call this tool ONCE with that mapped type. DO NOT call this tool multiple times with different synonyms.

SEMANTIC SEARCH: Searches entities via semantic similarity. Entity results include their actual relationships from the entity graph, showing which entities are connected and how (e.g., 'resides_in', 'located_in', 'allied_with'). The tool automatically expands results to include other entities from the same communities as the initially found entities, providing better contextual coverage. Use this to find relevant entities across all entity types including: ${ENTITY_TYPES_LIST}. 

QUERY SYNTAX: The query string automatically infers search intent:
- "fire monsters" → searches for monsters matching "fire" 
- "context: session notes" → searches session digests (optional, for backward compatibility - note that session digests are temporary and get parsed into entities)

CRITICAL - USE listAllEntities FOR "LIST ALL" REQUESTS: When users explicitly ask to "list all" entities (e.g., "list all locations", "show all monsters", "all NPCs"), you MUST use the listAllEntities tool instead of this tool. The listAllEntities tool automatically handles pagination and returns all results in one response. DO NOT use searchCampaignContext for "list all" requests.

AVAILABLE ENTITY TYPES: The tool recognizes these entity types: ${ENTITY_TYPES_LIST}. When users use synonyms or alternative terms (e.g., "beasts", "creatures" for monsters; "people", "characters" for NPCs; "places" for locations), you MUST map them to the correct entity type name before including in the query. For example: "beasts" or "creatures" → use "monsters" in query; "people" or "characters" (when referring to NPCs) → use "npcs" in query; "places" → use "locations" in query.

CRITICAL - SYNONYM MAPPING: When users specify entity types in their request (e.g., "monsters", "beasts", "creatures", "NPCs", "locations"), you MUST: (1) Map ALL synonyms to the correct entity type name from the list above, (2) Call this tool ONCE with that mapped entity type in the query parameter. Examples: User says "monsters or beasts from my campaign" → call ONCE with query="monsters" (NOT twice with "monsters" and "beasts"). User says "beasts or creatures" → call ONCE with query="monsters". Do NOT use an empty query when entity types are specified - this will return ALL entities including unwanted types (e.g., NPCs when user asked for monsters).

APPROVED ENTITIES AS CREATIVE BOUNDARIES: Approved entities (shards) in the campaign form the structural foundation for your responses. When users ask you to work with entities (creatures, NPCs, locations, etc.) from their campaign, you MUST first retrieve the relevant approved entities using this tool. These approved entities define the boundaries of what exists in their world. Within those boundaries, use your creative reasoning to interpret, match, adapt, or elaborate on the entities based on the user's request. The approved entities provide the outline - you fill in the creative details within that outline. For example, if asked to match creatures to themes, retrieve the user's approved creatures first (using query="monsters" to list all monsters), then creatively analyze how they might align with those themes based on their characteristics, even if the theme keywords aren't explicitly in the entity metadata.

GRAPH TRAVERSAL OPTIMIZATION: After finding entities via semantic search, use graph traversal to explore connected entities. PERFORMANCE TIP: Start with traverseDepth=1 (direct neighbors only) and only increase to depth 2 or 3 if the initial results are insufficient. Always use traverseRelationshipTypes filter when possible to reduce traversal scope (e.g., ['resides_in', 'located_in'] for location queries). This significantly improves query performance. Only traverse if the initial semantic search results don't provide enough context - many queries can be answered with just the initial search results without traversal. 

CRITICAL - "X within Y" QUERIES: When users ask for entities "within" or "inside" another entity (e.g., "locations within [location]", "NPCs in [place]"), you MUST first identify the parent entity before searching for contained entities. Workflow: (1) Search for the parent entity to find its entity ID, (2) Use traverseFromEntityIds with that parent entity ID and appropriate traverseRelationshipTypes (e.g., ['located_in'] for locations within a location) to find entities contained within the parent. You may need multiple traversal steps depending on the query complexity. Do NOT just search for the entity type alone - that returns all entities of that type across the entire campaign, not just those within the specified parent.

PAGINATION: The tool supports pagination via offset and limit parameters (default: offset=0, limit=15, max limit=50). For search queries, you may stop after the first page if the results are sufficient. If you need more results, use the pagination.nextOffset from the response to fetch the next page.

CRITICAL: Entity results include explicit relationships from the entity graph. ONLY use explicit relationships shown in the results. Do NOT infer relationships from entity content text, entity names, or descriptions. If a relationship is not explicitly listed, it does NOT exist in the entity graph.

ORIGINAL FILE SEARCH: When users explicitly ask to "search back through the original text", "search the source files", "find in the original documents", or similar phrases, set searchOriginalFiles=true. This performs lexical (text) search through the original uploaded files (PDFs, text files) associated with the campaign, returning matching text chunks with their source file names. This is different from entity search - it searches raw file content, not extracted entities.`,
  parameters: z.object({
    campaignId: commonSchemas.campaignId.describe(
      "The campaign ID (UUID format). CRITICAL: This must be a UUID, never an entity name. The campaignId is automatically provided from the user's selected campaign - do NOT use entity names or location names as campaignId."
    ),
    query: z
      .string()
      .describe(
        `The search query - can include entity names, plot points, topics, or entity types. Available entity types: ${ENTITY_TYPES_LIST}. The tool automatically infers the entity type from your query. CRITICAL: When users specify entity types in their request (e.g., "monsters", "beasts", "creatures", "NPCs"), you MUST: (1) Map any synonyms to the correct entity type name (e.g., "beasts"/"creatures" → "monsters", "people"/"characters" → "npcs"), (2) Include that entity type keyword in this query parameter. Examples: "monsters" lists all monsters, "fire monsters" searches for monsters matching "fire", "all monsters" lists all monsters. Empty query lists all entities (only use when user doesn't specify entity types). Use "context:" prefix to search session digests (optional - note that session digests are temporary and get parsed into entities).`
      ),
    searchOriginalFiles: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, searches the original source files (PDFs, text files) uploaded to the campaign for text content matching the query. Use this when users explicitly ask to 'search back through the original text', 'search the source files', 'find in the original documents', or similar phrases. This performs lexical (text) search through file chunks, not entity search."
      ),
    traverseFromEntityIds: z
      .array(z.string())
      .optional()
      .describe(
        "Entity IDs to start graph traversal from. When provided, the tool will traverse the entity graph starting from these entities, following relationships to find connected entities. Use this after an initial semantic search to explore entities connected to the found entities."
      ),
    traverseDepth: z
      .number()
      .int()
      .min(1)
      .max(3)
      .optional()
      .describe(
        "Maximum depth to traverse from starting entities (default: 1). Depth 1 returns direct neighbors, depth 2 returns neighbors of neighbors, etc. Use depth 1 first, then increase if more context is needed."
      ),
    traverseRelationshipTypes: z
      .array(z.string())
      .optional()
      .describe(
        "Optional filter for specific relationship types to traverse (e.g., ['resides_in', 'located_in']). If not provided, traverses all relationship types. Use this to focus traversal on specific relationship types relevant to the query."
      ),
    includeTraversedEntities: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        "Whether to include traversed entities in results (default: true). Set to false if you only want to see relationships without the full entity details."
      ),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(0)
      .describe(
        "Offset for pagination (default: 0). Use this to page through results. If the response indicates there are more results, increment the offset by the limit to get the next page."
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(15)
      .describe(
        "Maximum number of results to return (default: 15, max: 50). Use pagination (offset) to retrieve additional results if needed. Start with the default limit to avoid token limit issues, then page through if more results are needed."
      ),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    {
      campaignId,
      query,
      traverseFromEntityIds,
      traverseDepth = 1,
      traverseRelationshipTypes,
      includeTraversedEntities = true,
      offset = 0,
      limit = 15,
      searchOriginalFiles = false,
      jwt,
    },
    context?: any
  ): Promise<ToolResult> => {
    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[searchCampaignContext] Using toolCallId:", toolCallId);

    // Parse query intent
    const queryIntent = parseQueryIntent(query);

    console.log("[Tool] searchCampaignContext received:", {
      campaignId,
      query,
      parsedIntent: {
        entityType: queryIntent.entityType,
        searchPlanningContext: queryIntent.searchPlanningContext,
        isListAll: queryIntent.isListAll,
        searchQuery: queryIntent.searchQuery,
      },
      traverseFromEntityIds,
      traverseDepth,
      traverseRelationshipTypes,
      includeTraversedEntities,
    });
    console.log(
      `[Tool] searchCampaignContext - Using campaignId: ${campaignId} (type: ${typeof campaignId})`
    );

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

        // Declare name similarity tracking variables at function scope
        // so they're accessible when filtering results later
        const entityNameSimilarityScores = new Map<string, number>();
        let hasStrongNameMatches = false;
        const nameMatchThreshold = 0.6;

        // Verify campaign exists and belongs to user using DAO
        const campaignDAO = getDAOFactory(env).campaignDAO;
        console.log(
          `[Tool] searchCampaignContext - Verifying campaign ${campaignId} for user ${userId}`
        );
        const campaign = await campaignDAO.getCampaignByIdWithMapping(
          campaignId,
          userId
        );

        if (!campaign) {
          console.error(
            `[Tool] searchCampaignContext - Campaign ${campaignId} not found for user ${userId}`
          );
          return createToolError(
            "Campaign not found",
            "Campaign not found",
            404,
            toolCallId
          );
        }

        console.log(
          `[Tool] searchCampaignContext - Verified campaign: ${campaign.name} (ID: ${campaign.campaignId})`
        );

        const results: any[] = [];
        const daoFactory = getDAOFactory(env);
        const requiresPlanningContext = queryIntent.searchPlanningContext;
        let planningService: PlanningContextService | null = null;
        let totalCount: number | undefined;
        // For list-all queries, use a high limit (500) to minimize pagination calls
        // For regular search queries, use the provided limit (default: 15, max: 50)
        const effectiveLimit = queryIntent.isListAll ? 500 : limit;

        // Helper function to extract file keys from entity metadata
        const extractFileKeysFromEntities = (
          entities: Awaited<
            ReturnType<typeof daoFactory.entityDAO.listEntitiesByCampaign>
          >
        ): Set<string> => {
          const fileKeys = new Set<string>();
          for (const entity of entities) {
            try {
              if (entity.metadata) {
                const metadata =
                  typeof entity.metadata === "string"
                    ? (JSON.parse(entity.metadata) as Record<string, unknown>)
                    : (entity.metadata as Record<string, unknown>);

                // Check for fileKey in metadata (direct or nested)
                if (metadata.fileKey && typeof metadata.fileKey === "string") {
                  fileKeys.add(metadata.fileKey);
                }

                // Check for fileKey in sourceRef
                if (
                  metadata.sourceRef &&
                  typeof metadata.sourceRef === "object" &&
                  metadata.sourceRef !== null
                ) {
                  const sourceRef = metadata.sourceRef as Record<
                    string,
                    unknown
                  >;
                  if (
                    sourceRef.fileKey &&
                    typeof sourceRef.fileKey === "string"
                  ) {
                    fileKeys.add(sourceRef.fileKey);
                  }
                }
              }
            } catch (error) {
              // Skip entities with invalid metadata
              console.warn(
                `[Tool] searchCampaignContext - Failed to parse metadata for entity ${entity.id}:`,
                error
              );
            }
          }
          return fileKeys;
        };

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
        // Note: Session digests are temporary and get parsed into entities, so this is optional
        if (
          requiresPlanningContext &&
          planningService &&
          queryIntent.searchQuery.length > 0
        ) {
          console.log(
            "[Tool] searchCampaignContext - Using PlanningContextService for semantic search"
          );

          const planningResults = await planningService.search({
            campaignId,
            query: queryIntent.searchQuery,
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

        // Secondary search: Entity search (${ENTITY_TYPES_LIST})
        // Always search entities unless query explicitly requests planning context only
        if (!requiresPlanningContext || queryIntent.entityType) {
          try {
            let entities: Awaited<
              ReturnType<typeof daoFactory.entityDAO.listEntitiesByCampaign>
            > = [];

            const targetEntityType = queryIntent.entityType;

            // Map to store semantic similarity scores for entities
            const entitySimilarityScores = new Map<string, number>();

            // SEMANTIC RELEVANCY IS THE DEFAULT: Always use semantic search when we have a query
            // This applies to both focused searches and list-all queries
            const hasSearchQuery =
              queryIntent.searchQuery &&
              queryIntent.searchQuery.trim().length > 0;
            const shouldUseSemanticSearch =
              hasSearchQuery && planningService !== null && env.VECTORIZE;

            if (shouldUseSemanticSearch && planningService) {
              // Use semantic search as the primary method for all queries
              try {
                const queryEmbeddings =
                  await planningService.generateEmbeddings([
                    queryIntent.searchQuery,
                  ]);
                const queryEmbedding = queryEmbeddings[0];

                if (queryEmbedding) {
                  const entityEmbeddingService = new EntityEmbeddingService(
                    env.VECTORIZE
                  );

                  // For list-all queries, use a higher topK to get more results
                  // For focused searches, use a more targeted topK
                  const searchTopK = queryIntent.isListAll
                    ? Math.min(effectiveLimit * 2, 500) // Get more results for list-all
                    : targetEntityType
                      ? 20
                      : 10; // Focused search

                  const similarEntities =
                    await entityEmbeddingService.findSimilarByEmbedding(
                      queryEmbedding,
                      {
                        campaignId,
                        entityType: targetEntityType || undefined,
                        topK: searchTopK,
                      }
                    );

                  // Store similarity scores for later use in sorting
                  for (const similar of similarEntities) {
                    entitySimilarityScores.set(similar.entityId, similar.score);
                  }

                  // Get full entity details for semantic matches
                  const entityIds = similarEntities.map((e) => e.entityId);
                  if (entityIds.length > 0) {
                    // For list-all, we might need to fetch more entities to fill the limit
                    const fetchLimit = queryIntent.isListAll
                      ? effectiveLimit + 1
                      : 100;
                    const allEntities =
                      await daoFactory.entityDAO.listEntitiesByCampaign(
                        campaignId,
                        {
                          limit: fetchLimit,
                          entityType: targetEntityType || undefined,
                        }
                      );
                    entities = allEntities.filter((e) =>
                      entityIds.includes(e.id)
                    );

                    // For list-all queries, get total count for accurate reporting
                    if (queryIntent.isListAll && totalCount === undefined) {
                      totalCount =
                        await daoFactory.entityDAO.getEntityCountByCampaign(
                          campaignId,
                          targetEntityType
                            ? { entityType: targetEntityType }
                            : {}
                        );
                    }

                    console.log(
                      `[Tool] searchCampaignContext - Semantic search found ${entities.length} entities via embeddings${queryIntent.isListAll ? " (list-all mode)" : ""}`
                    );
                  } else {
                    throw new Error("No semantic matches found");
                  }
                } else {
                  throw new Error("Failed to generate embedding");
                }
              } catch (searchError) {
                console.log(
                  `[Tool] searchCampaignContext - Semantic search failed, falling back to database query:`,
                  searchError instanceof Error
                    ? searchError.message
                    : String(searchError)
                );
                // Fall through to database query below
                entities = [];
              }
            }

            // Fallback: If semantic search wasn't used or failed, fetch from database
            // This happens for true "list all" with no query, or if semantic search fails
            if (!shouldUseSemanticSearch || entities.length === 0) {
              if (queryIntent.isListAll) {
                // List all entities of the requested type (or all entities if no type specified)
                // Use high limit (500) for list-all queries to minimize pagination calls
                // Request limit+1 to check if there are more results
                const queryLimit = effectiveLimit + 1;

                // Get total count for accurate reporting (only for list-all queries)
                totalCount =
                  await daoFactory.entityDAO.getEntityCountByCampaign(
                    campaignId,
                    targetEntityType ? { entityType: targetEntityType } : {}
                  );

                if (targetEntityType) {
                  entities = await daoFactory.entityDAO.listEntitiesByCampaign(
                    campaignId,
                    {
                      entityType: targetEntityType,
                      limit: queryLimit,
                      offset,
                    }
                  );
                  console.log(
                    `[Tool] searchCampaignContext - Listing entities of type: ${targetEntityType} (offset: ${offset}, limit: ${effectiveLimit}, total: ${totalCount})`
                  );
                } else {
                  // No entity type specified, list all entities
                  entities = await daoFactory.entityDAO.listEntitiesByCampaign(
                    campaignId,
                    { limit: queryLimit, offset }
                  );
                  console.log(
                    `[Tool] searchCampaignContext - Listing all entities (offset: ${offset}, limit: ${effectiveLimit}, total: ${totalCount})`
                  );
                }
              } else if (
                queryIntent.searchQuery &&
                queryIntent.searchQuery.trim().length > 0
              ) {
                // Fallback: If semantic search wasn't available or failed, try alternative methods
                // This should rarely happen since semantic search is now the default
                try {
                  if (planningService) {
                    const queryEmbeddings =
                      await planningService.generateEmbeddings([
                        queryIntent.searchQuery,
                      ]);
                    const queryEmbedding = queryEmbeddings[0];

                    if (queryEmbedding) {
                      // Use PlanningContextService's findMatchingEntityIds as fallback
                      const maxEntities = targetEntityType ? 500 : 25;
                      const entityIds =
                        await planningService.findMatchingEntityIds(
                          campaignId,
                          queryIntent.searchQuery,
                          queryEmbedding,
                          maxEntities
                        );

                      if (entityIds.length > 0) {
                        // CRITICAL: Always filter by entityType if specified
                        const allEntities =
                          await daoFactory.entityDAO.listEntitiesByCampaign(
                            campaignId,
                            {
                              limit: 100,
                              entityType: targetEntityType || undefined,
                            }
                          );
                        entities = allEntities.filter((e) =>
                          entityIds.includes(e.id)
                        );
                        console.log(
                          `[Tool] searchCampaignContext - Found ${entities.length} entities via PlanningContextService fallback`
                        );
                      }
                    }
                  }
                } catch (planningError) {
                  console.warn(
                    "[Tool] searchCampaignContext - PlanningContextService fallback failed:",
                    planningError
                  );
                }

                // Final fallback: keyword search if still no entities
                if (!entities || entities.length === 0) {
                  const words = queryIntent.searchQuery
                    .split(/\s+/)
                    .filter((w) => w.length > 2);
                  const keywordNames = [
                    queryIntent.searchQuery.toLowerCase(),
                    ...words.map((w) => w.toLowerCase()),
                  ].slice(0, 10);

                  console.log(
                    `[Tool] searchCampaignContext - Falling back to keyword search: ${keywordNames.join(", ")}`
                  );

                  entities = await daoFactory.entityDAO.searchEntitiesByName(
                    campaignId,
                    keywordNames,
                    {
                      entityType: targetEntityType || undefined,
                      limit: targetEntityType ? 50 : 25,
                    }
                  );

                  console.log(
                    `[Tool] searchCampaignContext - Keyword search returned ${entities.length} entities`
                  );
                }
              }

              // Filter by entityType if a specific entity type was detected
              if (targetEntityType && entities.length > 0) {
                const beforeFilter = entities.length;
                entities = entities.filter(
                  (e) => e.entityType === targetEntityType
                );
                console.log(
                  `[Tool] searchCampaignContext - Filtered from ${beforeFilter} to ${entities.length} entities matching entityType: ${targetEntityType}`
                );
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

            // Post-filter: Calculate name similarity scores for entities
            // This helps detect when users are asking about a specific named entity
            // Note: entityNameSimilarityScores and hasStrongNameMatches are declared at function scope
            if (
              queryIntent.searchQuery &&
              queryIntent.searchQuery.trim().length > 0
            ) {
              for (const entity of approvedEntities) {
                const nameScore = calculateNameSimilarity(
                  queryIntent.searchQuery,
                  entity.name
                );
                if (nameScore > 0) {
                  entityNameSimilarityScores.set(entity.id, nameScore);
                  if (nameScore >= nameMatchThreshold) {
                    hasStrongNameMatches = true;
                  }
                }
              }

              // Boost semantic scores with name similarity scores
              // If an entity has both semantic and name scores, combine them (weighted)
              for (const [
                entityId,
                nameScore,
              ] of entityNameSimilarityScores.entries()) {
                const existingSemanticScore =
                  entitySimilarityScores.get(entityId);
                if (nameScore >= nameMatchThreshold) {
                  // Strong name match: significantly boost the score
                  // If semantic score exists, take the max; otherwise use name score * 0.9
                  const boostedScore = existingSemanticScore
                    ? Math.max(existingSemanticScore, nameScore * 0.9)
                    : nameScore * 0.9;
                  entitySimilarityScores.set(entityId, boostedScore);
                } else if (nameScore > 0) {
                  // Weak name match: slight boost
                  const boostedScore = existingSemanticScore
                    ? existingSemanticScore * (1 + nameScore * 0.1)
                    : nameScore * 0.7;
                  entitySimilarityScores.set(entityId, boostedScore);
                }
              }

              if (hasStrongNameMatches) {
                console.log(
                  `[Tool] searchCampaignContext - Found ${entityNameSimilarityScores.size} entities with name matches (${Array.from(entityNameSimilarityScores.values()).filter((s) => s >= nameMatchThreshold).length} strong matches)`
                );
              }
            }

            // Community-based expansion: Use communities as a shortcut to find related entities
            // If we found entities, find their communities and include other entities from those communities
            // Skip or limit expansion if strong name matches were found (indicating a specific entity query)
            const communityExpandedEntityIds = new Set<string>(
              approvedEntities.map((e) => e.id)
            );
            if (
              approvedEntities.length > 0 &&
              approvedEntities.length < 50 &&
              !queryIntent.isListAll &&
              !hasStrongNameMatches // Skip community expansion when strong name matches exist
            ) {
              try {
                const communityDAO = daoFactory.communityDAO;
                const allCampaignEntities =
                  await daoFactory.entityDAO.listEntitiesByCampaign(
                    campaignId,
                    { limit: 1000 }
                  );
                const allEntitiesMap = new Map(
                  allCampaignEntities.map((e) => [e.id, e])
                );

                // Find communities for each found entity
                const communityIdsSet = new Set<string>();
                for (const entity of approvedEntities) {
                  try {
                    const communities =
                      await communityDAO.findCommunitiesContainingEntity(
                        campaignId,
                        entity.id
                      );
                    for (const community of communities) {
                      communityIdsSet.add(community.id);
                    }
                  } catch (error) {
                    console.warn(
                      `[Tool] searchCampaignContext - Failed to find communities for entity ${entity.id}:`,
                      error
                    );
                  }
                }

                // Get all entities from those communities
                if (communityIdsSet.size > 0) {
                  const allCommunities =
                    await communityDAO.listCommunitiesByCampaign(campaignId);
                  const relevantCommunities = allCommunities.filter((c) =>
                    communityIdsSet.has(c.id)
                  );

                  for (const community of relevantCommunities) {
                    for (const entityId of community.entityIds) {
                      // Only add entities that match the target entity type (if specified)
                      const entity = allEntitiesMap.get(entityId);
                      if (
                        entity &&
                        (!targetEntityType ||
                          entity.entityType === targetEntityType)
                      ) {
                        // Filter out rejected/ignored entities
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
                          if (
                            shardStatus !== "rejected" &&
                            !ignored &&
                            !rejected
                          ) {
                            communityExpandedEntityIds.add(entityId);
                          }
                        } catch {
                          // Include if metadata parsing fails
                          communityExpandedEntityIds.add(entityId);
                        }
                      }
                    }
                  }

                  const expandedCount =
                    communityExpandedEntityIds.size - approvedEntities.length;
                  if (expandedCount > 0) {
                    console.log(
                      `[Tool] searchCampaignContext - Community expansion added ${expandedCount} entities from ${communityIdsSet.size} communities`
                    );

                    // Fetch the expanded entities and merge with existing results
                    const expandedEntities = Array.from(
                      communityExpandedEntityIds
                    )
                      .map((id) => allEntitiesMap.get(id))
                      .filter(
                        (e): e is NonNullable<typeof e> => e !== undefined
                      );

                    // Preserve order: original entities first, then community-expanded entities
                    // Use similarity scores if available, otherwise use entity names
                    const entityIdSet = new Set(
                      approvedEntities.map((e) => e.id)
                    );
                    const newEntities = expandedEntities.filter(
                      (e) => !entityIdSet.has(e.id)
                    );

                    // Sort new entities by similarity score if available, otherwise by name
                    newEntities.sort((a, b) => {
                      const scoreA = entitySimilarityScores.get(a.id) ?? 0;
                      const scoreB = entitySimilarityScores.get(b.id) ?? 0;
                      if (scoreA !== scoreB) {
                        return scoreB - scoreA; // Higher score first
                      }
                      return a.name.localeCompare(b.name);
                    });

                    // Limit community expansion to avoid overwhelming results
                    // Add up to limit/2 additional entities from communities
                    const maxExpansion = Math.max(5, Math.floor(limit / 2));
                    const limitedNewEntities = newEntities.slice(
                      0,
                      maxExpansion
                    );

                    // Merge: original entities first (preserve their order), then community-expanded
                    entities = [...approvedEntities, ...limitedNewEntities];
                  } else {
                    entities = approvedEntities;
                  }
                } else {
                  entities = approvedEntities;
                }
              } catch (error) {
                console.warn(
                  `[Tool] searchCampaignContext - Community expansion failed (non-fatal):`,
                  error
                );
                // Continue with original entities if community expansion fails
                entities = approvedEntities;
              }
            } else {
              entities = approvedEntities;
            }

            // Fetch relationships for entities to help AI understand actual connections
            // Relationships are stored separately from entities, so we need to fetch them explicitly
            const graphService = new EntityGraphService(daoFactory.entityDAO);

            // Collect all relationship data first, then batch-fetch related entity names
            const entityRelationshipsMap = new Map<
              string,
              Awaited<ReturnType<typeof graphService.getRelationshipsForEntity>>
            >();
            const relatedEntityIds = new Set<string>();

            // Fetch relationships for all entities in parallel
            await Promise.all(
              approvedEntities.map(async (entity) => {
                try {
                  const relationships =
                    await graphService.getRelationshipsForEntity(
                      campaignId,
                      entity.id
                    );
                  entityRelationshipsMap.set(entity.id, relationships);
                  // Collect all related entity IDs for batch lookup
                  for (const rel of relationships) {
                    const otherId =
                      rel.fromEntityId === entity.id
                        ? rel.toEntityId
                        : rel.fromEntityId;
                    relatedEntityIds.add(otherId);
                  }
                } catch (error) {
                  console.warn(
                    `[Tool] searchCampaignContext - Failed to fetch relationships for entity ${entity.id}:`,
                    error
                  );
                  entityRelationshipsMap.set(entity.id, []);
                }
              })
            );

            // Batch-fetch all related entity names
            const relatedEntitiesMap = new Map<string, string>();
            if (relatedEntityIds.size > 0) {
              const relatedEntities =
                await daoFactory.entityDAO.listEntitiesByCampaign(campaignId, {
                  limit: 1000,
                });
              for (const relatedEntity of relatedEntities) {
                if (relatedEntityIds.has(relatedEntity.id)) {
                  relatedEntitiesMap.set(relatedEntity.id, relatedEntity.name);
                }
              }
            }

            // Get changelog overlay snapshot to include world state updates (e.g., faction alignment)
            let changelogOverlay: Awaited<
              ReturnType<WorldStateChangelogService["getOverlaySnapshot"]>
            > | null = null;
            let worldStateService: WorldStateChangelogService | null = null;
            try {
              worldStateService = new WorldStateChangelogService({
                db: env.DB,
              });
              changelogOverlay =
                await worldStateService.getOverlaySnapshot(campaignId);
            } catch (error) {
              console.warn(
                "[Tool] searchCampaignContext - Failed to get changelog overlay:",
                error
              );
              // Continue without overlay if it fails
            }

            // Transform entities to match expected format, including relationships
            for (const entity of approvedEntities) {
              const relationships = entityRelationshipsMap.get(entity.id) || [];

              // Apply changelog overlay to include world state updates (e.g., faction alignment)
              let worldStateInfo = "";
              if (changelogOverlay && worldStateService) {
                const entityWithOverlay = worldStateService.applyEntityOverlay(
                  entity,
                  changelogOverlay
                );

                // Include world state metadata in the entity text so the agent can see it
                if (entityWithOverlay.worldState) {
                  const ws = entityWithOverlay.worldState;
                  if (ws.metadata && typeof ws.metadata === "object") {
                    const metadataStr = JSON.stringify(ws.metadata);
                    if (metadataStr !== "{}") {
                      worldStateInfo = `\n\n═══════════════════════════════════════════════════════\n`;
                      worldStateInfo += `WORLD STATE UPDATES (FROM CHANGELOG)\n`;
                      worldStateInfo += `═══════════════════════════════════════════════════════\n`;
                      worldStateInfo += `CRITICAL: This information overrides any conflicting information in the entity content above.\n\n`;
                      worldStateInfo += `Metadata: ${metadataStr}\n`;
                      if (ws.status) {
                        worldStateInfo += `Status: ${ws.status}\n`;
                      }
                      if (ws.description) {
                        worldStateInfo += `Description: ${ws.description}\n`;
                      }
                      worldStateInfo += `\n`;
                    }
                  }
                }
              }

              // Build relationship summary for the AI with entity names
              const relationshipSummary = relationships.map((rel) => {
                const otherEntityId =
                  rel.fromEntityId === entity.id
                    ? rel.toEntityId
                    : rel.fromEntityId;
                const direction =
                  rel.fromEntityId === entity.id ? "outgoing" : "incoming";
                const otherEntityName =
                  relatedEntitiesMap.get(otherEntityId) || otherEntityId;

                return {
                  relationshipType: rel.relationshipType,
                  direction,
                  otherEntityId,
                  otherEntityName,
                };
              });

              // Build explicit relationship summary text for clarity
              // Place it FIRST so AI sees relationships before entity content
              let relationshipHeader =
                "═══════════════════════════════════════════════════════\n";
              relationshipHeader +=
                "EXPLICIT ENTITY RELATIONSHIPS (FROM ENTITY GRAPH)\n";
              relationshipHeader +=
                "═══════════════════════════════════════════════════════\n";
              relationshipHeader +=
                "CRITICAL: Use ONLY these relationships. Do NOT infer relationships from the entity content text below.\n\n";

              if (relationshipSummary.length > 0) {
                // Group relationships by type for better readability
                const relationshipsByType = new Map<
                  string,
                  typeof relationshipSummary
                >();
                relationshipSummary.forEach((rel) => {
                  if (!relationshipsByType.has(rel.relationshipType)) {
                    relationshipsByType.set(rel.relationshipType, []);
                  }
                  relationshipsByType.get(rel.relationshipType)!.push(rel);
                });

                // List relationships grouped by type
                relationshipsByType.forEach((rels, relationshipType) => {
                  relationshipHeader += `${relationshipType.toUpperCase()}:\n`;
                  rels.forEach((rel) => {
                    const verb =
                      rel.direction === "outgoing"
                        ? `${entity.name} ${relationshipType}`
                        : `${entity.name} is related via ${relationshipType} (incoming)`;
                    relationshipHeader += `  ${verb} ${rel.otherEntityName}\n`;
                  });
                  relationshipHeader += "\n";
                });
              } else {
                relationshipHeader +=
                  "NONE - This entity has no relationships in the entity graph.\n";
                relationshipHeader +=
                  "Do NOT infer relationships from content text below. Any relationship mentions in content are NOT verified.\n\n";
              }

              relationshipHeader +=
                "═══════════════════════════════════════════════════════\n";
              relationshipHeader +=
                "ENTITY CONTENT (may contain unverified mentions):\n";
              relationshipHeader +=
                "═══════════════════════════════════════════════════════\n";

              // Use semantic similarity score if available, otherwise use default
              const semanticScore = entitySimilarityScores.get(entity.id);
              const finalScore =
                semanticScore !== undefined ? semanticScore : 0.8; // Default score for entity matches

              // Combine relationship header, entity content, and world state info
              const entityText =
                relationshipHeader +
                JSON.stringify(entity.content) +
                worldStateInfo;

              results.push({
                type: "entity",
                source: "entity_graph",
                entityType: entity.entityType,
                title: entity.name,
                text: entityText,
                score: finalScore, // Use semantic relevancy score when available
                entityId: entity.id,
                filename: entity.name,
                relationships: relationshipSummary,
                relationshipCount: relationships.length,
              });
            }

            console.log(
              `[Tool] searchCampaignContext - Found ${approvedEntities.length} entity results`
            );

            // If user requests original file search, search file chunks from entities' source files
            // Only search files that are referenced by the found entities - if entity extraction
            // didn't find the entity in a file, that file likely doesn't contain relevant information
            if (searchOriginalFiles && query.trim().length > 0) {
              console.log(
                "[Tool] searchCampaignContext - Searching original file content from relevant entities"
              );
              try {
                // Extract file keys from found entities - these are the files that contain
                // information about the entities we found, so they're the most relevant to search
                const relevantFileKeys = Array.from(
                  extractFileKeysFromEntities(approvedEntities)
                );

                if (relevantFileKeys.length > 0) {
                  // Search file chunks for matching text (case-insensitive)
                  const searchTermLower = query.toLowerCase();
                  const maxFileResults = 50; // Limit total file search results to avoid token overflow
                  let fileResultCount = 0;

                  // Search chunks for each relevant file
                  for (const fileKey of relevantFileKeys) {
                    if (fileResultCount >= maxFileResults) {
                      break; // Stop searching if we've hit the limit
                    }

                    try {
                      // Get all chunks for this file
                      const allChunks =
                        await daoFactory.fileDAO.getFileChunks(fileKey);

                      // Get file metadata for display name
                      const fileMetadata =
                        await daoFactory.fileDAO.getFileMetadata(fileKey);

                      // Filter chunks that contain the search term (case-insensitive)
                      const matchingChunks = allChunks.filter((chunk) =>
                        chunk.chunk_text.toLowerCase().includes(searchTermLower)
                      );

                      // Limit to first 10 matches per file, and respect global limit
                      const remainingSlots = maxFileResults - fileResultCount;
                      const limitedChunks = matchingChunks.slice(
                        0,
                        Math.min(10, remainingSlots)
                      );

                      // Add matching chunks to results
                      for (const chunk of limitedChunks) {
                        results.push({
                          type: "file_content",
                          source: "original_file",
                          fileKey: chunk.file_key,
                          fileName:
                            fileMetadata?.display_name ||
                            fileMetadata?.file_name ||
                            "Unknown file",
                          chunkIndex: chunk.chunk_index,
                          text: chunk.chunk_text,
                          title: `${
                            fileMetadata?.display_name ||
                            fileMetadata?.file_name ||
                            "Unknown file"
                          } (chunk ${chunk.chunk_index + 1})`,
                          score: 1.0, // Lexical match, all results are equally relevant
                        });
                        fileResultCount++;
                      }
                    } catch (error) {
                      console.warn(
                        `[Tool] searchCampaignContext - Failed to search chunks for file ${fileKey}:`,
                        error
                      );
                    }
                  }

                  console.log(
                    `[Tool] searchCampaignContext - Found ${fileResultCount} file content matches from ${relevantFileKeys.length} files`
                  );
                } else {
                  console.log(
                    "[Tool] searchCampaignContext - No file keys found in entity metadata for file search"
                  );
                }
              } catch (error) {
                console.error(
                  "[Tool] searchCampaignContext - Error searching file content:",
                  error
                );
                // Don't fail the entire search if file search fails, just log and continue
              }
            }
          } catch (error) {
            console.warn(
              "[Tool] searchCampaignContext - Entity search failed:",
              error
            );
            // Continue even if entity search fails
          }
        }

        // Graph traversal: If traverseFromEntityIds is provided, traverse the graph from those entities
        if (traverseFromEntityIds && traverseFromEntityIds.length > 0) {
          try {
            console.log(
              `[Tool] searchCampaignContext - Starting graph traversal from ${traverseFromEntityIds.length} entity IDs with depth ${traverseDepth}`
            );

            const daoFactory = getDAOFactory(env);
            const graphService = new EntityGraphService(daoFactory.entityDAO);

            // Normalize relationship types if provided
            const normalizedRelationshipTypes = traverseRelationshipTypes?.map(
              (type) => type.toLowerCase().replace(/\s+/g, "_")
            );

            // Collect all traversed neighbors from all starting entities
            const allTraversedNeighbors: Array<{
              neighbor: Awaited<
                ReturnType<typeof graphService.getNeighbors>
              >[number];
              sourceEntityId: string;
            }> = [];

            // Traverse from each starting entity ID
            for (const entityId of traverseFromEntityIds) {
              try {
                const neighbors = await graphService.getNeighbors(
                  campaignId,
                  entityId,
                  {
                    maxDepth: traverseDepth,
                    relationshipTypes: normalizedRelationshipTypes as any,
                  }
                );
                console.log(
                  `[Tool] searchCampaignContext - Found ${neighbors.length} neighbors for entity ${entityId}`
                );
                allTraversedNeighbors.push(
                  ...neighbors.map((neighbor) => ({
                    neighbor,
                    sourceEntityId: entityId,
                  }))
                );
              } catch (error) {
                console.warn(
                  `[Tool] searchCampaignContext - Failed to traverse from entity ${entityId}:`,
                  error
                );
              }
            }

            // Deduplicate by entity ID (keep first occurrence)
            const traversedEntityIdsMap = new Map<
              string,
              {
                neighbor: Awaited<
                  ReturnType<typeof graphService.getNeighbors>
                >[number];
                sourceEntityId: string;
              }
            >();
            for (const item of allTraversedNeighbors) {
              if (!traversedEntityIdsMap.has(item.neighbor.entityId)) {
                traversedEntityIdsMap.set(item.neighbor.entityId, item);
              }
            }

            const uniqueTraversedEntityIds = Array.from(
              traversedEntityIdsMap.keys()
            );

            console.log(
              `[Tool] searchCampaignContext - Traversed ${uniqueTraversedEntityIds.length} unique entities from graph`
            );

            if (
              includeTraversedEntities &&
              uniqueTraversedEntityIds.length > 0
            ) {
              // Fetch full entity details for traversed entities
              const allCampaignEntities =
                await daoFactory.entityDAO.listEntitiesByCampaign(campaignId, {
                  limit: 1000,
                });

              const traversedEntities = allCampaignEntities.filter((entity) =>
                uniqueTraversedEntityIds.includes(entity.id)
              );

              // Filter out rejected/ignored entities
              const approvedTraversedEntities = traversedEntities.filter(
                (entity) => {
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
                }
              );

              // Fetch relationships for traversed entities
              const traversedEntityRelationshipsMap = new Map<
                string,
                Awaited<
                  ReturnType<typeof graphService.getRelationshipsForEntity>
                >
              >();
              const traversedRelatedEntityIds = new Set<string>();

              await Promise.all(
                approvedTraversedEntities.map(async (entity) => {
                  try {
                    const relationships =
                      await graphService.getRelationshipsForEntity(
                        campaignId,
                        entity.id
                      );
                    traversedEntityRelationshipsMap.set(
                      entity.id,
                      relationships
                    );
                    for (const rel of relationships) {
                      const otherId =
                        rel.fromEntityId === entity.id
                          ? rel.toEntityId
                          : rel.fromEntityId;
                      traversedRelatedEntityIds.add(otherId);
                    }
                  } catch (error) {
                    console.warn(
                      `[Tool] searchCampaignContext - Failed to fetch relationships for traversed entity ${entity.id}:`,
                      error
                    );
                    traversedEntityRelationshipsMap.set(entity.id, []);
                  }
                })
              );

              // Batch-fetch related entity names
              const traversedRelatedEntitiesMap = new Map<string, string>();
              if (traversedRelatedEntityIds.size > 0) {
                const allRelatedEntities =
                  await daoFactory.entityDAO.listEntitiesByCampaign(
                    campaignId,
                    { limit: 1000 }
                  );
                for (const relatedEntity of allRelatedEntities) {
                  if (traversedRelatedEntityIds.has(relatedEntity.id)) {
                    traversedRelatedEntitiesMap.set(
                      relatedEntity.id,
                      relatedEntity.name
                    );
                  }
                }
              }

              // Get source entity names for context
              const sourceEntityMap = new Map<string, string>();
              if (traverseFromEntityIds.length > 0) {
                const allSourceEntities =
                  await daoFactory.entityDAO.listEntitiesByCampaign(
                    campaignId,
                    { limit: 1000 }
                  );
                for (const sourceEntity of allSourceEntities) {
                  if (traverseFromEntityIds.includes(sourceEntity.id)) {
                    sourceEntityMap.set(sourceEntity.id, sourceEntity.name);
                  }
                }
              }

              // Transform traversed entities to match expected format
              for (const entity of approvedTraversedEntities) {
                const traversalInfo = traversedEntityIdsMap.get(entity.id);
                const relationships =
                  traversedEntityRelationshipsMap.get(entity.id) || [];

                // Build relationship summary
                const relationshipSummary = relationships.map((rel) => {
                  const otherEntityId =
                    rel.fromEntityId === entity.id
                      ? rel.toEntityId
                      : rel.fromEntityId;
                  const direction =
                    rel.fromEntityId === entity.id ? "outgoing" : "incoming";
                  const otherEntityName =
                    traversedRelatedEntitiesMap.get(otherEntityId) ||
                    otherEntityId;

                  return {
                    relationshipType: rel.relationshipType,
                    direction,
                    otherEntityId,
                    otherEntityName,
                  };
                });

                // Build relationship header with traversal context
                const sourceEntityName = traversalInfo?.sourceEntityId
                  ? sourceEntityMap.get(traversalInfo.sourceEntityId) ||
                    traversalInfo.sourceEntityId
                  : "unknown";
                const depth = traversalInfo?.neighbor.depth || 1;

                let relationshipHeader =
                  "═══════════════════════════════════════════════════════\n";
                relationshipHeader +=
                  "EXPLICIT ENTITY RELATIONSHIPS (FROM ENTITY GRAPH)\n";
                relationshipHeader +=
                  "═══════════════════════════════════════════════════════\n";
                relationshipHeader += `Found via graph traversal from "${sourceEntityName}" at depth ${depth}.\n`;
                relationshipHeader +=
                  "CRITICAL: Use ONLY these relationships. Do NOT infer relationships from the entity content text below.\n\n";

                if (relationshipSummary.length > 0) {
                  const relationshipsByType = new Map<
                    string,
                    typeof relationshipSummary
                  >();
                  relationshipSummary.forEach((rel) => {
                    if (!relationshipsByType.has(rel.relationshipType)) {
                      relationshipsByType.set(rel.relationshipType, []);
                    }
                    relationshipsByType.get(rel.relationshipType)!.push(rel);
                  });

                  relationshipsByType.forEach((rels, relationshipType) => {
                    relationshipHeader += `${relationshipType.toUpperCase()}:\n`;
                    rels.forEach((rel) => {
                      const verb =
                        rel.direction === "outgoing"
                          ? `${entity.name} ${relationshipType}`
                          : `${entity.name} is related via ${relationshipType} (incoming)`;
                      relationshipHeader += `  ${verb} ${rel.otherEntityName}\n`;
                    });
                    relationshipHeader += "\n";
                  });
                } else {
                  relationshipHeader +=
                    "NONE - This entity has no relationships in the entity graph.\n";
                  relationshipHeader +=
                    "Do NOT infer relationships from content text below. Any relationship mentions in content are NOT verified.\n\n";
                }

                relationshipHeader +=
                  "═══════════════════════════════════════════════════════\n";
                relationshipHeader +=
                  "ENTITY CONTENT (may contain unverified mentions):\n";
                relationshipHeader +=
                  "═══════════════════════════════════════════════════════\n";

                results.push({
                  type: "entity",
                  source: "graph_traversal",
                  entityType: entity.entityType,
                  title: entity.name,
                  text: relationshipHeader + JSON.stringify(entity.content),
                  score: 0.7 - depth * 0.1, // Lower score for deeper traversal
                  entityId: entity.id,
                  filename: entity.name,
                  relationships: relationshipSummary,
                  relationshipCount: relationships.length,
                  // Add traversal metadata
                  traversalDepth: depth,
                  traversedFrom: sourceEntityName,
                } as any);
              }

              console.log(
                `[Tool] searchCampaignContext - Added ${approvedTraversedEntities.length} traversed entities to results`
              );
            }
          } catch (error) {
            console.warn(
              "[Tool] searchCampaignContext - Graph traversal failed:",
              error
            );
            // Continue even if traversal fails
          }
        }

        // Check if we have semantic scores (non-default scores indicate semantic relevancy was computed)
        // Default scores are 0.8 (entity matches), 0.7 (traversed entities), or 0 (no score)
        const hasSemanticScores = results.some((r) => {
          const score = r.score || 0;
          return score !== 0.8 && score !== 0.7 && score !== 0 && score !== 1.0;
        });

        // Filter results to prioritize strong name matches when they exist
        // This ensures queries like "tell me about [entity name]" focus on that specific entity
        // Note: entityNameSimilarityScores and hasStrongNameMatches are declared at function scope (line ~340)
        let finalResults = results;
        if (hasStrongNameMatches && entityNameSimilarityScores.size > 0) {
          const nameMatchedResults = results.filter((result) => {
            const nameScore = entityNameSimilarityScores.get(
              result.entityId || ""
            );
            return nameScore !== undefined && nameScore >= nameMatchThreshold;
          });
          if (nameMatchedResults.length > 0) {
            finalResults = nameMatchedResults;
            console.log(
              `[Tool] searchCampaignContext - Filtered to ${nameMatchedResults.length} entities with strong name matches (query: "${queryIntent.searchQuery}")`
            );
          }
        }

        // Sort results by semantic relevancy (highest score first)
        // All results should be sorted by relevancy to the query/prompt
        finalResults.sort((a, b) => {
          const scoreA = a.score || 0;
          const scoreB = b.score || 0;

          // Primary sort: by semantic relevancy score (highest first) if available
          if (hasSemanticScores && scoreB !== scoreA) {
            return scoreB - scoreA;
          }

          // If no semantic scores or scores are equal, sort alphabetically by name
          const nameA = (
            a.title ||
            a.name ||
            a.display_name ||
            a.id ||
            ""
          ).toLowerCase();
          const nameB = (
            b.title ||
            b.name ||
            b.display_name ||
            b.id ||
            ""
          ).toLowerCase();
          return nameA.localeCompare(nameB);
        });

        // Check if there are more results (for list-all queries, we requested limit+1)
        let hasMore = false;
        let actualResults = finalResults;
        const limitHit =
          queryIntent.isListAll && finalResults.length > effectiveLimit;

        if (limitHit) {
          hasMore = true;
          actualResults = finalResults.slice(0, effectiveLimit);
        } else if (
          !queryIntent.isListAll &&
          finalResults.length > effectiveLimit
        ) {
          // For search queries, check if we hit the limit
          hasMore = true;
          actualResults = finalResults.slice(0, effectiveLimit);
        }

        // Note: totalCount is already fetched above for list-all queries

        const entityTypeLabel = queryIntent.entityType
          ? ` (${queryIntent.entityType})`
          : "";

        // Build clear pagination message
        let paginationInfo = "";
        const sortInfo = hasSemanticScores
          ? " Results are sorted from most to least relevant."
          : " Results are sorted alphabetically by name.";

        if (queryIntent.isListAll) {
          if (limitHit && totalCount !== undefined) {
            paginationInfo = ` ⚠️ LIMIT REACHED: Showing ${actualResults.length} of ${totalCount} total shards. There are ${totalCount - actualResults.length} more shards not shown. Use offset=${offset + effectiveLimit} to retrieve the next page.`;
          } else if (totalCount !== undefined) {
            paginationInfo = ` (${totalCount} total)`;
          }
        } else {
          if (hasMore && totalCount !== undefined) {
            paginationInfo = ` ⚠️ LIMIT REACHED: Showing ${actualResults.length} of ${totalCount} total results. There are ${totalCount - actualResults.length} more results not shown. Use offset=${offset + effectiveLimit} to retrieve the next page.`;
          } else if (hasMore) {
            paginationInfo = ` ⚠️ LIMIT REACHED: Showing ${actualResults.length} of ${finalResults.length}+ results. There are more results not shown. Use offset=${offset + effectiveLimit} to retrieve the next page.`;
          } else if (totalCount !== undefined) {
            paginationInfo = ` (${totalCount} total)`;
          }
        }

        return createToolSuccess(
          `Found ${totalCount !== undefined ? totalCount : actualResults.length} results for "${query}"${entityTypeLabel}.${sortInfo}${paginationInfo}`,
          {
            query,
            queryIntent,
            results: actualResults,
            totalCount,
            pagination: {
              offset,
              limit: effectiveLimit,
              hasMore,
              nextOffset: hasMore ? offset + effectiveLimit : undefined,
            },
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

// Tool to list all entities (handles pagination internally)
export const listAllEntities = tool({
  description: `List ALL entities from a campaign. This tool automatically handles pagination internally and returns every single entity in one response. Use this when users explicitly ask to "list all" entities (e.g., "list all locations", "show all monsters", "all NPCs").

CRITICAL: This tool is specifically for listing ALL entities. For searching/filtering entities by keywords or semantic similarity, use searchCampaignContext instead.

AVAILABLE ENTITY TYPES: ${ENTITY_TYPES_LIST}. When users use synonyms (e.g., "beasts", "creatures" for monsters; "people", "characters" for NPCs; "places" for locations), you MUST map them to the correct entity type name. Examples: "beasts" or "creatures" → use "monsters"; "people" or "characters" (when referring to NPCs) → use "npcs"; "player characters" or "PCs" → use "pcs"; "places" → use "locations".

IMPORTANT: Distinguish between "npcs" (non-player characters controlled by the GM) and "pcs" (player-controlled characters). When users ask for "characters", determine if they mean NPCs or player characters based on context. If they say "player characters", "PCs", or refer to characters that players control, use "pcs". If they mean NPCs or characters the GM controls, use "npcs".

DUPLICATE DETECTION: This tool automatically detects duplicate entities (entities with the same name, case-insensitive) and includes a "duplicates" field in the response. If duplicates are found, you MUST proactively inform the user and offer to help consolidate them.

This tool will automatically fetch all pages and return the complete list. No manual pagination is needed.`,
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    entityType: z
      .preprocess(
        (val) => (val === "" ? undefined : val),
        z
          .enum([
            ...STRUCTURED_ENTITY_TYPES,
            "character", // Maps to "characters" in database
            "resource", // Maps to "resources" in database
          ] as [string, ...string[]])
          .optional()
      )
      .describe(
        `Optional entity type to filter by. Available types: ${ENTITY_TYPES_LIST}. If not provided or empty string, returns all entity types.`
      ),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { campaignId, entityType, jwt },
    context?: any
  ): Promise<ToolResult> => {
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[listAllEntities] Using toolCallId:", toolCallId);

    try {
      const env = getEnvFromContext(context);
      if (!env) {
        return createToolError(
          "Environment not available",
          "Unable to access campaign data",
          500,
          toolCallId
        );
      }

      const userId = extractUsernameFromJwt(jwt);
      if (!userId) {
        return createToolError(
          "Invalid authentication token",
          "Authentication failed",
          AUTH_CODES.INVALID_KEY,
          toolCallId
        );
      }

      const daoFactory = getDAOFactory(env);
      const campaignDAO = daoFactory.campaignDAO;
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

      // Map entity type names to database entity types (same as searchCampaignContext)
      // Also handle empty strings as undefined (safety check)
      const entityTypeMap: Record<string, string> = {
        characters: "character",
        resources: "resource",
      };
      const targetEntityType =
        entityType && entityType.trim() !== ""
          ? entityTypeMap[entityType] || entityType
          : null;

      // Get total count first
      const totalCount = await daoFactory.entityDAO.getEntityCountByCampaign(
        campaignId,
        targetEntityType ? { entityType: targetEntityType } : {}
      );

      console.log(
        `[Tool] listAllEntities - Fetching all ${totalCount} entities${targetEntityType ? ` of type ${targetEntityType}` : ""}`
      );

      // Fetch all entities with internal pagination
      const allEntities: any[] = [];
      const pageSize = 50; // Use max page size to minimize calls
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const page = await daoFactory.entityDAO.listEntitiesByCampaign(
          campaignId,
          {
            entityType: targetEntityType || undefined,
            limit: pageSize + 1, // Request one extra to check if there are more
            offset,
          }
        );

        // Check if there are more results
        if (page.length > pageSize) {
          hasMore = true;
          allEntities.push(...page.slice(0, pageSize));
          offset += pageSize;
        } else {
          hasMore = false;
          allEntities.push(...page);
        }

        console.log(
          `[Tool] listAllEntities - Fetched ${allEntities.length} of ${totalCount} entities`
        );
      }

      // Transform entities to match searchCampaignContext format
      const results = allEntities.map((entity) => ({
        id: entity.id,
        type: entity.entity_type,
        name: entity.name || entity.title || entity.display_name || entity.id,
        title: entity.title,
        display_name: entity.display_name,
        text: entity.content_text,
        metadata: entity.metadata,
        relationships: entity.relationships || [],
        score: 1.0, // All entities have equal relevance when listing all
      }));

      // Sort alphabetically by name for consistent ordering
      results.sort((a, b) => {
        const nameA = (
          a.name ||
          a.title ||
          a.display_name ||
          a.id ||
          ""
        ).toLowerCase();
        const nameB = (
          b.name ||
          b.title ||
          b.display_name ||
          b.id ||
          ""
        ).toLowerCase();
        return nameA.localeCompare(nameB);
      });

      // Detect duplicates by name (case-insensitive)
      const nameCounts = new Map<
        string,
        { count: number; entityIds: string[] }
      >();
      for (const entity of results) {
        const normalizedName = (
          entity.name ||
          entity.title ||
          entity.display_name ||
          ""
        )
          .toLowerCase()
          .trim();
        if (normalizedName) {
          const existing = nameCounts.get(normalizedName) || {
            count: 0,
            entityIds: [],
          };
          existing.count++;
          existing.entityIds.push(entity.id);
          nameCounts.set(normalizedName, existing);
        }
      }

      const duplicates: Array<{
        name: string;
        count: number;
        entityIds: string[];
      }> = [];
      for (const [name, data] of nameCounts.entries()) {
        if (data.count > 1) {
          duplicates.push({
            name,
            count: data.count,
            entityIds: data.entityIds,
          });
        }
      }

      const entityTypeLabel = entityType ? ` (${entityType})` : "";
      let message = `Found ${totalCount} total shards${entityTypeLabel}. Results are sorted alphabetically by name.`;

      if (duplicates.length > 0) {
        const duplicateNames = duplicates
          .map((d) => `"${d.name}" (${d.count} entries)`)
          .join(", ");
        message += ` WARNING: Detected duplicate entities: ${duplicateNames}. Consider consolidating or deleting duplicates.`;
      }

      return createToolSuccess(
        message,
        {
          entityType: entityType || null,
          results,
          totalCount,
          duplicates: duplicates.length > 0 ? duplicates : undefined,
        },
        toolCallId
      );
    } catch (error) {
      console.error("Error listing all entities:", error);
      return createToolError(
        "Failed to list all entities",
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
    "Search for external resources and references that might be relevant to the campaign. IMPORTANT: Only use this tool when users explicitly ask for external inspiration, reference materials, or when you've confirmed the user has no approved entities of the requested type in their campaign. If the user asks about entities 'from my campaign', 'in my world', or similar phrases, use searchCampaignContext instead to retrieve their approved entities first.",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    query: z.string().describe("The search query for external resources"),
    resourceType: z
      .enum(["adventures", "maps", "characters", "monsters", "items", "worlds"])
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

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

// Tool to search campaign context
export const searchCampaignContext = tool({
  description: `Search through campaign context using semantic search and graph traversal. 

CRITICAL: Use this tool FIRST when users ask about entities "from my campaign", "in my world", "I've created", or similar phrases indicating existing campaign content. This tool retrieves the user's APPROVED entities (shards) that they've already added to their campaign. NEVER use searchExternalResources for entities the user has in their campaign.

CRITICAL - CALL THIS TOOL ONLY ONCE: When users mention multiple synonyms (e.g., "monsters or beasts", "beasts or creatures"), these are synonyms for the SAME entity type. You MUST map all synonyms to the correct entity type name and call this tool ONCE with that mapped type. DO NOT call this tool multiple times with different synonyms.

SEMANTIC SEARCH: Searches entities via semantic similarity. Entity results include their actual relationships from the entity graph, showing which entities are connected and how (e.g., 'resides_in', 'located_in', 'allied_with'). Use this to find relevant entities across all entity types including: ${ENTITY_TYPES_LIST}. 

QUERY SYNTAX: The query string automatically infers search intent:
- "monsters" → lists all monsters
- "fire monsters" → searches for monsters matching "fire" 
- "all monsters" → lists all monsters
- Empty query → lists all entities (WARNING: Only use empty query when user doesn't specify entity types)
- "context: session notes" → searches session digests (optional, for backward compatibility - note that session digests are temporary and get parsed into entities)

AVAILABLE ENTITY TYPES: The tool recognizes these entity types: ${ENTITY_TYPES_LIST}. When users use synonyms or alternative terms (e.g., "beasts", "creatures" for monsters; "people", "characters" for NPCs; "places" for locations), you MUST map them to the correct entity type name before including in the query. For example: "beasts" or "creatures" → use "monsters" in query; "people" or "characters" (when referring to NPCs) → use "npcs" in query; "places" → use "locations" in query.

CRITICAL - SYNONYM MAPPING: When users specify entity types in their request (e.g., "monsters", "beasts", "creatures", "NPCs", "locations"), you MUST: (1) Map ALL synonyms to the correct entity type name from the list above, (2) Call this tool ONCE with that mapped entity type in the query parameter. Examples: User says "monsters or beasts from my campaign" → call ONCE with query="monsters" (NOT twice with "monsters" and "beasts"). User says "beasts or creatures" → call ONCE with query="monsters". Do NOT use an empty query when entity types are specified - this will return ALL entities including unwanted types (e.g., NPCs when user asked for monsters).

APPROVED ENTITIES AS CREATIVE BOUNDARIES: Approved entities (shards) in the campaign form the structural foundation for your responses. When users ask you to work with entities (creatures, NPCs, locations, etc.) from their campaign, you MUST first retrieve the relevant approved entities using this tool. These approved entities define the boundaries of what exists in their world. Within those boundaries, use your creative reasoning to interpret, match, adapt, or elaborate on the entities based on the user's request. The approved entities provide the outline - you fill in the creative details within that outline. For example, if asked to match creatures to themes, retrieve the user's approved creatures first (using query="monsters" to list all monsters), then creatively analyze how they might align with those themes based on their characteristics, even if the theme keywords aren't explicitly in the entity metadata.

GRAPH TRAVERSAL: After finding entities via semantic search, use graph traversal to explore connected entities. Provide traverseFromEntityIds (entity IDs from previous search results) to traverse the graph starting from those entities. Use traverseDepth (1-3) to control how many relationship hops to follow (1=direct neighbors, 2=neighbors of neighbors, etc.). Optionally filter by traverseRelationshipTypes to focus on specific relationship types (e.g., ['resides_in', 'located_in'] for location queries). Example workflow: (1) Search for "Location X" to find its entity ID, (2) Use traverseFromEntityIds with that ID and traverseRelationshipTypes=['resides_in'] to find all NPCs living there.

CRITICAL: Entity results include explicit relationships from the entity graph. ONLY use explicit relationships shown in the results. Do NOT infer relationships from entity content text, entity names, or descriptions. If a relationship is not explicitly listed, it does NOT exist in the entity graph.`,
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    query: z
      .string()
      .describe(
        `The search query - can include entity names, plot points, topics, or entity types. Available entity types: ${ENTITY_TYPES_LIST}. The tool automatically infers the entity type from your query. CRITICAL: When users specify entity types in their request (e.g., "monsters", "beasts", "creatures", "NPCs"), you MUST: (1) Map any synonyms to the correct entity type name (e.g., "beasts"/"creatures" → "monsters", "people"/"characters" → "npcs"), (2) Include that entity type keyword in this query parameter. Examples: "monsters" lists all monsters, "fire monsters" searches for monsters matching "fire", "all monsters" lists all monsters. Empty query lists all entities (only use when user doesn't specify entity types). Use "context:" prefix to search session digests (optional - note that session digests are temporary and get parsed into entities).`
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

            // If queryIntent indicates list-all, or if we have a search query, proceed
            if (queryIntent.isListAll) {
              // List all entities of the requested type (or all entities if no type specified)
              if (targetEntityType) {
                entities = await daoFactory.entityDAO.listEntitiesByCampaign(
                  campaignId,
                  {
                    entityType: targetEntityType,
                    limit: 100,
                  }
                );
                console.log(
                  `[Tool] searchCampaignContext - Listing all ${entities.length} entities of type: ${targetEntityType}`
                );
              } else {
                // No entity type specified, list all entities
                entities = await daoFactory.entityDAO.listEntitiesByCampaign(
                  campaignId,
                  { limit: 100 }
                );
                console.log(
                  `[Tool] searchCampaignContext - Listing all ${entities.length} entities`
                );
              }
            } else if (
              queryIntent.searchQuery &&
              queryIntent.searchQuery.trim().length > 0
            ) {
              // Use semantic/keyword search to respect the query
              // Use semantic search to find entities matching the query
              try {
                if (planningService && env.VECTORIZE) {
                  // Use PlanningContextService to generate embeddings
                  const queryEmbeddings =
                    await planningService.generateEmbeddings([
                      queryIntent.searchQuery,
                    ]);
                  const queryEmbedding = queryEmbeddings[0];

                  if (queryEmbedding) {
                    const entityEmbeddingService = new EntityEmbeddingService(
                      env.VECTORIZE
                    );

                    // If a target entity type is detected, filter at the embedding search level
                    // This ensures we only search within the relevant entity type
                    // Increase topK when filtering to ensure we get enough results
                    const searchTopK = targetEntityType ? 20 : 10;

                    const similarEntities =
                      await entityEmbeddingService.findSimilarByEmbedding(
                        queryEmbedding,
                        {
                          campaignId,
                          entityType: targetEntityType || undefined,
                          topK: searchTopK,
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
                      await planningService.generateEmbeddings([
                        queryIntent.searchQuery,
                      ]);
                    const queryEmbedding = queryEmbeddings[0];

                    if (queryEmbedding) {
                      // Use PlanningContextService's findMatchingEntityIds which uses the same
                      // Increase maxEntities when filtering by type to ensure enough results
                      const maxEntities = targetEntityType ? 500 : 25;
                      const entityIds =
                        await planningService.findMatchingEntityIds(
                          campaignId,
                          queryIntent.searchQuery,
                          queryEmbedding,
                          maxEntities
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
                  const words = queryIntent.searchQuery
                    .split(/\s+/)
                    .filter((w) => w.length > 2);
                  const keywordNames = [
                    queryIntent.searchQuery.toLowerCase(), // Try full query as one keyword
                    ...words.map((w) => w.toLowerCase()),
                  ].slice(0, 10);

                  console.log(
                    `[Tool] searchCampaignContext - Searching entities with keywords: ${keywordNames.join(", ")}`
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
                    `[Tool] searchCampaignContext - Keyword search returned ${entities.length} entities before filtering`
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

            // Transform entities to match expected format, including relationships
            for (const entity of approvedEntities) {
              const relationships = entityRelationshipsMap.get(entity.id) || [];

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

              results.push({
                type: "entity",
                source: "entity_graph",
                entityType: entity.entityType,
                title: entity.name,
                text: relationshipHeader + JSON.stringify(entity.content),
                score: 0.8, // Default score for entity matches
                entityId: entity.id,
                filename: entity.name,
                relationships: relationshipSummary,
                relationshipCount: relationships.length,
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

        // Sort results by score (highest first)
        results.sort((a, b) => (b.score || 0) - (a.score || 0));

        const entityTypeLabel = queryIntent.entityType
          ? ` (${queryIntent.entityType})`
          : "";
        return createToolSuccess(
          `Found ${results.length} results for "${query}"${entityTypeLabel}`,
          {
            query,
            queryIntent,
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

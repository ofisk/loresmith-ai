import { tool } from "ai";
import { z } from "zod";
import { commonSchemas } from "../utils";
import { createToolError, createToolSuccess } from "../utils";
import type { ToolResult } from "@/app-constants";
import { API_CONFIG } from "@/shared-config";
import { extractUsernameFromJwt } from "../utils";
import { authenticatedFetch, handleAuthError } from "@/lib/tool-auth";
import { RELATIONSHIP_TYPES } from "@/lib/relationship-types";
import { getDAOFactory } from "@/dao/dao-factory";
import { EntityExtractionService } from "@/services/rag/entity-extraction-service";
import { EntityExtractionPipeline } from "@/services/rag/entity-extraction-pipeline";
import { EntityGraphService } from "@/services/graph/entity-graph-service";
import { EntityEmbeddingService } from "@/services/vectorize/entity-embedding-service";
import { STRUCTURED_ENTITY_TYPES } from "@/lib/entity-types";

function getEnvFromContext(context: any): any {
  if (context?.env) {
    return context.env;
  }
  if ((globalThis as any).env) {
    return (globalThis as any).env;
  }
  return null;
}

/**
 * Tool: Extract entities from text content
 * Uses AI to extract structured entities (NPCs, locations, items, etc.) from text
 * and creates them in the entity graph for the campaign.
 */
export const extractEntitiesFromContentTool = tool({
  description:
    "Extract structured entities (NPCs, locations, items, monsters, etc.) from text content " +
    "and add them to the campaign's entity graph. Use this when the user provides text content " +
    "(from uploaded files or chat messages) that contains information about entities like characters, " +
    "locations, items, or other game content. The tool will automatically identify and extract " +
    "entities and their relationships from the text.",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    content: z
      .string()
      .describe(
        "The text content to extract entities from. Can be from uploaded files, user messages, or any text containing game content."
      ),
    sourceName: z
      .string()
      .optional()
      .describe(
        "Optional name/identifier for the source of this content (e.g., filename, document title). Used for tracking."
      ),
    sourceId: z
      .string()
      .optional()
      .describe(
        "Optional ID for the source document/resource. Used for tracking where entities came from."
      ),
    sourceType: z
      .string()
      .optional()
      .default("user_input")
      .describe(
        "Type of source (e.g., 'user_input', 'file_upload', 'document'). Default: 'user_input'"
      ),
    metadata: z
      .record(z.unknown())
      .optional()
      .describe("Optional additional metadata to attach to extracted entities"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { campaignId, content, sourceName, sourceId, sourceType, metadata, jwt },
    context?: any
  ): Promise<ToolResult> => {
    const toolCallId = crypto.randomUUID();

    try {
      const env = getEnvFromContext(context);
      if (!env) {
        // Fallback to API call
        const response = await authenticatedFetch(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.EXTRACT(campaignId)
          ),
          {
            method: "POST",
            jwt,
            body: JSON.stringify({
              content,
              sourceName: sourceName || "user_input",
              sourceId: sourceId || crypto.randomUUID(),
              sourceType: sourceType || "user_input",
              metadata,
            }),
          }
        );

        if (!response.ok) {
          const authError = handleAuthError(response);
          if (authError) {
            return createToolError(
              authError,
              "Authentication failed",
              response.status,
              toolCallId
            );
          }

          const errorData = (await response.json()) as {
            error?: string;
            message?: string;
          };
          return createToolError(
            errorData.error || "Failed to extract entities",
            errorData.message || "Unknown error",
            response.status,
            toolCallId
          );
        }

        const data = (await response.json()) as {
          entities?: unknown[];
          relationships?: unknown[];
          count?: number;
        };
        return createToolSuccess(
          `Extracted ${data.entities?.length || 0} entities from content`,
          data,
          toolCallId
        );
      }

      // Direct database access
      const userId = extractUsernameFromJwt(jwt);
      if (!userId) {
        return createToolError(
          "Invalid authentication token",
          "Authentication failed",
          401,
          toolCallId
        );
      }

      // Get DAO factory and services
      const daoFactory = getDAOFactory(env);

      // Verify campaign ownership using DAO
      const campaign = await daoFactory.campaignDAO.getCampaignByIdWithMapping(
        campaignId,
        userId
      );

      if (!campaign) {
        return createToolError(
          "Campaign not found",
          "Campaign not found or access denied",
          404,
          toolCallId
        );
      }

      // Initialize services
      const extractionService = new EntityExtractionService(env);
      const embeddingService = new EntityEmbeddingService(env.VECTORIZE);
      const graphService = new EntityGraphService(daoFactory.entityDAO);
      const openaiApiKey = env?.OPENAI_API_KEY as string | undefined;
      const pipeline = new EntityExtractionPipeline(
        daoFactory.entityDAO,
        extractionService,
        embeddingService,
        graphService,
        env,
        openaiApiKey
      );

      // Extract and persist entities using the pipeline
      const result = await pipeline.run({
        campaignId,
        content,
        sourceId: sourceId || crypto.randomUUID(),
        sourceType: sourceType || "user_input",
        sourceName: sourceName || "user_input",
        metadata,
      });

      return createToolSuccess(
        `Extracted and created ${result.entities.length} entities and ${result.relationships.length} relationships`,
        {
          entities: result.entities,
          relationships: result.relationships,
          count: result.entities.length,
          relationshipCount: result.relationships.length,
        },
        toolCallId
      );
    } catch (error) {
      console.error("[extractEntitiesFromContentTool] Error:", error);
      return createToolError(
        "Failed to extract entities from content",
        error instanceof Error ? error.message : "Unknown error",
        500,
        toolCallId
      );
    }
  },
});

/**
 * Tool: Create a relationship between two entities
 * Creates a directed relationship in the entity graph between two existing entities.
 */
export const createEntityRelationshipTool = tool({
  description:
    "Create a relationship between two entities in the campaign's entity graph. " +
    "Use this when the user mentions a relationship between entities (e.g., 'NPC X lives in Location Y', " +
    "'Character A is allied with Character B', 'Item belongs to NPC'). " +
    "The entities must already exist in the graph (create them first using extractEntitiesFromContentTool if needed).",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    fromEntityId: z
      .string()
      .describe(
        "The ID of the source entity (the entity that has the relationship)"
      ),
    toEntityId: z
      .string()
      .describe("The ID of the target entity (the entity that is related to)"),
    relationshipType: z
      .enum(RELATIONSHIP_TYPES as unknown as [string, ...string[]])
      .describe(
        "The type of relationship (e.g., 'located_in', 'allied_with', 'owns', 'member_of')"
      ),
    strength: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe(
        "Optional relationship strength/confidence (0.0 to 1.0). Higher values indicate stronger relationships."
      ),
    metadata: z
      .record(z.unknown())
      .optional()
      .describe("Optional additional metadata about the relationship"),
    allowSelfRelation: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Allow self-referential relationships (entity related to itself). Default: false"
      ),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    {
      campaignId,
      fromEntityId,
      toEntityId,
      relationshipType,
      strength,
      metadata,
      allowSelfRelation,
      jwt,
    },
    context?: any
  ): Promise<ToolResult> => {
    const toolCallId = crypto.randomUUID();

    try {
      const env = getEnvFromContext(context);
      if (!env) {
        // Fallback to API call
        const response = await authenticatedFetch(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.RELATIONSHIPS(
              campaignId,
              fromEntityId
            )
          ),
          {
            method: "POST",
            jwt,
            body: JSON.stringify({
              targetEntityId: toEntityId,
              relationshipType,
              strength,
              metadata,
              allowSelfRelation,
            }),
          }
        );

        if (!response.ok) {
          const authError = handleAuthError(response);
          if (authError) {
            return createToolError(
              authError,
              "Authentication failed",
              response.status,
              toolCallId
            );
          }

          const errorData = (await response.json()) as {
            error?: string;
            message?: string;
          };
          return createToolError(
            errorData.error || "Failed to create relationship",
            errorData.message || "Unknown error",
            response.status,
            toolCallId
          );
        }

        const data = (await response.json()) as {
          relationships?: unknown[];
        };
        return createToolSuccess(
          "Relationship created successfully",
          data,
          toolCallId
        );
      }

      // Direct database access
      const userId = extractUsernameFromJwt(jwt);
      if (!userId) {
        return createToolError(
          "Invalid authentication token",
          "Authentication failed",
          401,
          toolCallId
        );
      }

      // Get DAO factory and services
      const daoFactory = getDAOFactory(env);

      // Verify campaign ownership using DAO
      const campaign = await daoFactory.campaignDAO.getCampaignByIdWithMapping(
        campaignId,
        userId
      );

      if (!campaign) {
        return createToolError(
          "Campaign not found",
          "Campaign not found or access denied",
          404,
          toolCallId
        );
      }

      // Initialize graph service
      const graphService = new EntityGraphService(daoFactory.entityDAO);

      // Check entities exist
      const fromEntity = await daoFactory.entityDAO.getEntityById(fromEntityId);
      const toEntity = await daoFactory.entityDAO.getEntityById(toEntityId);

      if (!fromEntity) {
        return createToolError(
          "Source entity not found",
          `Entity with ID ${fromEntityId} does not exist`,
          404,
          toolCallId
        );
      }

      if (!toEntity) {
        return createToolError(
          "Target entity not found",
          `Entity with ID ${toEntityId} does not exist`,
          404,
          toolCallId
        );
      }

      if (fromEntity.campaignId !== campaignId) {
        return createToolError(
          "Source entity belongs to different campaign",
          "Entity campaign mismatch",
          400,
          toolCallId
        );
      }

      if (toEntity.campaignId !== campaignId) {
        return createToolError(
          "Target entity belongs to different campaign",
          "Entity campaign mismatch",
          400,
          toolCallId
        );
      }

      // Create relationship
      const relationships = await graphService.upsertEdge({
        campaignId,
        fromEntityId,
        toEntityId,
        relationshipType,
        strength,
        metadata,
        allowSelfRelation: allowSelfRelation ?? false,
      });

      return createToolSuccess(
        `Created ${relationships.length} relationship(s) between entities`,
        {
          relationships,
          fromEntity: {
            id: fromEntity.id,
            name: fromEntity.name,
            entityType: fromEntity.entityType,
          },
          toEntity: {
            id: toEntity.id,
            name: toEntity.name,
            entityType: toEntity.entityType,
          },
        },
        toolCallId
      );
    } catch (error) {
      console.error("[createEntityRelationshipTool] Error:", error);
      return createToolError(
        "Failed to create relationship",
        error instanceof Error ? error.message : "Unknown error",
        500,
        toolCallId
      );
    }
  },
});

/**
 * Tool: Update entity metadata directly
 * Updates entity metadata in the database (not just changelog).
 * Use this when users suggest updates to entity properties like faction alignment
 * (protagonistic/neutral/antagonistic), status, or other metadata.
 */
export const updateEntityMetadataTool = tool({
  description:
    "Update metadata for EXISTING entities (e.g., faction alignment: protagonistic/neutral/antagonistic). REQUIRED: metadata must be an object (e.g., {alignment: 'protagonistic'}). entityId must be a real database ID from searchCampaignContext/listAllEntities, not a name or placeholder. Do NOT use for: consolidation (use searchCampaignContext), creating entities (use recordWorldEventTool with newEntities), or entity information provision (use recordWorldEventTool). Search first if unsure entity exists.",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    entityId: z
      .string()
      .describe(
        "The ID of the entity to update. Must be a real entity ID from the database, not a placeholder."
      ),
    metadata: z
      .record(z.unknown())
      .describe(
        "REQUIRED: Metadata to update. This will be merged with existing metadata. Must be an object (e.g., {alignment: 'protagonistic'|'neutral'|'antagonistic'}). For faction alignment, use {alignment: 'protagonistic'|'neutral'|'antagonistic'}."
      ),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { campaignId, entityId, metadata, jwt },
    context?: any
  ): Promise<ToolResult> => {
    const toolCallId = crypto.randomUUID();

    try {
      const env = getEnvFromContext(context);
      if (!env) {
        // Fallback to API call
        const response = await authenticatedFetch(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.UPDATE_SHARD(
              campaignId,
              entityId
            )
          ),
          {
            method: "PUT",
            jwt,
            body: JSON.stringify({ metadata }),
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          const authError = handleAuthError(response);
          if (authError) {
            return createToolError(
              authError,
              "Authentication failed",
              response.status,
              toolCallId
            );
          }

          const errorData = (await response.json()) as {
            error?: string;
            message?: string;
          };
          return createToolError(
            errorData.error || "Failed to update entity metadata",
            errorData.message || "Unknown error",
            response.status,
            toolCallId
          );
        }

        const data = (await response.json()) as {
          shard?: { id: string; metadata: unknown };
        };
        return createToolSuccess(
          "Entity metadata updated successfully",
          data,
          toolCallId
        );
      }

      // Direct database access
      const userId = extractUsernameFromJwt(jwt);
      if (!userId) {
        return createToolError(
          "Invalid authentication token",
          "Authentication failed",
          401,
          toolCallId
        );
      }

      // Get DAO factory
      const daoFactory = getDAOFactory(env);

      // Verify campaign ownership
      const campaign = await daoFactory.campaignDAO.getCampaignByIdWithMapping(
        campaignId,
        userId
      );

      if (!campaign) {
        return createToolError(
          "Campaign not found",
          "Campaign not found or access denied",
          404,
          toolCallId
        );
      }

      // Get existing entity
      const entity = await daoFactory.entityDAO.getEntityById(entityId);

      if (!entity) {
        return createToolError(
          "Entity not found",
          `Entity with ID ${entityId} does not exist`,
          404,
          toolCallId
        );
      }

      if (entity.campaignId !== campaignId) {
        return createToolError(
          "Entity belongs to different campaign",
          "Entity campaign mismatch",
          400,
          toolCallId
        );
      }

      // Merge metadata with existing metadata
      const existingMetadata =
        (entity.metadata as Record<string, unknown>) || {};
      const updatedMetadata = { ...existingMetadata, ...metadata };

      // Update entity metadata
      await daoFactory.entityDAO.updateEntity(entityId, {
        metadata: updatedMetadata,
      });

      // Get updated entity
      const updatedEntity = await daoFactory.entityDAO.getEntityById(entityId);

      return createToolSuccess(
        `Entity metadata updated successfully for ${entity.name || entityId}`,
        {
          entity: {
            id: updatedEntity?.id,
            name: updatedEntity?.name,
            metadata: updatedEntity?.metadata,
          },
        },
        toolCallId
      );
    } catch (error) {
      console.error("[updateEntityMetadataTool] Error:", error);
      return createToolError(
        "Failed to update entity metadata",
        error instanceof Error ? error.message : "Unknown error",
        500,
        toolCallId
      );
    }
  },
});

/**
 * Tool: Update entity type
 * Updates an entity's type in the database (e.g., from "pcs" to "npcs" or vice versa).
 * Use this when users correct an entity's type classification.
 */
export const updateEntityTypeTool = tool({
  description:
    "Update an entity's type classification in the database. Use this when users correct an entity's type (e.g., '[entity name] is an NPC' means change entity type from 'pcs' to 'npcs', or 'this is a player character' means change from 'npcs' to 'pcs'). This is a structural change that affects how the entity is categorized and retrieved. The tool automatically updates ALL entities with the same name to ensure consistency and prevent duplicates with different types. Available entity types: " +
    STRUCTURED_ENTITY_TYPES.join(", ") +
    ". Most common corrections: changing between 'pcs' (player characters) and 'npcs' (non-player characters).",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    entityId: z
      .string()
      .describe("The ID of the entity whose type should be updated."),
    entityType: z
      .enum([...STRUCTURED_ENTITY_TYPES] as [string, ...string[]])
      .describe(
        `The new entity type. Must be one of: ${STRUCTURED_ENTITY_TYPES.join(", ")}. Common types: "pcs" (player characters), "npcs" (non-player characters), "locations", "factions", "monsters", "items".`
      ),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { campaignId, entityId, entityType, jwt },
    context?: any
  ): Promise<ToolResult> => {
    const toolCallId = crypto.randomUUID();

    try {
      const env = getEnvFromContext(context);
      if (!env) {
        // Fallback to API call - but we need to check if there's an endpoint for this
        // For now, we'll use direct database access only
        return createToolError(
          "Environment not available",
          "Direct database access required for entity type updates",
          500,
          toolCallId
        );
      }

      // Direct database access
      const userId = extractUsernameFromJwt(jwt);
      if (!userId) {
        return createToolError(
          "Invalid authentication token",
          "Authentication failed",
          401,
          toolCallId
        );
      }

      // Get DAO factory
      const daoFactory = getDAOFactory(env);

      // Verify campaign ownership
      const campaign = await daoFactory.campaignDAO.getCampaignByIdWithMapping(
        campaignId,
        userId
      );

      if (!campaign) {
        return createToolError(
          "Campaign not found",
          "Campaign not found or access denied",
          404,
          toolCallId
        );
      }

      // Verify entity exists and belongs to campaign
      const entity = await daoFactory.entityDAO.getEntityById(entityId);
      if (!entity) {
        return createToolError(
          "Entity not found",
          `Entity with ID ${entityId} not found`,
          404,
          toolCallId
        );
      }

      if (entity.campaignId !== campaignId) {
        return createToolError(
          "Entity does not belong to campaign",
          "Entity belongs to a different campaign",
          403,
          toolCallId
        );
      }

      // Update this entity's type
      await daoFactory.entityDAO.updateEntity(entityId, {
        entityType,
      });

      // Also update ALL other entities with the same name in this campaign
      // This ensures consistency when there are duplicates
      const allEntitiesWithSameName =
        await daoFactory.entityDAO.listEntitiesByCampaign(campaignId, {
          limit: 1000, // Large limit to catch all duplicates
        });

      const duplicates = allEntitiesWithSameName.filter(
        (e) => e.name === entity.name && e.id !== entityId
      );

      const updatedDuplicates: string[] = [];
      for (const duplicate of duplicates) {
        if (duplicate.entityType !== entityType) {
          await daoFactory.entityDAO.updateEntity(duplicate.id, {
            entityType,
          });
          updatedDuplicates.push(duplicate.id);
        }
      }

      const message =
        updatedDuplicates.length > 0
          ? `Entity type updated successfully from "${entity.entityType}" to "${entityType}". Also updated ${updatedDuplicates.length} duplicate entity/entities with the same name ("${entity.name}") to ensure consistency.`
          : `Entity type updated successfully from "${entity.entityType}" to "${entityType}"`;

      return createToolSuccess(
        message,
        {
          entityId,
          oldType: entity.entityType,
          newType: entityType,
          updatedDuplicates: updatedDuplicates.length,
        },
        toolCallId
      );
    } catch (error) {
      console.error("[updateEntityTypeTool] Error:", error);
      return createToolError(
        "Failed to update entity type",
        error instanceof Error ? error.message : "Unknown error",
        500,
        toolCallId
      );
    }
  },
});

/**
 * Tool: Delete entity
 * Deletes an entity from the database. Use this when users explicitly request to delete duplicate entities or remove entities they no longer need.
 */
export const deleteEntityTool = tool({
  description:
    "Delete an entity from the database. Use this when users explicitly request to delete duplicate entities or remove entities they no longer need. This permanently removes the entity and all its relationships. Only use this when the user explicitly asks to delete an entity.",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    entityId: z.string().describe("The ID of the entity to delete."),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { campaignId, entityId, jwt },
    context?: any
  ): Promise<ToolResult> => {
    const toolCallId = crypto.randomUUID();

    try {
      const env = getEnvFromContext(context);
      if (!env) {
        return createToolError(
          "Environment not available",
          "Direct database access required for entity deletion",
          500,
          toolCallId
        );
      }

      // Direct database access
      const userId = extractUsernameFromJwt(jwt);
      if (!userId) {
        return createToolError(
          "Invalid authentication token",
          "Authentication failed",
          401,
          toolCallId
        );
      }

      // Get DAO factory
      const daoFactory = getDAOFactory(env);

      // Verify campaign ownership
      const campaign = await daoFactory.campaignDAO.getCampaignByIdWithMapping(
        campaignId,
        userId
      );

      if (!campaign) {
        return createToolError(
          "Campaign not found",
          "Campaign not found or access denied",
          404,
          toolCallId
        );
      }

      // Verify entity exists and belongs to campaign
      const entity = await daoFactory.entityDAO.getEntityById(entityId);
      if (!entity) {
        return createToolError(
          "Entity not found",
          `Entity with ID ${entityId} not found`,
          404,
          toolCallId
        );
      }

      if (entity.campaignId !== campaignId) {
        return createToolError(
          "Entity does not belong to campaign",
          "Entity belongs to a different campaign",
          403,
          toolCallId
        );
      }

      // Delete entity (this also deletes relationships)
      await daoFactory.entityDAO.deleteEntity(entityId);

      // Also delete from vector index if it has an embedding
      if (entity.embeddingId) {
        try {
          const embeddingService = new EntityEmbeddingService(env.VECTORIZE);
          await embeddingService.deleteEmbedding(entityId);
        } catch (error) {
          console.warn(
            `[deleteEntityTool] Failed to delete embedding for ${entityId}:`,
            error
          );
          // Continue - entity is already deleted from DB
        }
      }

      return createToolSuccess(
        `Entity "${entity.name}" (${entityId}) deleted successfully`,
        {
          entityId,
          entityName: entity.name,
        },
        toolCallId
      );
    } catch (error) {
      console.error("[deleteEntityTool] Error:", error);
      return createToolError(
        "Failed to delete entity",
        error instanceof Error ? error.message : "Unknown error",
        500,
        toolCallId
      );
    }
  },
});

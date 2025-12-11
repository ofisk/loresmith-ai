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

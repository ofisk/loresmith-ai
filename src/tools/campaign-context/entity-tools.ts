import { tool } from "ai";
import { z } from "zod";
import type { ToolResult } from "@/app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import { STRUCTURED_ENTITY_TYPES } from "@/lib/entity-types";
import { RELATIONSHIP_TYPES } from "@/lib/relationship-types";
import { authenticatedFetch, handleAuthError } from "@/lib/tool-auth";
import { EntityExtractionPipeline } from "@/services/rag/entity-extraction-pipeline";
import { EntityExtractionService } from "@/services/rag/entity-extraction-service";
import { EntityEmbeddingService } from "@/services/vectorize/entity-embedding-service";
import { API_CONFIG } from "@/shared-config";
import {
	commonSchemas,
	createToolError,
	createToolSuccess,
	extractUsernameFromJwt,
	getEnvFromContext,
	requireGMRole,
	type ToolExecuteOptions,
} from "../utils";

const extractEntitiesFromContentSchema = z.object({
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
		.record(z.string(), z.unknown())
		.optional()
		.describe("Optional additional metadata to attach to extracted entities"),
	jwt: commonSchemas.jwt,
});

export const extractEntitiesFromContentTool = tool({
	description:
		"Extract structured entities (NPCs, locations, items, monsters, etc.) from text content " +
		"and add them to the campaign's entity graph. Use this when the user provides text content " +
		"(from uploaded files or chat messages) that contains information about entities like characters, " +
		"locations, items, or other game content. The tool will automatically identify and extract " +
		"entities and their relationships from the text.",
	inputSchema: extractEntitiesFromContentSchema,
	execute: async (
		input: z.infer<typeof extractEntitiesFromContentSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const {
			campaignId,
			content,
			sourceName,
			sourceId,
			sourceType,
			metadata,
			jwt,
		} = input;
		const toolCallId = options?.toolCallId ?? "unknown";

		try {
			const env = getEnvFromContext(options);
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

			const daoFactory = getDAOFactory(env);

			// Verify campaign access and GM role
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

			const gmError = await requireGMRole(env, campaignId, userId, toolCallId);
			if (gmError) return gmError;

			// Initialize services
			const extractionService = new EntityExtractionService(null, null);
			const embeddingService = new EntityEmbeddingService(
				env.VECTORIZE as
					| import("@cloudflare/workers-types").VectorizeIndex
					| undefined
			);
			const graphService = daoFactory.entityGraphService;
			const pipeline = new EntityExtractionPipeline(
				daoFactory.entityDAO,
				extractionService,
				embeddingService,
				graphService,
				env,
				undefined
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

const createEntityRelationshipSchema = z.object({
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
		.record(z.string(), z.unknown())
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
});

export const createEntityRelationshipTool = tool({
	description:
		"Create a relationship between two entities in the campaign's entity graph. " +
		"Use this when the user mentions a relationship between entities (e.g., 'NPC X lives in Location Y', " +
		"'Character A is allied with Character B', 'Item belongs to NPC'). " +
		"The entities must already exist in the graph (create them first using extractEntitiesFromContentTool if needed).",
	inputSchema: createEntityRelationshipSchema,
	execute: async (
		input: z.infer<typeof createEntityRelationshipSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const {
			campaignId,
			fromEntityId,
			toEntityId,
			relationshipType,
			strength,
			metadata,
			allowSelfRelation,
			jwt,
		} = input;
		const toolCallId = options?.toolCallId ?? "unknown";

		try {
			const env = getEnvFromContext(options);
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

			const daoFactory = getDAOFactory(env);

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

			const gmError = await requireGMRole(env, campaignId, userId, toolCallId);
			if (gmError) return gmError;

			// Initialize graph service
			const graphService = daoFactory.entityGraphService;

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

const linkInspirationToEntitySchema = z.object({
	campaignId: commonSchemas.campaignId,
	entityId: z
		.string()
		.describe("The campaign entity ID that should be linked to inspiration"),
	resourceId: z
		.string()
		.describe("The campaign resource ID for the uploaded inspiration image"),
	relationshipType: z
		.enum(RELATIONSHIP_TYPES as unknown as [string, ...string[]])
		.optional()
		.default("references")
		.describe(
			"Relationship type to use for the entity -> inspiration link (default: references)"
		),
	note: z
		.string()
		.optional()
		.describe("Optional note about how this inspiration influences the entity"),
	jwt: commonSchemas.jwt,
});

export const linkInspirationToEntityTool = tool({
	description:
		"Link a visual inspiration campaign resource to an entity by creating a graph relationship through an inspiration node.",
	inputSchema: linkInspirationToEntitySchema,
	execute: async (
		input: z.infer<typeof linkInspirationToEntitySchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { campaignId, entityId, resourceId, relationshipType, note, jwt } =
			input;
		const toolCallId = options?.toolCallId ?? "unknown";

		try {
			const env = getEnvFromContext(options);
			if (!env) {
				return createToolError(
					"Environment not available",
					"Direct database access is required to link inspiration resources.",
					500,
					toolCallId
				);
			}

			const userId = extractUsernameFromJwt(jwt);
			if (!userId) {
				return createToolError(
					"Invalid authentication token",
					"Authentication failed",
					401,
					toolCallId
				);
			}

			const daoFactory = getDAOFactory(env);
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

			const gmError = await requireGMRole(env, campaignId, userId, toolCallId);
			if (gmError) return gmError;

			const targetEntity = await daoFactory.entityDAO.getEntityById(entityId);
			if (!targetEntity || targetEntity.campaignId !== campaignId) {
				return createToolError(
					"Entity not found",
					"Target entity was not found in this campaign.",
					404,
					toolCallId
				);
			}

			const resource = await daoFactory.campaignDAO.getCampaignResourceById(
				resourceId,
				campaignId
			);
			if (!resource) {
				return createToolError(
					"Resource not found",
					"Inspiration resource was not found in this campaign.",
					404,
					toolCallId
				);
			}

			const inspirationEntityName = `Inspiration: ${resource.display_name || resource.file_name}`;
			const existingCandidates = await daoFactory.entityDAO.findEntitiesByName(
				campaignId,
				inspirationEntityName
			);

			let inspirationEntity = existingCandidates.find((candidate) => {
				const metadata =
					(candidate.metadata as Record<string, unknown> | null) ?? {};
				return metadata.inspirationResourceId === resource.id;
			});

			if (!inspirationEntity) {
				const inspirationEntityId = crypto.randomUUID();
				await daoFactory.entityDAO.createEntity({
					id: inspirationEntityId,
					campaignId,
					entityType: "handouts",
					name: inspirationEntityName,
					content: {
						fileKey: resource.file_key,
						fileName: resource.display_name || resource.file_name,
					},
					metadata: {
						kind: "visual_inspiration",
						inspirationResourceId: resource.id,
						fileKey: resource.file_key,
						fileName: resource.display_name || resource.file_name,
					},
					confidence: 1,
					sourceType: "campaign_resource",
					sourceId: resource.id,
				});

				const createdInspirationEntity =
					await daoFactory.entityDAO.getEntityById(inspirationEntityId);
				if (createdInspirationEntity) {
					inspirationEntity = createdInspirationEntity;
				}
			}

			if (!inspirationEntity) {
				return createToolError(
					"Failed to create inspiration entity",
					"Could not create or retrieve inspiration node.",
					500,
					toolCallId
				);
			}

			const relationships = await daoFactory.entityGraphService.upsertEdge({
				campaignId,
				fromEntityId: entityId,
				toEntityId: inspirationEntity.id,
				relationshipType,
				strength: 0.8,
				metadata: {
					note: note ?? "",
					source: "inspiration_link_tool",
					resourceId: resource.id,
					fileKey: resource.file_key,
				},
				allowSelfRelation: false,
			});

			return createToolSuccess(
				`Linked "${targetEntity.name}" to inspiration resource "${resource.display_name || resource.file_name}".`,
				{
					entity: {
						id: targetEntity.id,
						name: targetEntity.name,
					},
					inspirationEntity: {
						id: inspirationEntity.id,
						name: inspirationEntity.name,
					},
					resource: {
						id: resource.id,
						fileKey: resource.file_key,
						fileName: resource.display_name || resource.file_name,
					},
					relationships,
				},
				toolCallId
			);
		} catch (error) {
			console.error("[linkInspirationToEntityTool] Error:", error);
			return createToolError(
				"Failed to link inspiration to entity",
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
const updateEntityMetadataSchema = z.object({
	campaignId: commonSchemas.campaignId,
	entityId: z
		.string()
		.describe(
			"The ID of the entity to update. Must be a real entity ID from the database, not a placeholder."
		),
	metadata: z
		.record(z.string(), z.unknown())
		.describe(
			"REQUIRED: Metadata to update. This will be merged with existing metadata. Must be an object (e.g., {alignment: 'protagonistic'|'neutral'|'antagonistic'}). For faction alignment, use {alignment: 'protagonistic'|'neutral'|'antagonistic'}."
		),
	jwt: commonSchemas.jwt,
});

export const updateEntityMetadataTool = tool({
	description:
		"Update metadata for EXISTING entities (e.g., faction alignment: protagonistic/neutral/antagonistic). REQUIRED: metadata must be an object (e.g., {alignment: 'protagonistic'}). entityId must be a real database ID from searchCampaignContext/listAllEntities, not a name or placeholder. Do NOT use for: consolidation (use searchCampaignContext), creating entities (use recordWorldEventTool with newEntities), or entity information provision (use recordWorldEventTool). Search first if unsure entity exists.",
	inputSchema: updateEntityMetadataSchema,
	execute: async (
		input: z.infer<typeof updateEntityMetadataSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { campaignId, entityId, metadata, jwt } = input;
		const toolCallId = options?.toolCallId ?? "unknown";

		try {
			const env = getEnvFromContext(options);
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

			const daoFactory = getDAOFactory(env);

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

			const gmError = await requireGMRole(env, campaignId, userId, toolCallId);
			if (gmError) return gmError;

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
const updateEntityTypeSchema = z.object({
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
});

export const updateEntityTypeTool = tool({
	description:
		"Update an entity's type classification in the database. Use this when users correct an entity's type (e.g., '[entity name] is an NPC' means change entity type from 'pcs' to 'npcs', or 'this is a player character' means change from 'npcs' to 'pcs'). This is a structural change that affects how the entity is categorized and retrieved. The tool automatically updates ALL entities with the same name to ensure consistency and prevent duplicates with different types. Available entity types: " +
		STRUCTURED_ENTITY_TYPES.join(", ") +
		". Most common corrections: changing between 'pcs' (player characters) and 'npcs' (non-player characters).",
	inputSchema: updateEntityTypeSchema,
	execute: async (
		input: z.infer<typeof updateEntityTypeSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { campaignId, entityId, entityType, jwt } = input;
		const toolCallId = options?.toolCallId ?? "unknown";

		try {
			const env = getEnvFromContext(options);
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

			const userId = extractUsernameFromJwt(jwt);
			if (!userId) {
				return createToolError(
					"Invalid authentication token",
					"Authentication failed",
					401,
					toolCallId
				);
			}

			const daoFactory = getDAOFactory(env);

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

			const gmError = await requireGMRole(env, campaignId, userId, toolCallId);
			if (gmError) return gmError;

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
			const duplicates = (
				await daoFactory.entityDAO.findEntitiesByName(campaignId, entity.name)
			).filter((e) => e.id !== entityId);

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
const deleteEntitySchema = z.object({
	campaignId: commonSchemas.campaignId,
	entityId: z.string().describe("The ID of the entity to delete."),
	jwt: commonSchemas.jwt,
});

export const deleteEntityTool = tool({
	description:
		"Delete an entity from the database. Use this when users explicitly request to delete duplicate entities or remove entities they no longer need. This permanently removes the entity and all its relationships. Only use this when the user explicitly asks to delete an entity.",
	inputSchema: deleteEntitySchema,
	execute: async (
		input: z.infer<typeof deleteEntitySchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { campaignId, entityId, jwt } = input;
		const toolCallId = options?.toolCallId ?? "unknown";

		try {
			const env = getEnvFromContext(options);
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

			const daoFactory = getDAOFactory(env);

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

			const gmError = await requireGMRole(env, campaignId, userId, toolCallId);
			if (gmError) return gmError;

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
					const embeddingService = new EntityEmbeddingService(
						env.VECTORIZE as
							| import("@cloudflare/workers-types").VectorizeIndex
							| undefined
					);
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

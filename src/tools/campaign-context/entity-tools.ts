import { tool } from "ai";
import { z } from "zod";
import type { ToolResult } from "@/app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import { STRUCTURED_ENTITY_TYPES } from "@/lib/entity/entity-types";
import { RELATIONSHIP_TYPES } from "@/lib/entity/relationship-types";
import { authenticatedFetch, handleAuthError } from "@/lib/tool-auth";
import {
	type CampaignRule,
	RulesContextService,
} from "@/services/campaign/rules-context-service";
import { EntityEmbeddingService } from "@/services/vectorize/entity-embedding-service";
import { API_CONFIG } from "@/shared-config";
import {
	commonSchemas,
	createToolError,
	createToolSuccess,
	getEnvFromContext,
	requireCampaignAccessForTool,
	requireGMRole,
	type ToolExecuteOptions,
} from "@/tools/utils";
import { withRulesContext } from "./rules-tools-helper";

const HOUSE_RULE_CATEGORIES = [
	"healing",
	"death_dying",
	"spellcasting",
	"exploration",
	"social",
	"combat",
	"custom",
] as const;

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
		"The entities must already exist in the graph (add library resources to the campaign so entities are copied from indexed files, or use graph/RAG tools that create entities).",
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

			const campaignAccess = await requireCampaignAccessForTool({
				env,
				campaignId,
				jwt,
				toolCallId,
			});
			if ("toolCallId" in campaignAccess) {
				return campaignAccess;
			}
			const { userId } = campaignAccess;

			const daoFactory = getDAOFactory(env);

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
			return createToolError(
				"Failed to create relationship",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});

const defineHouseRuleSchema = z.object({
	campaignId: commonSchemas.campaignId,
	name: z.string().min(1).describe("Short name for this house rule"),
	text: z
		.string()
		.min(1)
		.describe("The full house rule text that should be enforced"),
	category: z
		.enum(HOUSE_RULE_CATEGORIES)
		.optional()
		.default("custom")
		.describe("Rule category"),
	sourceRule: z
		.string()
		.optional()
		.describe("Optional source rule this house rule modifies"),
	effectiveDate: z
		.string()
		.optional()
		.describe("Optional effective date (ISO date string)"),
	tags: z.array(z.string()).optional().default([]).describe("Optional tags"),
	jwt: commonSchemas.jwt,
});

export const defineHouseRuleTool = tool({
	description:
		"Define a new house rule for the campaign and store it as a house_rule entity.",
	inputSchema: defineHouseRuleSchema,
	execute: async (
		input: z.infer<typeof defineHouseRuleSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const {
			campaignId,
			name,
			text,
			category,
			sourceRule,
			effectiveDate,
			tags,
			jwt,
		} = input;
		const toolCallId = options?.toolCallId ?? "unknown";

		try {
			const env = getEnvFromContext(options);
			if (!env) {
				return createToolError(
					"Environment not available",
					"Direct database access is required for house rule creation.",
					500,
					toolCallId
				);
			}

			const campaignAccess = await requireCampaignAccessForTool({
				env,
				campaignId,
				jwt,
				toolCallId,
			});
			if ("toolCallId" in campaignAccess) {
				return campaignAccess;
			}
			const { userId } = campaignAccess;

			const daoFactory = getDAOFactory(env);

			const gmError = await requireGMRole(env, campaignId, userId, toolCallId);
			if (gmError) return gmError;

			const ruleId = crypto.randomUUID();
			await daoFactory.entityDAO.createEntity({
				id: ruleId,
				campaignId,
				entityType: "house_rule",
				name,
				content: {
					type: "house_rule",
					name,
					text,
					summary: text,
					modifies: sourceRule ?? "",
					effective_date: effectiveDate ?? "",
				},
				metadata: {
					kind: "house_rule",
					category,
					sourceRule: sourceRule ?? "",
					effectiveDate: effectiveDate ?? "",
					active: true,
					tags,
				},
				confidence: 1,
				sourceType: "user_input",
				sourceId: userId,
			});

			const resolved = await RulesContextService.getResolvedRulesContext(
				env,
				campaignId
			);
			const createdRule = {
				id: ruleId,
				entityId: ruleId,
				entityType: "house_rule",
				name,
				category,
				text,
				source: "house",
				priority: 100,
				active: true,
				updatedAt: new Date().toISOString(),
				metadata: {
					category,
					active: true,
				},
			} satisfies CampaignRule;
			const reResolved = RulesContextService.resolveRules([
				...resolved.rules,
				createdRule,
			]);
			const conflicts = reResolved.conflicts.filter(
				(c) => c.leftRuleId === ruleId || c.rightRuleId === ruleId
			);

			return createToolSuccess(
				`House rule "${name}" created successfully.`,
				{
					rule: {
						id: ruleId,
						name,
						text,
						category,
						sourceRule: sourceRule ?? "",
						effectiveDate: effectiveDate ?? "",
						active: true,
						tags,
					},
					conflicts,
					warnings: reResolved.warnings,
				},
				toolCallId
			);
		} catch (error) {
			return createToolError(
				"Failed to define house rule",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});

const listHouseRulesSchema = z.object({
	campaignId: commonSchemas.campaignId,
	category: z
		.enum(HOUSE_RULE_CATEGORIES)
		.optional()
		.describe("Optional rule category filter"),
	includeInactive: z
		.boolean()
		.optional()
		.default(false)
		.describe("Include inactive house rules when true"),
	jwt: commonSchemas.jwt,
});

export const listHouseRulesTool = tool({
	description:
		"List house rules and other active campaign rules with optional category filtering.",
	inputSchema: listHouseRulesSchema,
	execute: async (
		input: z.infer<typeof listHouseRulesSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { campaignId, category, includeInactive, jwt } = input;
		const toolCallId = options?.toolCallId ?? "unknown";

		try {
			const env = getEnvFromContext(options);
			if (!env) {
				return createToolError(
					"Environment not available",
					"Direct database access is required to list rules.",
					500,
					toolCallId
				);
			}

			const campaignAccess = await requireCampaignAccessForTool({
				env,
				campaignId,
				jwt,
				toolCallId,
			});
			if ("toolCallId" in campaignAccess) {
				return campaignAccess;
			}

			const resolved = await RulesContextService.getResolvedRulesContext(
				env,
				campaignId
			);
			const filtered = resolved.rules.filter((rule) => {
				if (!includeInactive && !rule.active) return false;
				if (category && rule.category !== category) return false;
				return true;
			});

			return createToolSuccess(
				`Found ${filtered.length} campaign rule(s).`,
				{
					rules: filtered.map((rule) => ({
						id: rule.id,
						name: rule.name,
						text: rule.text,
						category: rule.category,
						source: rule.source,
						entityType: rule.entityType,
						active: rule.active,
						updatedAt: rule.updatedAt,
					})),
					conflicts: resolved.conflicts,
					warnings: resolved.warnings,
					count: filtered.length,
				},
				toolCallId
			);
		} catch (error) {
			return createToolError(
				"Failed to list house rules",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});

const updateHouseRuleSchema = z.object({
	campaignId: commonSchemas.campaignId,
	ruleId: z.string().describe("The ID of the house rule entity to update"),
	name: z.string().optional().describe("Updated house rule name"),
	text: z.string().optional().describe("Updated house rule text"),
	category: z
		.enum(HOUSE_RULE_CATEGORIES)
		.optional()
		.describe("Updated rule category"),
	sourceRule: z
		.string()
		.optional()
		.describe("Updated source rule this modifies"),
	effectiveDate: z.string().optional().describe("Updated effective date"),
	active: z
		.boolean()
		.optional()
		.describe("Set to false to deactivate the rule"),
	tags: z.array(z.string()).optional().describe("Updated tags"),
	jwt: commonSchemas.jwt,
});

export const updateHouseRuleTool = tool({
	description:
		"Update or deactivate an existing house rule entity in a campaign.",
	inputSchema: updateHouseRuleSchema,
	execute: async (
		input: z.infer<typeof updateHouseRuleSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const {
			campaignId,
			ruleId,
			name,
			text,
			category,
			sourceRule,
			effectiveDate,
			active,
			tags,
			jwt,
		} = input;
		const toolCallId = options?.toolCallId ?? "unknown";

		try {
			const env = getEnvFromContext(options);
			if (!env) {
				return createToolError(
					"Environment not available",
					"Direct database access is required for house rule updates.",
					500,
					toolCallId
				);
			}

			const campaignAccess = await requireCampaignAccessForTool({
				env,
				campaignId,
				jwt,
				toolCallId,
			});
			if ("toolCallId" in campaignAccess) {
				return campaignAccess;
			}
			const { userId } = campaignAccess;

			const daoFactory = getDAOFactory(env);

			const gmError = await requireGMRole(env, campaignId, userId, toolCallId);
			if (gmError) return gmError;

			const entity = await daoFactory.entityDAO.getEntityById(ruleId);
			if (!entity || entity.campaignId !== campaignId) {
				return createToolError(
					"House rule not found",
					"Rule entity was not found in this campaign.",
					404,
					toolCallId
				);
			}
			if (entity.entityType !== "house_rule") {
				return createToolError(
					"Invalid rule type",
					"ruleId must point to a house_rule entity.",
					400,
					toolCallId
				);
			}

			const existingContent =
				entity.content &&
				typeof entity.content === "object" &&
				!Array.isArray(entity.content)
					? (entity.content as Record<string, unknown>)
					: {};
			const existingMetadata =
				entity.metadata &&
				typeof entity.metadata === "object" &&
				!Array.isArray(entity.metadata)
					? (entity.metadata as Record<string, unknown>)
					: {};

			const nextContent = {
				...existingContent,
				...(name !== undefined ? { name } : {}),
				...(text !== undefined ? { text, summary: text } : {}),
				...(sourceRule !== undefined ? { modifies: sourceRule } : {}),
				...(effectiveDate !== undefined
					? { effective_date: effectiveDate }
					: {}),
			};
			const nextMetadata = {
				...existingMetadata,
				...(category !== undefined ? { category } : {}),
				...(sourceRule !== undefined ? { sourceRule } : {}),
				...(effectiveDate !== undefined ? { effectiveDate } : {}),
				...(active !== undefined ? { active } : {}),
				...(tags !== undefined ? { tags } : {}),
			};

			await daoFactory.entityDAO.updateEntity(ruleId, {
				name: name ?? entity.name,
				content: nextContent,
				metadata: nextMetadata,
			});

			const resolved = await RulesContextService.getResolvedRulesContext(
				env,
				campaignId
			);
			const conflicts = resolved.conflicts.filter(
				(c) => c.leftRuleId === ruleId || c.rightRuleId === ruleId
			);

			return createToolSuccess(
				`House rule "${name ?? entity.name}" updated successfully.`,
				{
					ruleId,
					name: name ?? entity.name,
					active:
						active ?? (nextMetadata.active as boolean | undefined) ?? true,
					conflicts,
					warnings: resolved.warnings,
				},
				toolCallId
			);
		} catch (error) {
			return createToolError(
				"Failed to update house rule",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});

const checkHouseRuleConflictSchema = z.object({
	campaignId: commonSchemas.campaignId,
	candidateName: z.string().min(1).describe("Candidate rule name"),
	candidateText: z.string().min(1).describe("Candidate rule text to evaluate"),
	category: z
		.enum(HOUSE_RULE_CATEGORIES)
		.optional()
		.default("custom")
		.describe("Candidate rule category"),
	jwt: commonSchemas.jwt,
});

export const checkHouseRuleConflictTool = tool({
	description:
		"Check a proposed house rule for conflicts with current campaign rules.",
	inputSchema: checkHouseRuleConflictSchema,
	execute: async (
		input: z.infer<typeof checkHouseRuleConflictSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { campaignId, candidateName, candidateText, category, jwt } = input;
		const toolCallId = options?.toolCallId ?? "unknown";

		try {
			const env = getEnvFromContext(options);
			if (!env) {
				return createToolError(
					"Environment not available",
					"Direct database access is required for conflict checks.",
					500,
					toolCallId
				);
			}

			const campaignAccess = await requireCampaignAccessForTool({
				env,
				campaignId,
				jwt,
				toolCallId,
			});
			if ("toolCallId" in campaignAccess) {
				return campaignAccess;
			}
			const { userId } = campaignAccess;

			const gmError = await requireGMRole(env, campaignId, userId, toolCallId);
			if (gmError) return gmError;

			return withRulesContext(
				options,
				campaignId,
				toolCallId,
				async (resolved) => {
					const candidateId = `candidate-${crypto.randomUUID()}`;
					const candidateRule = {
						id: candidateId,
						entityId: candidateId,
						entityType: "house_rule",
						name: candidateName,
						category,
						text: candidateText,
						source: "house",
						priority: 100,
						active: true,
						updatedAt: new Date().toISOString(),
						metadata: { category },
					} satisfies CampaignRule;

					const evaluation = RulesContextService.resolveRules([
						...resolved.rules,
						candidateRule,
					]);
					const conflicts = evaluation.conflicts.filter(
						(conflict) =>
							conflict.leftRuleId === candidateId ||
							conflict.rightRuleId === candidateId
					);

					const conflictingRuleIds = new Set<string>();
					for (const conflict of conflicts) {
						if (conflict.leftRuleId !== candidateId) {
							conflictingRuleIds.add(conflict.leftRuleId);
						}
						if (conflict.rightRuleId !== candidateId) {
							conflictingRuleIds.add(conflict.rightRuleId);
						}
					}
					const conflictingRules = resolved.rules.filter((rule) =>
						conflictingRuleIds.has(rule.id)
					);

					return createToolSuccess(
						conflicts.length > 0
							? `Detected ${conflicts.length} potential conflict(s) for this candidate rule.`
							: "No direct conflicts detected for this candidate rule.",
						{
							hasConflict: conflicts.length > 0,
							conflicts,
							conflictingRules: conflictingRules.map((rule) => ({
								id: rule.id,
								name: rule.name,
								category: rule.category,
								text: rule.text,
								source: rule.source,
							})),
							warnings: evaluation.warnings,
							needsManualReview: conflicts.length > 0,
						},
						toolCallId
					);
				}
			);
		} catch (error) {
			return createToolError(
				"Failed to check house rule conflict",
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

			const campaignAccess = await requireCampaignAccessForTool({
				env,
				campaignId,
				jwt,
				toolCallId,
			});
			if ("toolCallId" in campaignAccess) {
				return campaignAccess;
			}
			const { userId } = campaignAccess;

			const daoFactory = getDAOFactory(env);

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

			const campaignAccess = await requireCampaignAccessForTool({
				env,
				campaignId,
				jwt,
				toolCallId,
			});
			if ("toolCallId" in campaignAccess) {
				return campaignAccess;
			}
			const { userId } = campaignAccess;

			const daoFactory = getDAOFactory(env);

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

			const campaignAccess = await requireCampaignAccessForTool({
				env,
				campaignId,
				jwt,
				toolCallId,
			});
			if ("toolCallId" in campaignAccess) {
				return campaignAccess;
			}
			const { userId } = campaignAccess;

			const daoFactory = getDAOFactory(env);

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

			const campaignAccess = await requireCampaignAccessForTool({
				env,
				campaignId,
				jwt,
				toolCallId,
			});
			if ("toolCallId" in campaignAccess) {
				return campaignAccess;
			}
			const { userId } = campaignAccess;

			const daoFactory = getDAOFactory(env);

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
				} catch (_error) {
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
			return createToolError(
				"Failed to delete entity",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});

import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, AUTH_CODES, type ToolResult } from "@/app-constants";
import { PLAYER_ROLES } from "@/constants/campaign-roles";
import { getDAOFactory } from "@/dao/dao-factory";
import { ENTITY_TYPE_PCS } from "@/lib/entity/entity-type-constants";
import { getEnvVar } from "@/lib/env-utils";
import {
	getPcOnboardingGaps,
	markPcOnboardingComplete,
} from "@/lib/player-character-onboarding";
import { authenticatedFetch, handleAuthError } from "@/lib/tool-auth";
import type { Env } from "@/middleware/auth";
import { SemanticDuplicateDetectionService } from "@/services/vectorize/semantic-duplicate-detection-service";
import {
	commonSchemas,
	createToolError,
	createToolSuccess,
	extractUsernameFromJwt,
	getEnvFromContext,
	requireCampaignAccessForTool,
	requireGMRole,
	type ToolExecuteOptions,
} from "@/tools/utils";
import {
	generateCharacterWithAI,
	NEEDS_CLARIFICATION_MARKER,
} from "./ai-helpers";

type CharacterContentUpdates = {
	characterName?: string;
	characterClass?: string;
	characterLevel?: number;
	characterRace?: string;
	backstory?: string;
	personalityTraits?: string;
	goals?: string;
	relationships?: string[];
	metadata?: Record<string, unknown>;
};

async function assertPlayerCanEditClaimedEntity(
	env: Env,
	campaignId: string,
	userId: string,
	entityId: string,
	toolCallId: string
): Promise<ToolResult | null> {
	const daoFactory = getDAOFactory(env);
	const role = await daoFactory.campaignDAO.getCampaignRole(campaignId, userId);
	if (!role || !PLAYER_ROLES.has(role)) {
		return null;
	}

	const claim = await daoFactory.playerCharacterClaimDAO.getClaimForUser(
		campaignId,
		userId
	);
	if (!claim || claim.entityId !== entityId) {
		return createToolError(
			"You can only edit your own claimed player character",
			"Character edit not allowed",
			403,
			toolCallId
		);
	}

	return null;
}

async function applyCharacterUpdatesToEntity(
	env: Env,
	entityId: string,
	campaignId: string,
	updatesInput: CharacterContentUpdates
): Promise<
	| {
			id: string;
			entityType: string;
			characterName?: string;
			characterClass?: unknown;
			characterLevel?: unknown;
			characterRace?: unknown;
	  }
	| ToolResult
> {
	const daoFactory = getDAOFactory(env);
	const entity = await daoFactory.entityDAO.getEntityById(entityId);

	if (!entity) {
		return createToolError(
			"Entity not found",
			`No entity with ID ${entityId} found`,
			404,
			"unknown"
		);
	}
	if (entity.campaignId !== campaignId) {
		return createToolError(
			"Entity belongs to different campaign",
			"Campaign mismatch",
			400,
			"unknown"
		);
	}
	if (entity.entityType !== ENTITY_TYPE_PCS) {
		return createToolError(
			"Entity is not a player character",
			"Only player character (pcs) entities can be updated",
			400,
			"unknown"
		);
	}

	const {
		characterName,
		characterClass,
		characterLevel,
		characterRace,
		backstory,
		personalityTraits,
		goals,
		relationships,
		metadata,
	} = updatesInput;

	const existingContent =
		entity.content && typeof entity.content === "object"
			? (entity.content as Record<string, unknown>)
			: {};
	const updatedContent: Record<string, unknown> = {
		...existingContent,
		...(characterName !== undefined && { characterName }),
		...(characterClass !== undefined && { characterClass }),
		...(characterLevel !== undefined && { characterLevel }),
		...(characterRace !== undefined && { characterRace }),
		...(backstory !== undefined && { backstory }),
		...(personalityTraits !== undefined && { personalityTraits }),
		...(goals !== undefined && { goals }),
		...(relationships !== undefined && { relationships }),
	};
	const updates: {
		content: Record<string, unknown>;
		name?: string;
		metadata?: Record<string, unknown>;
	} = { content: updatedContent };
	if (characterName !== undefined) {
		updates.name = characterName;
	}
	if (metadata !== undefined && Object.keys(metadata).length > 0) {
		const existingMeta = (entity.metadata as Record<string, unknown>) || {};
		updates.metadata = { ...existingMeta, ...metadata };
	}

	await daoFactory.entityDAO.updateEntity(entityId, updates);
	const updatedEntity = await daoFactory.entityDAO.getEntityById(entityId);

	return {
		id: entityId,
		entityType: ENTITY_TYPE_PCS,
		characterName:
			updatedEntity?.name ??
			characterName ??
			(typeof existingContent.characterName === "string"
				? existingContent.characterName
				: undefined),
		characterClass:
			updatedContent.characterClass ?? existingContent.characterClass,
		characterLevel:
			updatedContent.characterLevel ?? existingContent.characterLevel,
		characterRace:
			updatedContent.characterRace ?? existingContent.characterRace,
	};
}

const storeCharacterInfoSchema = z.object({
	campaignId: commonSchemas.campaignId,
	characterName: z.string().describe("The name of the character"),
	characterClass: z
		.string()
		.optional()
		.describe("The character's class (e.g., Fighter, Wizard, etc.)"),
	characterLevel: z.number().optional().describe("The character's level"),
	characterRace: z.string().optional().describe("The character's race"),
	backstory: z
		.string()
		.optional()
		.describe("The character's backstory and history"),
	personalityTraits: z
		.string()
		.optional()
		.describe("The character's personality traits and quirks"),
	goals: z
		.string()
		.optional()
		.describe("The character's goals and motivations"),
	relationships: z
		.array(z.string())
		.optional()
		.describe("Array of relationships with other characters/NPCs"),
	metadata: z
		.record(z.string(), z.any())
		.optional()
		.describe("Additional character metadata"),
	jwt: commonSchemas.jwt,
});

export const storeCharacterInfo = tool({
	description:
		"Store detailed character information including backstory, personality, goals, and relationships for intelligent campaign suggestions",
	inputSchema: storeCharacterInfoSchema,
	execute: async (
		input: z.infer<typeof storeCharacterInfoSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const {
			campaignId,
			characterName,
			characterClass,
			characterLevel,
			characterRace,
			backstory,
			personalityTraits,
			goals,
			relationships,
			metadata,
			jwt,
		} = input;
		const toolCallId = options?.toolCallId ?? "unknown";

		try {
			const env = getEnvFromContext(options);

			// If we have environment, work directly with the database
			if (env?.DB) {
				const userId = extractUsernameFromJwt(jwt);

				if (!userId) {
					return createToolError(
						"Invalid authentication token",
						"Authentication failed",
						AUTH_CODES.INVALID_KEY,
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

				const daoFactory = getDAOFactory(env as Env);
				const role = await daoFactory.campaignDAO.getCampaignRole(
					campaignId,
					userId
				);

				if (role && PLAYER_ROLES.has(role)) {
					const claim =
						await daoFactory.playerCharacterClaimDAO.getClaimForUser(
							campaignId,
							userId
						);
					if (!claim) {
						return createToolError(
							"Choose your character before storing character information",
							"No claimed player character",
							403,
							toolCallId
						);
					}

					const playerEditError = await assertPlayerCanEditClaimedEntity(
						env as Env,
						campaignId,
						userId,
						claim.entityId,
						toolCallId
					);
					if (playerEditError) return playerEditError;

					const updated = await applyCharacterUpdatesToEntity(
						env as Env,
						claim.entityId,
						campaignId,
						{
							characterName,
							characterClass,
							characterLevel,
							characterRace,
							backstory,
							personalityTraits,
							goals,
							relationships,
							metadata,
						}
					);
					if ("toolCallId" in updated) {
						return { ...updated, toolCallId };
					}

					return createToolSuccess(
						`Successfully stored character information for ${updated.characterName ?? characterName}`,
						{
							...updated,
							duplicateFound: false,
							backstory,
							personalityTraits,
							goals,
							relationships,
							metadata,
						},
						toolCallId
					);
				}

				// Store the character as an entity
				const characterId = crypto.randomUUID();

				const contentForSemantic = [
					characterName,
					backstory,
					personalityTraits,
					goals,
					characterClass,
					characterRace,
				]
					.filter(Boolean)
					.join(" ");
				const openaiApiKeyRaw = await getEnvVar(
					env as any,
					"OPENAI_API_KEY",
					false
				);
				const openaiApiKey = openaiApiKeyRaw.trim() || undefined;
				const duplicate =
					await SemanticDuplicateDetectionService.findDuplicateEntity({
						content: contentForSemantic || characterName,
						campaignId,
						name: characterName,
						entityType: ENTITY_TYPE_PCS,
						env: env as Env,
						openaiApiKey,
					});

				if (duplicate) {
					// Return information about the duplicate so the agent can ask the user
					// Don't create a new entity - let the agent handle this
					return createToolSuccess(
						`A character entity named "${characterName}" already exists. Would you like to update the existing entity instead of creating a duplicate?`,
						{
							duplicateFound: true,
							duplicateEntityId: duplicate.id,
							duplicateEntity: {
								id: duplicate.id,
								name: duplicate.name,
								entityType: duplicate.entityType,
								content: duplicate.content,
								metadata: duplicate.metadata,
							},
							message: `An entity with the name "${characterName}" already exists in this campaign. Use updateCharacterInfo with duplicateEntityId and the new fields (e.g. characterClass) to update the existing character, or ask the user if they want to create a new entity with a different name.`,
						},
						toolCallId
					);
				}

				// Create character entity as player character
				await daoFactory.entityDAO.createEntity({
					id: characterId,
					campaignId,
					entityType: ENTITY_TYPE_PCS,
					name: characterName,
					content: {
						characterName,
						characterClass: characterClass || undefined,
						characterLevel: characterLevel || undefined,
						characterRace: characterRace || undefined,
						backstory: backstory || undefined,
						personalityTraits: personalityTraits || undefined,
						goals: goals || undefined,
						relationships: relationships || undefined,
					},
					metadata: {
						...metadata,
						sourceType: "user_stored",
					},
					sourceType: "user_stored",
				});

				return createToolSuccess(
					`Successfully stored character information for ${characterName}`,
					{
						id: characterId,
						entityType: ENTITY_TYPE_PCS,
						duplicateFound: false,
						characterName,
						characterClass,
						characterLevel,
						characterRace,
						backstory,
						personalityTraits,
						goals,
						relationships,
						metadata,
					},
					toolCallId
				);
			}

			const response = await authenticatedFetch(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.CHARACTERS(campaignId)
				),
				{
					method: "POST",
					jwt,
					body: JSON.stringify({
						characterName,
						characterClass,
						characterLevel,
						characterRace,
						backstory,
						personalityTraits,
						goals,
						relationships,
						metadata,
					}),
				}
			);

			if (!response.ok) {
				const authError = await handleAuthError(response);
				if (authError) {
					return createToolError(
						authError,
						null,
						AUTH_CODES.INVALID_KEY,
						toolCallId
					);
				}
				return createToolError(
					"Failed to store character information",
					`HTTP ${response.status}: ${await response.text()}`,
					500,
					toolCallId
				);
			}

			const result = await response.json();
			return createToolSuccess(
				`Successfully stored character information for ${characterName}`,
				result,
				toolCallId
			);
		} catch (error) {
			return createToolError(
				"Failed to store character information",
				error,
				500,
				toolCallId
			);
		}
	},
});

const updateCharacterInfoSchema = z.object({
	campaignId: commonSchemas.campaignId,
	entityId: z
		.string()
		.describe(
			"The ID of the existing player character entity to update. Use the duplicateEntityId returned by storeCharacterInfo when a duplicate was found."
		),
	characterName: z
		.string()
		.optional()
		.describe("Updated name of the character"),
	characterClass: z
		.string()
		.optional()
		.describe("Updated class (e.g., Fighter, Wizard)"),
	characterLevel: z.number().optional().describe("Updated level"),
	characterRace: z.string().optional().describe("Updated race/species"),
	backstory: z.string().optional().describe("Updated backstory"),
	personalityTraits: z
		.string()
		.optional()
		.describe("Updated personality traits"),
	goals: z.string().optional().describe("Updated goals"),
	relationships: z
		.array(z.string())
		.optional()
		.describe("Updated relationships"),
	metadata: z
		.record(z.string(), z.any())
		.optional()
		.describe("Additional metadata"),
	jwt: commonSchemas.jwt,
});

export const updateCharacterInfo = tool({
	description:
		"Update an existing player character entity's stored information (e.g. class, level, race, backstory). Use this when the user wants to change a character's details and storeCharacterInfo returned duplicateFound with duplicateEntityId. entityId must be the real entity ID from the duplicate response or from listAllEntities/searchCampaignContext.",
	inputSchema: updateCharacterInfoSchema,
	execute: async (
		input: z.infer<typeof updateCharacterInfoSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const {
			campaignId,
			entityId,
			characterName,
			characterClass,
			characterLevel,
			characterRace,
			backstory,
			personalityTraits,
			goals,
			relationships,
			metadata,
			jwt,
		} = input;
		const toolCallId = options?.toolCallId ?? "unknown";

		try {
			const env = getEnvFromContext(options);
			if (!env?.DB) {
				return createToolError(
					"Update character is not available",
					"Character update requires server context",
					503,
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

			const playerEditError = await assertPlayerCanEditClaimedEntity(
				env as Env,
				campaignId,
				userId,
				entityId,
				toolCallId
			);
			if (playerEditError) return playerEditError;

			const role = await getDAOFactory(env as Env).campaignDAO.getCampaignRole(
				campaignId,
				userId
			);
			if (role && PLAYER_ROLES.has(role)) {
				// Players may only edit their claimed character (checked above).
			} else {
				const gmError = await requireGMRole(
					env,
					campaignId,
					userId,
					toolCallId
				);
				if (gmError) return gmError;
			}

			const updated = await applyCharacterUpdatesToEntity(
				env as Env,
				entityId,
				campaignId,
				{
					characterName,
					characterClass,
					characterLevel,
					characterRace,
					backstory,
					personalityTraits,
					goals,
					relationships,
					metadata,
				}
			);
			if ("toolCallId" in updated) {
				return updated;
			}

			return createToolSuccess(
				`Successfully updated character ${updated.characterName ?? entityId}`,
				updated,
				toolCallId
			);
		} catch (error) {
			return createToolError(
				"Failed to update character information",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});

const generateCharacterWithAISchema = z.object({
	campaignId: commonSchemas.campaignId,
	characterName: z.string().describe("The name of the character to generate"),
	characterClass: z
		.string()
		.optional()
		.describe("The character's class/role (from campaign rules)"),
	characterLevel: z.number().optional().describe("The character's level"),
	characterRace: z
		.string()
		.optional()
		.describe("The character's species/race/ancestry (from campaign rules)"),
	campaignSetting: z
		.string()
		.optional()
		.describe("The campaign setting or world"),
	playerPreferences: z
		.string()
		.optional()
		.describe("Player preferences for character generation"),
	partyComposition: z
		.array(z.string())
		.optional()
		.describe("Array of existing party members for relationship generation"),
	allowInventIfNoRules: z
		.boolean()
		.optional()
		.describe(
			"When true, the AI may invent reasonable character options if the campaign has no character rules indexed. Set when the user says 'yes, invent options' or similar."
		),
	jwt: commonSchemas.jwt,
});

export const generateCharacterWithAITool = tool({
	description:
		"Generate a complete character using AI based on provided parameters and campaign context",
	inputSchema: generateCharacterWithAISchema,
	execute: async (
		input: z.infer<typeof generateCharacterWithAISchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const {
			campaignId,
			characterName,
			characterClass,
			characterLevel,
			characterRace,
			campaignSetting,
			playerPreferences,
			partyComposition,
			allowInventIfNoRules,
			jwt,
		} = input;
		const toolCallId = options?.toolCallId ?? "unknown";

		try {
			const env = getEnvFromContext(options);

			// If we have environment, work directly with the database
			if (env) {
				const campaignAccess = await requireCampaignAccessForTool({
					env,
					campaignId,
					jwt,
					toolCallId,
				});
				if ("toolCallId" in campaignAccess) {
					return campaignAccess;
				}
				const { userId, campaign } = campaignAccess;

				const daoFactory = getDAOFactory(env as Env);
				const role = await daoFactory.campaignDAO.getCampaignRole(
					campaignId,
					userId
				);
				const playerClaim =
					role && PLAYER_ROLES.has(role)
						? await daoFactory.playerCharacterClaimDAO.getClaimForUser(
								campaignId,
								userId
							)
						: null;

				if (role && PLAYER_ROLES.has(role) && !playerClaim) {
					return createToolError(
						"Choose your character before generating character information",
						"No claimed player character",
						403,
						toolCallId
					);
				}

				// Generate character using AI (pulls rules from campaign graph)
				const characterData = await generateCharacterWithAI(
					{
						campaignId,
						characterName,
						characterClass,
						characterLevel: characterLevel || 1,
						characterRace,
						campaignSetting,
						playerPreferences,
						partyComposition,
						campaignName: campaign.name ?? "",
						toolCallId,
						allowInventIfNoRules,
					},
					env
				);

				// If needs clarification, return as-is so the agent can ask the user
				const data = characterData.result.data as Record<string, unknown>;
				if (data?.[NEEDS_CLARIFICATION_MARKER]) {
					return characterData;
				}

				const characterDataTyped = characterData.result.data as Record<
					string,
					unknown
				>;

				if (playerClaim) {
					const playerEditError = await assertPlayerCanEditClaimedEntity(
						env as Env,
						campaignId,
						userId,
						playerClaim.entityId,
						toolCallId
					);
					if (playerEditError) return playerEditError;

					const updated = await applyCharacterUpdatesToEntity(
						env as Env,
						playerClaim.entityId,
						campaignId,
						{
							characterName: String(
								characterDataTyped.characterName ?? characterName
							),
							characterClass:
								typeof characterDataTyped.characterClass === "string"
									? characterDataTyped.characterClass
									: characterClass,
							characterLevel:
								typeof characterDataTyped.characterLevel === "number"
									? characterDataTyped.characterLevel
									: characterLevel || 1,
							characterRace:
								typeof characterDataTyped.characterRace === "string"
									? characterDataTyped.characterRace
									: characterRace,
							backstory:
								typeof characterDataTyped.backstory === "string"
									? characterDataTyped.backstory
									: undefined,
							personalityTraits:
								typeof characterDataTyped.personalityTraits === "string"
									? characterDataTyped.personalityTraits
									: undefined,
							goals:
								typeof characterDataTyped.goals === "string"
									? characterDataTyped.goals
									: undefined,
							relationships: Array.isArray(characterDataTyped.relationships)
								? (characterDataTyped.relationships as string[])
								: undefined,
							metadata: {
								...(typeof characterDataTyped.metadata === "object" &&
								characterDataTyped.metadata
									? (characterDataTyped.metadata as Record<string, unknown>)
									: {}),
								sourceType: "ai_generated",
								generatedWithAI: true,
							},
						}
					);
					if ("toolCallId" in updated) {
						return updated;
					}

					return createToolSuccess(
						`Successfully generated character ${updated.characterName ?? characterName} using AI generation`,
						{
							...updated,
							...characterDataTyped,
						},
						toolCallId
					);
				}

				// Store the generated character as an entity
				const characterId = crypto.randomUUID();

				await daoFactory.entityDAO.createEntity({
					id: characterId,
					campaignId,
					entityType: ENTITY_TYPE_PCS,
					name: String(characterDataTyped.characterName ?? characterName),
					content: {
						characterName: characterDataTyped.characterName,
						characterClass: characterDataTyped.characterClass,
						characterLevel: characterDataTyped.characterLevel,
						characterRace: characterDataTyped.characterRace,
						backstory: characterDataTyped.backstory,
						personalityTraits: characterDataTyped.personalityTraits,
						goals: characterDataTyped.goals,
						relationships: characterDataTyped.relationships,
						...(characterDataTyped.metadata || {}),
					},
					metadata: {
						...(characterDataTyped.metadata || {}),
						sourceType: "ai_generated",
						generatedWithAI: true,
					},
					sourceType: "ai_generated",
				});

				return createToolSuccess(
					`Successfully created character ${String(characterDataTyped.characterName ?? characterName)} using AI generation`,
					{
						id: characterId,
						entityType: ENTITY_TYPE_PCS,
						...characterDataTyped,
					},
					toolCallId
				);
			}

			const response = await authenticatedFetch(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.CHARACTERS(campaignId)
				),
				{
					method: "POST",
					jwt,
					body: JSON.stringify({
						characterName,
						characterClass,
						characterLevel,
						characterRace,
						campaignSetting,
						playerPreferences,
						partyComposition,
						generateWithAI: true,
					}),
				}
			);

			if (!response.ok) {
				const authError = await handleAuthError(response);
				if (authError) {
					return createToolError(
						authError,
						null,
						AUTH_CODES.INVALID_KEY,
						toolCallId
					);
				}
				return createToolError(
					"Failed to generate character with AI",
					`HTTP ${response.status}: ${await response.text()}`,
					500,
					toolCallId
				);
			}

			const result = await response.json();
			return createToolSuccess(
				"Successfully generated character using AI",
				result,
				toolCallId
			);
		} catch (error) {
			return createToolError(
				"Failed to generate character with AI",
				error,
				500,
				toolCallId
			);
		}
	},
});

const completePlayerCharacterOnboardingSchema = z.object({
	campaignId: commonSchemas.campaignId,
	entityId: z
		.string()
		.optional()
		.describe("Player character entity ID to mark complete"),
	jwt: commonSchemas.jwt,
});

export const completePlayerCharacterOnboarding = tool({
	description:
		"Mark a player's claimed character onboarding as complete after critical and important sheet gaps are resolved",
	inputSchema: completePlayerCharacterOnboardingSchema,
	execute: async (
		input: z.infer<typeof completePlayerCharacterOnboardingSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { campaignId, entityId, jwt } = input;
		const toolCallId = options?.toolCallId ?? "unknown";

		try {
			const env = getEnvFromContext(options);
			if (!env?.DB) {
				return createToolError(
					"Complete onboarding is not available",
					"Server context required",
					503,
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
			const daoFactory = getDAOFactory(env as Env);
			const role = await daoFactory.campaignDAO.getCampaignRole(
				campaignId,
				userId
			);

			let targetEntityId = entityId;
			if (role && PLAYER_ROLES.has(role)) {
				const claim = await daoFactory.playerCharacterClaimDAO.getClaimForUser(
					campaignId,
					userId
				);
				if (!claim) {
					return createToolError(
						"No claimed player character found",
						"Claim required",
						403,
						toolCallId
					);
				}
				targetEntityId = claim.entityId;
			}

			if (!targetEntityId) {
				return createToolError(
					"entityId is required",
					"Missing entity ID",
					400,
					toolCallId
				);
			}

			if (role && PLAYER_ROLES.has(role)) {
				const playerEditError = await assertPlayerCanEditClaimedEntity(
					env as Env,
					campaignId,
					userId,
					targetEntityId,
					toolCallId
				);
				if (playerEditError) return playerEditError;
			} else {
				const gmError = await requireGMRole(
					env,
					campaignId,
					userId,
					toolCallId
				);
				if (gmError) return gmError;
			}

			const entity = await daoFactory.entityDAO.getEntityById(targetEntityId);
			if (!entity) {
				return createToolError(
					"Entity not found",
					`No entity with ID ${targetEntityId} found`,
					404,
					toolCallId
				);
			}

			const result = await markPcOnboardingComplete(targetEntityId, env);
			if (!result.success) {
				return createToolSuccess(
					"Character onboarding is not complete yet",
					{
						entityId: targetEntityId,
						remainingGaps: result.remainingGaps ?? [],
					},
					toolCallId
				);
			}

			const gaps = await getPcOnboardingGaps(entity, campaignId, env);

			return createToolSuccess(
				"Player character onboarding marked complete",
				{
					entityId: targetEntityId,
					pcOnboardingStatus: "complete",
					remainingMinorGaps: gaps.filter((gap) => gap.severity === "minor"),
				},
				toolCallId
			);
		} catch (error) {
			return createToolError(
				"Failed to complete player character onboarding",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});

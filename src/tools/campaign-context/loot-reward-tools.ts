import { tool } from "ai";
import { z } from "zod";
import { MODEL_CONFIG, type ToolResult } from "@/app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import type { Entity } from "@/dao/entity-dao";
import { getEnvVar } from "@/lib/env-utils";
import { createLLMProvider } from "@/services/llm/llm-provider-factory";
import {
	commonSchemas,
	createToolError,
	createToolSuccess,
	extractUsernameFromJwt,
	getEnvFromContext,
	requireGMRole,
	type ToolExecuteOptions,
} from "../utils";

const lootItemSchema = z.object({
	name: z.string(),
	itemType: z.string(),
	rarity: z.string(),
	description: z.string(),
	mechanicalNotes: z.string().optional(),
	storyHook: z.string().optional(),
	estimatedValueGp: z.number().int().nonnegative().optional(),
});

const generatedLootSchema = z.object({
	summary: z.string(),
	currency: z
		.object({
			cp: z.number().int().nonnegative().default(0),
			sp: z.number().int().nonnegative().default(0),
			gp: z.number().int().nonnegative().default(0),
			pp: z.number().int().nonnegative().default(0),
		})
		.optional(),
	valuables: z.array(z.string()).default([]),
	items: z.array(lootItemSchema).default([]),
	distributionNotes: z.array(z.string()).default([]),
});

const magicItemSuggestionSchema = z.object({
	primaryRecommendation: lootItemSchema.extend({
		reasoning: z.string(),
	}),
	alternatives: z
		.array(
			lootItemSchema.extend({
				reasoning: z.string(),
			})
		)
		.default([]),
	usageIdeas: z.array(z.string()).default([]),
});

function getEntityText(entity: Entity): string {
	const content = entity.content;
	if (!content || typeof content !== "object" || Array.isArray(content)) {
		return "";
	}
	try {
		return JSON.stringify(content);
	} catch {
		return "";
	}
}

function summarizeEntities(entities: Entity[], max = 16): string {
	return entities
		.slice(0, max)
		.map((entity) => {
			const content = getEntityText(entity).slice(0, 260);
			return `- ${entity.name} [${entity.entityType}] ${content}`;
		})
		.join("\n");
}

async function getLlmProvider(env: unknown, toolCallId: string) {
	const openaiApiKeyRaw = await getEnvVar(
		env as Record<string, unknown>,
		"OPENAI_API_KEY",
		false
	);
	const openaiApiKey = openaiApiKeyRaw.trim();
	if (!openaiApiKey) {
		return {
			error: createToolError(
				"OpenAI API key not configured",
				"AI is not configured for this environment.",
				503,
				toolCallId
			),
			provider: null,
		} as const;
	}

	const provider = createLLMProvider({
		provider: MODEL_CONFIG.PROVIDER.DEFAULT,
		apiKey: openaiApiKey,
		defaultModel: MODEL_CONFIG.OPENAI.SESSION_PLANNING,
		defaultTemperature: MODEL_CONFIG.PARAMETERS.SESSION_PLANNING_TEMPERATURE,
		defaultMaxTokens: MODEL_CONFIG.PARAMETERS.SESSION_PLANNING_MAX_TOKENS,
	});
	return { error: null, provider } as const;
}

const generateLootSchema = z.object({
	campaignId: commonSchemas.campaignId,
	prompt: z
		.string()
		.describe(
			"Loot request context (e.g. encounter outcome, location, tone, and party needs)."
		),
	partyLevel: z.number().int().min(1).max(20).optional(),
	encounterChallenge: z
		.string()
		.optional()
		.describe("Optional challenge descriptor (e.g. hard, deadly, CR 8 boss)."),
	campaignTone: z.string().optional(),
	includePreviousLoot: z.boolean().optional().default(true),
	jwt: commonSchemas.jwt,
});

export const generateLootTool = tool({
	description:
		"Generate contextually appropriate treasure and item rewards based on campaign tone, party level, and recent campaign state.",
	inputSchema: generateLootSchema,
	execute: async (
		input: z.infer<typeof generateLootSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const {
			campaignId,
			prompt,
			partyLevel,
			encounterChallenge,
			campaignTone,
			includePreviousLoot,
			jwt,
		} = input;
		const toolCallId = options?.toolCallId ?? crypto.randomUUID();

		try {
			const env = getEnvFromContext(options);
			if (!env) {
				return createToolError(
					"Environment not available",
					"Direct database access is required for loot generation.",
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

			const contextEntities = await daoFactory.entityDAO.listEntitiesByCampaign(
				campaignId,
				{
					excludeShardStatuses: ["staging", "rejected", "deleted"],
					limit: 80,
				}
			);
			const previousItemEntities = includePreviousLoot
				? [
						...(await daoFactory.entityDAO.listEntitiesByCampaign(campaignId, {
							entityType: "item",
							limit: 40,
						})),
						...(await daoFactory.entityDAO.listEntitiesByCampaign(campaignId, {
							entityType: "items",
							limit: 40,
						})),
					]
				: [];

			const llm = await getLlmProvider(env, toolCallId);
			if (!llm.provider || llm.error) return llm.error;

			const promptText = `
You are generating tabletop RPG loot for a campaign.
Return valid JSON only.

Campaign name: ${campaign.name}
Campaign description: ${campaign.description || "No description provided."}
Campaign metadata: ${campaign.metadata || "{}"}
Requested campaign tone: ${campaignTone || "Use campaign context and prompt."}
Party level: ${partyLevel ?? "Not provided"}
Encounter challenge: ${encounterChallenge || "Not provided"}

User request:
${prompt}

Recent campaign entities:
${summarizeEntities(contextEntities)}

Previously distributed item entities:
${summarizeEntities(previousItemEntities, 20) || "None tracked yet."}

Generate loot that is narratively coherent, not repetitive with previous rewards, and suitable for the likely party power level.
`.trim();

			const generated = await llm.provider.generateStructuredOutput<unknown>(
				promptText,
				{
					model: MODEL_CONFIG.OPENAI.SESSION_PLANNING,
					temperature: MODEL_CONFIG.PARAMETERS.SESSION_PLANNING_TEMPERATURE,
					maxTokens: 2500,
				}
			);
			const parsed = generatedLootSchema.safeParse(generated);
			if (!parsed.success) {
				return createToolError(
					"Failed to validate generated loot",
					parsed.error.flatten(),
					500,
					toolCallId
				);
			}

			return createToolSuccess(
				`Generated loot package for campaign "${campaign.name}".`,
				{
					loot: parsed.data,
					input: {
						partyLevel: partyLevel ?? null,
						encounterChallenge: encounterChallenge ?? null,
						campaignTone: campaignTone ?? null,
					},
				},
				toolCallId
			);
		} catch (error) {
			console.error("[generateLootTool] Error:", error);
			return createToolError(
				"Failed to generate loot",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});

const suggestMagicItemSchema = z.object({
	campaignId: commonSchemas.campaignId,
	request: z
		.string()
		.describe(
			"What kind of reward is needed and why (e.g. ranger quest completion reward)."
		),
	characterEntityId: z.string().optional(),
	characterName: z.string().optional(),
	partyLevel: z.number().int().min(1).max(20).optional(),
	campaignTone: z.string().optional(),
	jwt: commonSchemas.jwt,
});

export const suggestMagicItemTool = tool({
	description:
		"Suggest a narratively relevant magic item reward tied to campaign context and character/situation details.",
	inputSchema: suggestMagicItemSchema,
	execute: async (
		input: z.infer<typeof suggestMagicItemSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const {
			campaignId,
			request,
			characterEntityId,
			characterName,
			partyLevel,
			campaignTone,
			jwt,
		} = input;
		const toolCallId = options?.toolCallId ?? crypto.randomUUID();

		try {
			const env = getEnvFromContext(options);
			if (!env) {
				return createToolError(
					"Environment not available",
					"Direct database access is required for magic item suggestions.",
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

			let characterEntity: Entity | null = null;
			if (characterEntityId) {
				const candidate =
					await daoFactory.entityDAO.getEntityById(characterEntityId);
				if (candidate?.campaignId === campaignId) {
					characterEntity = candidate;
				}
			} else if (characterName) {
				const matches = await daoFactory.entityDAO.findEntitiesByName(
					campaignId,
					characterName
				);
				characterEntity = matches[0] ?? null;
			}

			const nearbyEntities = await daoFactory.entityDAO.listEntitiesByCampaign(
				campaignId,
				{
					excludeShardStatuses: ["staging", "rejected", "deleted"],
					limit: 80,
				}
			);

			const llm = await getLlmProvider(env, toolCallId);
			if (!llm.provider || llm.error) return llm.error;

			const promptText = `
You are suggesting a meaningful tabletop RPG magic item reward.
Return valid JSON only.

Campaign name: ${campaign.name}
Campaign description: ${campaign.description || "No description provided."}
Campaign metadata: ${campaign.metadata || "{}"}
Campaign tone: ${campaignTone || "Infer from campaign context and request."}
Party level: ${partyLevel ?? "Not provided"}

Request:
${request}

Target character (if any):
${characterEntity ? `${characterEntity.name} [${characterEntity.entityType}] ${getEntityText(characterEntity).slice(0, 500)}` : "No character target provided."}

Relevant campaign entities:
${summarizeEntities(nearbyEntities)}

Return one primary recommendation and 2-3 alternatives.
Prioritize narrative tie-ins to known NPCs, locations, factions, or plot threads.
`.trim();

			const generated = await llm.provider.generateStructuredOutput<unknown>(
				promptText,
				{
					model: MODEL_CONFIG.OPENAI.SESSION_PLANNING,
					temperature: MODEL_CONFIG.PARAMETERS.SESSION_PLANNING_TEMPERATURE,
					maxTokens: 2500,
				}
			);
			const parsed = magicItemSuggestionSchema.safeParse(generated);
			if (!parsed.success) {
				return createToolError(
					"Failed to validate magic item suggestion",
					parsed.error.flatten(),
					500,
					toolCallId
				);
			}

			return createToolSuccess(
				`Generated magic item recommendations for campaign "${campaign.name}".`,
				{
					suggestion: parsed.data,
					character: characterEntity
						? {
								id: characterEntity.id,
								name: characterEntity.name,
								entityType: characterEntity.entityType,
							}
						: null,
				},
				toolCallId
			);
		} catch (error) {
			console.error("[suggestMagicItemTool] Error:", error);
			return createToolError(
				"Failed to suggest magic item",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});

const trackDistributedLootSchema = z
	.object({
		campaignId: commonSchemas.campaignId,
		name: z.string().describe("Item name."),
		description: z.string().describe("Item description/lore."),
		itemType: z.string().optional(),
		rarity: z.string().optional(),
		attunement: z.string().optional(),
		properties: z.array(z.string()).optional(),
		charges: z.number().int().nonnegative().optional(),
		curse: z.string().optional(),
		tags: z.array(z.string()).optional(),
		recipientEntityIds: z.array(z.string()).optional(),
		recipientEntityId: z.string().optional(),
		foundInEntityId: z.string().optional(),
		belongedToEntityId: z.string().optional(),
		notes: z.string().optional(),
		jwt: commonSchemas.jwt,
	})
	.refine(
		(data) =>
			Boolean(
				data.recipientEntityId ||
					(data.recipientEntityIds && data.recipientEntityIds.length > 0)
			),
		{
			message:
				"At least one recipient is required (recipientEntityId or recipientEntityIds).",
			path: ["recipientEntityIds"],
		}
	);

export const trackDistributedLootTool = tool({
	description:
		"Track distributed loot by creating an item entity and linking it to recipients and optional source entities in the campaign graph.",
	inputSchema: trackDistributedLootSchema,
	execute: async (
		input: z.infer<typeof trackDistributedLootSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const {
			campaignId,
			name,
			description,
			itemType,
			rarity,
			attunement,
			properties,
			charges,
			curse,
			tags,
			recipientEntityIds,
			recipientEntityId,
			foundInEntityId,
			belongedToEntityId,
			notes,
			jwt,
		} = input;
		const toolCallId = options?.toolCallId ?? crypto.randomUUID();

		try {
			const env = getEnvFromContext(options);
			if (!env) {
				return createToolError(
					"Environment not available",
					"Direct database access is required for loot tracking.",
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

			const recipientIds = Array.from(
				new Set([
					...(recipientEntityIds || []),
					...(recipientEntityId ? [recipientEntityId] : []),
				])
			);

			const referencedIds = [
				...recipientIds,
				...(foundInEntityId ? [foundInEntityId] : []),
				...(belongedToEntityId ? [belongedToEntityId] : []),
			];
			const referenced =
				await daoFactory.entityDAO.getEntitiesByIds(referencedIds);
			const byId = new Map(referenced.map((entity) => [entity.id, entity]));

			for (const id of recipientIds) {
				const recipient = byId.get(id);
				if (!recipient || recipient.campaignId !== campaignId) {
					return createToolError(
						"Recipient entity not found",
						`Recipient entity ${id} was not found in this campaign.`,
						404,
						toolCallId
					);
				}
			}

			if (foundInEntityId) {
				const foundIn = byId.get(foundInEntityId);
				if (!foundIn || foundIn.campaignId !== campaignId) {
					return createToolError(
						"Found-in entity not found",
						`Found-in entity ${foundInEntityId} was not found in this campaign.`,
						404,
						toolCallId
					);
				}
			}

			if (belongedToEntityId) {
				const belongedTo = byId.get(belongedToEntityId);
				if (!belongedTo || belongedTo.campaignId !== campaignId) {
					return createToolError(
						"Belonged-to entity not found",
						`Belonged-to entity ${belongedToEntityId} was not found in this campaign.`,
						404,
						toolCallId
					);
				}
			}

			const itemId = crypto.randomUUID();
			await daoFactory.entityDAO.createEntity({
				id: itemId,
				campaignId,
				entityType: "item",
				name,
				content: {
					type: "item",
					name,
					rarity: rarity || "",
					item_type: itemType || "",
					attunement: attunement || "",
					properties: properties || [],
					charges: charges ?? null,
					curse: curse || "",
					text: description,
				},
				metadata: {
					rarity: rarity || "",
					itemType: itemType || "",
					attunement: attunement || "",
					properties: properties || [],
					charges: charges ?? null,
					curse: curse || "",
					tags: tags || [],
					notes: notes || "",
					distributedAt: new Date().toISOString(),
				},
				confidence: 1,
				sourceType: "user_input",
				sourceId: userId,
			});

			const createdRelationships = [];
			for (const recipientId of recipientIds) {
				const edges = await daoFactory.entityGraphService.upsertEdge({
					campaignId,
					fromEntityId: itemId,
					toEntityId: recipientId,
					relationshipType: "owned_by",
					strength: 1,
					metadata: { source: "trackDistributedLootTool" },
					allowSelfRelation: false,
				});
				createdRelationships.push(...edges);
			}

			if (foundInEntityId) {
				const edges = await daoFactory.entityGraphService.upsertEdge({
					campaignId,
					fromEntityId: itemId,
					toEntityId: foundInEntityId,
					relationshipType: "found_in",
					strength: 0.8,
					metadata: { source: "trackDistributedLootTool" },
					allowSelfRelation: false,
				});
				createdRelationships.push(...edges);
			}

			if (belongedToEntityId) {
				const edges = await daoFactory.entityGraphService.upsertEdge({
					campaignId,
					fromEntityId: itemId,
					toEntityId: belongedToEntityId,
					relationshipType: "belonged_to",
					strength: 0.8,
					metadata: { source: "trackDistributedLootTool" },
					allowSelfRelation: false,
				});
				createdRelationships.push(...edges);
			}

			const createdItem = await daoFactory.entityDAO.getEntityById(itemId);
			return createToolSuccess(
				`Tracked distributed loot item "${name}" in campaign "${campaign.name}".`,
				{
					item: createdItem,
					relationships: createdRelationships,
				},
				toolCallId
			);
		} catch (error) {
			console.error("[trackDistributedLootTool] Error:", error);
			return createToolError(
				"Failed to track distributed loot",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});

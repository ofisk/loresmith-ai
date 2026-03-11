import { tool } from "ai";
import { z } from "zod";
import {
	getGenerationModelForProvider,
	MODEL_CONFIG,
	type ToolResult,
} from "@/app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import type { Entity } from "@/dao/entity-dao";
import { LOOT_REWARD_PROMPTS } from "@/lib/prompts/loot-reward-prompts";
import {
	createProviderForTier,
	getDefaultProviderApiKey,
} from "@/services/llm/llm-provider-utils";
import {
	commonSchemas,
	createToolError,
	createToolSuccess,
	getEnvFromContext,
	requireCampaignAccessForTool,
	requireGMRole,
	type ToolExecuteOptions,
} from "@/tools/utils";

const lootItemSchema = z.object({
	name: z.string(),
	itemType: z.string(),
	rarity: z.string(),
	description: z.string(),
	mechanicalNotes: z.string().optional(),
	storyHook: z.string().optional(),
	/** Numeric value estimate for the item; unit is game-specific (e.g. gp, gold, credits). */
	estimatedValue: z.number().int().nonnegative().optional(),
	/** Unit for estimatedValue (e.g. gp, gold, credits). Omit if implied by setting. */
	valueUnit: z.string().optional(),
});

function normalizeLootItem(raw: unknown): unknown {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
	const o = raw as Record<string, unknown>;
	const nn = (v: unknown) => (v === null || v === undefined ? undefined : v);
	const num = (v: unknown): number | undefined => {
		if (typeof v === "number" && !Number.isNaN(v))
			return Math.max(0, Math.floor(v));
		if (typeof v === "string") {
			const n = Number(v);
			return !Number.isNaN(n) ? Math.max(0, Math.floor(n)) : undefined;
		}
		return undefined;
	};
	return {
		name: String(nn(o.name) ?? ""),
		itemType: String(nn(o.itemType) ?? nn(o.item_type) ?? "item"),
		rarity: String(nn(o.rarity) ?? "common"),
		description: String(nn(o.description) ?? ""),
		mechanicalNotes: nn(o.mechanicalNotes) ?? nn(o.mechanical_notes),
		storyHook: nn(o.storyHook) ?? nn(o.story_hook),
		estimatedValue:
			num(o.estimatedValue) ??
			num(o.estimated_value) ??
			num(o.estimatedValueGp) ??
			num(o.estimated_value_gp),
		valueUnit:
			typeof o.valueUnit === "string"
				? o.valueUnit
				: typeof o.value_unit === "string"
					? o.value_unit
					: undefined,
	};
}

/** Normalize currency to Record<unitName, amount>. Game-agnostic (any unit names). */
function normalizeCurrency(raw: unknown): Record<string, number> {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
	const o = raw as Record<string, unknown>;
	const num = (v: unknown) =>
		typeof v === "number"
			? Math.max(0, Math.floor(v))
			: typeof v === "string"
				? Math.max(0, Math.floor(Number(v)))
				: 0;
	const result: Record<string, number> = {};
	for (const [key, val] of Object.entries(o)) {
		if (typeof key === "string" && key.length > 0) {
			const n = num(val);
			if (n > 0) result[key] = n;
		}
	}
	return result;
}

const generatedLootSchema = z.preprocess(
	(raw: unknown) => {
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
		const o = raw as Record<string, unknown>;
		return {
			summary: o.summary ?? "",
			currency: o.currency ? normalizeCurrency(o.currency) : {},
			valuables: Array.isArray(o.valuables) ? o.valuables : [],
			items: Array.isArray(o.items) ? o.items.map(normalizeLootItem) : [],
			distributionNotes: o.distributionNotes ?? o.distribution_notes ?? [],
		};
	},
	z.object({
		summary: z.string(),
		/** Currency amounts by unit name (game-agnostic: gold, gp, credits, etc.) */
		currency: z.record(z.string(), z.number().int().nonnegative()),
		valuables: z.array(z.string()).default([]),
		items: z.array(lootItemSchema).default([]),
		distributionNotes: z.array(z.string()).default([]),
	})
);

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

function isNoOutputError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return (
		message.includes("No output generated") ||
		message.includes("AI_NoOutputGeneratedError")
	);
}

async function getLlmProvider(env: unknown, toolCallId: string) {
	const providerApiKey = await getDefaultProviderApiKey(
		env as Record<string, unknown>,
		false
	);
	if (!providerApiKey) {
		return {
			error: createToolError(
				`${MODEL_CONFIG.PROVIDER.DEFAULT} API key not configured`,
				"AI is not configured for this environment.",
				503,
				toolCallId
			),
			provider: null,
		} as const;
	}

	const provider = createProviderForTier({
		apiKey: providerApiKey,
		tier: "SESSION_PLANNING",
		temperature: MODEL_CONFIG.PARAMETERS.SESSION_PLANNING_TEMPERATURE,
		maxTokens: MODEL_CONFIG.PARAMETERS.SESSION_PLANNING_MAX_TOKENS,
	});
	return { error: null, provider } as const;
}

async function generateStructuredWithFallback<T>({
	provider,
	primaryPrompt,
	fallbackPrompt,
	fallbackJsonHint,
	primaryModel,
	fallbackModel,
	temperature,
	primaryMaxTokens,
	fallbackMaxTokens,
}: {
	provider: Awaited<ReturnType<typeof getLlmProvider>>["provider"];
	primaryPrompt: string;
	fallbackPrompt: string;
	fallbackJsonHint: string;
	primaryModel: string;
	fallbackModel: string;
	temperature: number;
	primaryMaxTokens: number;
	fallbackMaxTokens: number;
}): Promise<T> {
	try {
		return await provider!.generateStructuredOutput<T>(primaryPrompt, {
			model: primaryModel,
			temperature,
			maxTokens: primaryMaxTokens,
		});
	} catch (error) {
		if (!isNoOutputError(error)) {
			throw error;
		}
		console.warn(
			"[loot-reward-tools] Primary structured generation returned no output, retrying with compact fallback prompt"
		);
		try {
			return await provider!.generateStructuredOutput<T>(fallbackPrompt, {
				model: fallbackModel,
				temperature: 0.3,
				maxTokens: fallbackMaxTokens,
			});
		} catch (fallbackError) {
			if (!isNoOutputError(fallbackError)) {
				throw fallbackError;
			}
			console.warn(
				"[loot-reward-tools] Structured fallback also returned no output, retrying via text generation with JSON extraction"
			);
			const textResponse = await provider!.generateSummary(
				`${fallbackPrompt}\n\n${fallbackJsonHint}\nRespond with JSON only.`,
				{
					model: fallbackModel,
					temperature: 0.3,
					maxTokens: fallbackMaxTokens,
				}
			);
			const candidate = textResponse.trim();
			const fencedMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
			const rawJson = (fencedMatch?.[1] ?? candidate).trim();
			try {
				return JSON.parse(rawJson) as T;
			} catch {
				const objectMatch = rawJson.match(/\{[\s\S]*\}/);
				if (objectMatch) {
					return JSON.parse(objectMatch[0]) as T;
				}
				throw fallbackError;
			}
		}
	}
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

			const access = await requireCampaignAccessForTool({
				env,
				campaignId,
				jwt,
				toolCallId,
			});
			if ("toolCallId" in access) return access;
			const { userId, campaign } = access;

			const daoFactory = getDAOFactory(env);

			const gmError = await requireGMRole(env, campaignId, userId, toolCallId);
			if (gmError) return gmError;

			const contextEntities = await daoFactory.entityDAO.listEntitiesByCampaign(
				campaignId,
				{
					excludeShardStatuses: ["staging", "rejected", "deleted"],
					limit: 40,
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

			const promptText = LOOT_REWARD_PROMPTS.formatGenerateLootPrompt({
				campaignName: campaign.name,
				campaignDescription: campaign.description || "No description provided.",
				campaignMetadata: campaign.metadata || "{}",
				campaignTone: campaignTone || "Use campaign context and prompt.",
				partyLevel: String(partyLevel ?? "Not provided"),
				encounterChallenge: encounterChallenge || "Not provided",
				userPrompt: prompt,
				recentEntitiesSummary: LOOT_REWARD_PROMPTS.summarizeEntities(
					contextEntities,
					10
				),
				previousLootSummary:
					LOOT_REWARD_PROMPTS.summarizeEntities(previousItemEntities, 12) ||
					"None tracked yet.",
			});

			const fallbackPromptText =
				LOOT_REWARD_PROMPTS.formatGenerateLootFallbackPrompt({
					campaignName: campaign.name,
					campaignTone: campaignTone || "Inferred from request",
					partyLevel: String(partyLevel ?? "Not provided"),
					encounterChallenge: encounterChallenge || "Not provided",
					userPrompt: prompt,
				});

			const generated = await generateStructuredWithFallback<unknown>({
				provider: llm.provider,
				primaryPrompt: promptText,
				fallbackPrompt: fallbackPromptText,
				fallbackJsonHint:
					'JSON shape: {"summary":"string","currency":{"unitName":0},"valuables":["..."],"items":[{"name":"...","itemType":"...","rarity":"...","description":"...","mechanicalNotes":"...","storyHook":"...","estimatedValue":0,"valueUnit":"..."}],"distributionNotes":["..."]}',
				primaryModel: getGenerationModelForProvider("SESSION_PLANNING"),
				fallbackModel: getGenerationModelForProvider("INTERACTIVE"),
				temperature: MODEL_CONFIG.PARAMETERS.SESSION_PLANNING_TEMPERATURE,
				primaryMaxTokens: 2500,
				fallbackMaxTokens: 1800,
			});
			const parsed = generatedLootSchema.safeParse(generated);
			if (!parsed.success) {
				console.error("[generateLootTool] Validation failed:", {
					toolCallId,
					rawOutput: JSON.stringify(generated).slice(0, 2000),
					zodError: parsed.error.flatten(),
				});
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

			const access = await requireCampaignAccessForTool({
				env,
				campaignId,
				jwt,
				toolCallId,
			});
			if ("toolCallId" in access) return access;
			const { userId, campaign } = access;

			const daoFactory = getDAOFactory(env);

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

			const promptText = LOOT_REWARD_PROMPTS.formatSuggestMagicItemPrompt({
				campaignName: campaign.name,
				campaignDescription: campaign.description || "No description provided.",
				campaignMetadata: campaign.metadata || "{}",
				campaignTone:
					campaignTone || "Infer from campaign context and request.",
				partyLevel: String(partyLevel ?? "Not provided"),
				request,
				targetCharacterSummary: characterEntity
					? `${characterEntity.name} (${characterEntity.entityType})`
					: "No character target provided.",
				relevantEntitiesSummary: LOOT_REWARD_PROMPTS.summarizeEntities(
					nearbyEntities,
					10
				),
			});

			const fallbackPromptText =
				LOOT_REWARD_PROMPTS.formatSuggestMagicItemFallbackPrompt({
					campaignName: campaign.name,
					partyLevel: String(partyLevel ?? "Not provided"),
					campaignTone: campaignTone || "Inferred",
					request,
					characterContext: characterEntity
						? `${characterEntity.name} (${characterEntity.entityType})`
						: "None provided",
				});

			const generated = await generateStructuredWithFallback<unknown>({
				provider: llm.provider,
				primaryPrompt: promptText,
				fallbackPrompt: fallbackPromptText,
				fallbackJsonHint:
					'JSON shape: {"primaryRecommendation":{"name":"...","itemType":"...","rarity":"...","description":"...","mechanicalNotes":"...","storyHook":"...","estimatedValue":0,"valueUnit":"...","reasoning":"..."},"alternatives":[{"name":"...","itemType":"...","rarity":"...","description":"...","mechanicalNotes":"...","storyHook":"...","estimatedValue":0,"valueUnit":"...","reasoning":"..."}],"usageIdeas":["..."]}',
				primaryModel: getGenerationModelForProvider("SESSION_PLANNING"),
				fallbackModel: getGenerationModelForProvider("INTERACTIVE"),
				temperature: MODEL_CONFIG.PARAMETERS.SESSION_PLANNING_TEMPERATURE,
				primaryMaxTokens: 2500,
				fallbackMaxTokens: 1600,
			});
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

			const access = await requireCampaignAccessForTool({
				env,
				campaignId,
				jwt,
				toolCallId,
			});
			if ("toolCallId" in access) return access;
			const { userId, campaign } = access;

			const daoFactory = getDAOFactory(env);

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

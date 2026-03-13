import { tool } from "ai";
import { z } from "zod";
import {
	getGenerationModelForProvider,
	MODEL_CONFIG,
	type ToolResult,
} from "@/app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import { sanitizeEntityContentForPlayer } from "@/lib/entity/entity-content-sanitizer";
import {
	buildGenerateHandoutPrompt,
	HANDOUT_FORMATS,
	type HandoutFormat,
	renderHandoutMarkdown,
	renderHandoutText,
	summarizePlayerSafeEntity,
} from "@/lib/prompts/player-handout-prompts";
import { R2Helper } from "@/lib/r2";
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
import { sanitizeFileName } from "./player-handout-utils";

const handoutFormatSchema = z.enum(HANDOUT_FORMATS);
const exportFormatSchema = z.enum(["markdown", "text"]);

const generatedHandoutSchema = z.object({
	title: z.string().min(1),
	content: z.string().min(1),
	format: handoutFormatSchema,
	safetyNotes: z.array(z.string()).default([]),
});

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

const generateHandoutSchema = z.object({
	campaignId: commonSchemas.campaignId,
	entityId: z.string().describe("Source entity ID to generate handout from."),
	format: handoutFormatSchema,
	tone: z
		.string()
		.optional()
		.describe("Optional style/tone guidance for the generated handout."),
	targetLength: z
		.string()
		.optional()
		.describe("Optional length hint such as short, medium, or long."),
	jwt: commonSchemas.jwt,
});

export const generateHandoutTool = tool({
	description:
		"Generate player-facing handout content from a campaign entity using only player-safe fields. GM-only.",
	inputSchema: generateHandoutSchema,
	execute: async (
		input: z.infer<typeof generateHandoutSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { campaignId, entityId, format, tone, targetLength, jwt } = input;
		const toolCallId = options?.toolCallId ?? crypto.randomUUID();

		try {
			const env = getEnvFromContext(options);
			if (!env) {
				return createToolError(
					"Environment not available",
					"Direct database access is required for handout generation.",
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

			const gmError = await requireGMRole(env, campaignId, userId, toolCallId);
			if (gmError) return gmError;

			const daoFactory = getDAOFactory(env);
			const entity = await daoFactory.entityDAO.getEntityById(entityId);
			if (!entity || entity.campaignId !== campaignId) {
				return createToolError(
					"Entity not found",
					"The requested entity was not found in this campaign.",
					404,
					toolCallId
				);
			}

			const safeContent =
				entity.content &&
				typeof entity.content === "object" &&
				!Array.isArray(entity.content)
					? sanitizeEntityContentForPlayer(
							entity.content as Record<string, unknown>,
							entity.entityType
						)
					: {};
			const entitySummary = summarizePlayerSafeEntity(entity, safeContent);

			const llm = await getLlmProvider(env, toolCallId);
			if (!llm.provider || llm.error) return llm.error;

			const prompt = buildGenerateHandoutPrompt({
				campaignName: campaign.name,
				format,
				entitySummary,
				userTone: tone,
				targetLength,
			});

			const generated = await llm.provider.generateStructuredOutput<unknown>(
				prompt,
				{
					model: getGenerationModelForProvider("SESSION_PLANNING"),
					temperature: MODEL_CONFIG.PARAMETERS.SESSION_PLANNING_TEMPERATURE,
					maxTokens: 1800,
				}
			);

			const parsed = generatedHandoutSchema.safeParse(generated);
			if (!parsed.success) {
				return createToolError(
					"Failed to validate generated handout",
					parsed.error.flatten(),
					500,
					toolCallId
				);
			}

			return createToolSuccess(
				`Generated ${format.replaceAll("_", " ")} handout from "${entity.name}".`,
				{
					handout: {
						...parsed.data,
						entityId: entity.id,
						entityName: entity.name,
						entityType: entity.entityType,
					},
				},
				toolCallId
			);
		} catch (error) {
			return createToolError(
				"Failed to generate handout",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});

const exportHandoutSchema = z.object({
	campaignId: commonSchemas.campaignId,
	title: z.string().min(1),
	entityId: z.string().optional(),
	entityName: z.string().optional(),
	format: handoutFormatSchema,
	content: z.string().min(1),
	exportFormat: exportFormatSchema.default("markdown"),
	filenameHint: z.string().optional(),
	jwt: commonSchemas.jwt,
});

export const exportHandoutTool = tool({
	description:
		"Export handout content as markdown or text and persist it in R2 for sharing workflows. GM-only.",
	inputSchema: exportHandoutSchema,
	execute: async (
		input: z.infer<typeof exportHandoutSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const {
			campaignId,
			title,
			entityId,
			entityName,
			format,
			content,
			exportFormat,
			filenameHint,
			jwt,
		} = input;
		const toolCallId = options?.toolCallId ?? crypto.randomUUID();

		try {
			const env = getEnvFromContext(options);
			if (!env) {
				return createToolError(
					"Environment not available",
					"Direct storage access is required for handout export.",
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
			const { userId } = access;

			const gmError = await requireGMRole(env, campaignId, userId, toolCallId);
			if (gmError) return gmError;

			const sourceName = entityName || "unknown-entity";
			const payload =
				exportFormat === "markdown"
					? renderHandoutMarkdown({
							title,
							content,
							format,
							entityName: sourceName,
						})
					: renderHandoutText({
							title,
							content,
							format,
							entityName: sourceName,
						});

			const extension = exportFormat === "markdown" ? "md" : "txt";
			const contentType =
				exportFormat === "markdown" ? "text/markdown" : "text/plain";
			const baseName = sanitizeFileName(filenameHint || title);
			const exportedAt = new Date().toISOString();
			const objectKey = `exports/handouts/${campaignId}/${baseName}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`;
			const fileName = `${baseName}.${extension}`;
			const bytes = new TextEncoder().encode(payload);

			const r2 = new R2Helper(env as any);
			await r2.put(objectKey, bytes.buffer, contentType);

			return createToolSuccess(
				`Exported handout as ${exportFormat}.`,
				{
					export: {
						objectKey,
						fileName,
						contentType,
						sizeBytes: bytes.byteLength,
						exportedAt,
						format,
						share: {
							type: "r2_object",
							ready: true,
						},
					},
					source: {
						entityId: entityId ?? null,
						entityName: entityName ?? null,
					},
					preview: payload.slice(0, 600),
				},
				toolCallId
			);
		} catch (error) {
			return createToolError(
				"Failed to export handout",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});

export type { HandoutFormat };

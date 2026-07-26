import { tool } from "ai";
import { z } from "zod";
import { getDAOFactory } from "@/dao/dao-factory";
import type { Env } from "@/middleware/auth";
import type { GenerateAudioRequest } from "@/services/audio/audio-generation-service";
import {
	deleteCampaignAudio,
	getAudioCapabilities,
	prepareAudioGeneration,
} from "@/services/audio/audio-generation-service";
import {
	commonSchemas,
	createToolError,
	createToolSuccess,
	getEnvFromContext,
	requireCampaignAccessForTool,
	requireGMRole,
	type ToolExecuteOptions,
} from "@/tools/utils";
import { AUDIO_KINDS, isAudioKind } from "@/types/campaign-audio";

/**
 * Conversational access to generated campaign audio (issue #756).
 *
 * These tools exist because typing a prompt into a standalone audio tool is
 * already possible and is not what LoreSmith adds. The value is that "make
 * ambience for the crypt scene" resolves the crypt from the entity graph, the
 * campaign's tone from the campaign record, and builds the audio prompt from
 * both — so the GM never describes their own world back to the machine.
 *
 * All of these are GM-only, matching `src/routes/campaign-audio.ts`.
 */

type ToolEnvType = NonNullable<ReturnType<typeof getEnvFromContext>>;
type ToolErrorResult = ReturnType<typeof createToolError>;

type GmAccess =
	| { error: ToolErrorResult }
	| {
			env: ToolEnvType;
			access: { userId: string; campaign: { name: string } };
	  };

/**
 * Resolve env, campaign access, and GM role in one step.
 *
 * All three audio tools need exactly this preamble, and inlining it three times
 * pushed each `execute` past the repo's complexity gate for no benefit.
 */
async function resolveGmAccess(
	options: ToolExecuteOptions | undefined,
	campaignId: string,
	jwt: string | null | undefined,
	ctx: { toolCallId: string; detail: string }
): Promise<GmAccess> {
	const env = getEnvFromContext(options);
	if (!env) {
		return {
			error: createToolError(
				"Environment not available",
				ctx.detail,
				500,
				ctx.toolCallId
			),
		};
	}

	const access = await requireCampaignAccessForTool({
		env,
		campaignId,
		jwt,
		toolCallId: ctx.toolCallId,
	});
	if ("toolCallId" in access) return { error: access };

	const gmError = await requireGMRole(
		env,
		campaignId,
		access.userId,
		ctx.toolCallId
	);
	if (gmError) return { error: gmError };

	return { env, access };
}

/**
 * Reject impossible generations before a row is written.
 *
 * Ambience and music have no provider unless one is configured, and saying so up
 * front is far better than a pending track that fails a minute later.
 */
async function checkGenerationPreconditions(
	env: ToolEnvType,
	kind: (typeof AUDIO_KINDS)[number],
	line: string | undefined,
	toolCallId: string
): Promise<ToolErrorResult | null> {
	if (kind === "voice" && !line?.trim()) {
		return createToolError(
			"A line of dialogue is required to generate an NPC voice.",
			"Missing `line` for kind=voice.",
			400,
			toolCallId
		);
	}

	const capabilities = await getAudioCapabilities(env as unknown as Env);
	const capability = capabilities.find((c) => c.kind === kind);
	if (capability && !capability.available) {
		return createToolError(
			capability.reason ?? "This kind of audio cannot be generated yet.",
			"No configured provider supports this audio kind.",
			501,
			toolCallId
		);
	}
	return null;
}

/**
 * Generation is slow and runs detached, so the tool answers "started" rather
 * than "here is your audio". The agent must not claim a track is ready; the
 * completion notification does that.
 */
const generateAudioSchema = z.object({
	campaignId: commonSchemas.campaignId,
	kind: z
		.enum(AUDIO_KINDS)
		.describe(
			"ambience for background scene sound, music for a theme, creature for a monster vocalization, voice for spoken NPC dialogue"
		),
	hint: z
		.string()
		.optional()
		.describe(
			"What the GM asked for in their own words, e.g. 'dripping cave with distant chittering'"
		),
	entityId: z
		.string()
		.optional()
		.describe(
			"Entity to draw detail from — a location for ambience, a monster for creature sound, an NPC for voice"
		),
	scene: z
		.string()
		.optional()
		.describe(
			"Scene or beat this audio belongs to, used for the prompt and title"
		),
	line: z
		.string()
		.optional()
		.describe("Required for kind=voice: the exact line of dialogue to speak"),
	durationSec: z
		.number()
		.optional()
		.describe(
			"Requested length in seconds. Providers clamp to what they support."
		),
	title: z.string().optional().describe("Optional track title"),
	jwt: commonSchemas.jwt,
});

/**
 * Optional fields the service expects as `null` rather than `undefined`.
 * Driven off a list so the mapping is one branch instead of one per field.
 */
const NULLABLE_INPUT_FIELDS = [
	"hint",
	"entityId",
	"scene",
	"line",
	"durationSec",
	"title",
] as const;

function toGenerationRequest(
	input: z.infer<typeof generateAudioSchema>,
	username: string
): GenerateAudioRequest {
	const optional: Record<string, unknown> = {};
	for (const field of NULLABLE_INPUT_FIELDS) {
		optional[field] = input[field] ?? null;
	}
	return {
		campaignId: input.campaignId,
		kind: input.kind,
		username,
		...optional,
	} as GenerateAudioRequest;
}

export const generateCampaignAudioTool = tool({
	description:
		"Generate a campaign audio track (scene ambience, theme music, creature sound, or spoken NPC dialogue) from campaign context. Generation is asynchronous — this starts the job and the GM is notified when the track is ready. GM-only.",
	inputSchema: generateAudioSchema,
	execute: async (
		input: z.infer<typeof generateAudioSchema>,
		options?: ToolExecuteOptions
	) => {
		const toolCallId = options?.toolCallId ?? "generateCampaignAudio";
		const gm = await resolveGmAccess(options, input.campaignId, input.jwt, {
			toolCallId,
			detail: "Audio generation requires direct database access.",
		});
		if ("error" in gm) return gm.error;
		const { env, access } = gm;

		const rejection = await checkGenerationPreconditions(
			env,
			input.kind,
			input.line,
			toolCallId
		);
		if (rejection) return rejection;

		try {
			const prepared = await prepareAudioGeneration(
				env as unknown as Env,
				toGenerationRequest(input, access.userId)
			);

			// Detached on purpose: a chat turn must not wait a minute on a provider.
			void prepared.run();

			return createToolSuccess(
				`Started generating "${prepared.record.title}". You'll get a notification when it's ready to play.`,
				{
					audioId: prepared.record.id,
					kind: prepared.record.kind,
					title: prepared.record.title,
					status: prepared.record.status,
					prompt: prepared.record.prompt,
				},
				toolCallId,
				input.campaignId,
				access.campaign.name
			);
		} catch (error) {
			return createToolError(
				"Could not start audio generation.",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});

const listAudioSchema = z.object({
	campaignId: commonSchemas.campaignId,
	kind: z.enum(AUDIO_KINDS).optional().describe("Filter to one kind of audio"),
	jwt: commonSchemas.jwt,
});

export const listCampaignAudioTool = tool({
	description:
		"List generated audio tracks saved to a campaign, with their kind, status, and length. GM-only.",
	inputSchema: listAudioSchema,
	execute: async (
		input: z.infer<typeof listAudioSchema>,
		options?: ToolExecuteOptions
	) => {
		const toolCallId = options?.toolCallId ?? "listCampaignAudio";
		const gm = await resolveGmAccess(options, input.campaignId, input.jwt, {
			toolCallId,
			detail: "Listing audio requires direct database access.",
		});
		if ("error" in gm) return gm.error;
		const { env, access } = gm;

		const audio = await getDAOFactory(
			env
		).campaignAudioDAO.listAudioForCampaign(input.campaignId, {
			kind: isAudioKind(input.kind) ? input.kind : undefined,
		});

		return createToolSuccess(
			audio.length === 0
				? "No audio tracks have been generated for this campaign yet."
				: `Found ${audio.length} audio track${audio.length === 1 ? "" : "s"}.`,
			{
				audio: audio.map((track) => ({
					id: track.id,
					title: track.title,
					kind: track.kind,
					status: track.status,
					durationSec: track.durationSec,
					loopable: track.loopable,
				})),
			},
			toolCallId,
			input.campaignId,
			access.campaign.name
		);
	},
});

const deleteAudioSchema = z.object({
	campaignId: commonSchemas.campaignId,
	audioId: z.string().describe("Id of the audio track to delete"),
	jwt: commonSchemas.jwt,
});

export const deleteCampaignAudioTool = tool({
	description:
		"Delete a generated audio track and its stored file from a campaign. GM-only.",
	inputSchema: deleteAudioSchema,
	execute: async (
		input: z.infer<typeof deleteAudioSchema>,
		options?: ToolExecuteOptions
	) => {
		const toolCallId = options?.toolCallId ?? "deleteCampaignAudio";
		const gm = await resolveGmAccess(options, input.campaignId, input.jwt, {
			toolCallId,
			detail: "Deleting audio requires direct database access.",
		});
		if ("error" in gm) return gm.error;
		const { env, access } = gm;

		const record = await getDAOFactory(env).campaignAudioDAO.getAudioById(
			input.audioId
		);
		if (!record || record.campaignId !== input.campaignId) {
			return createToolError(
				"That audio track was not found in this campaign.",
				"Audio not found",
				404,
				toolCallId
			);
		}

		await deleteCampaignAudio(env as unknown as Env, record);

		return createToolSuccess(
			`Deleted "${record.title}".`,
			{ audioId: record.id },
			toolCallId,
			input.campaignId,
			access.campaign.name
		);
	},
});

/** Campaign audio tools, GM-only. */
export const campaignAudioToolsBundle = {
	generateCampaignAudioTool,
	listCampaignAudioTool,
	deleteCampaignAudioTool,
};

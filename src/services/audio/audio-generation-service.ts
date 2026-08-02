import { NOTIFICATION_TYPES } from "@/constants/notification-types";
import { getDAOFactory } from "@/dao/dao-factory";
import { getEnvVar } from "@/lib/env-utils";
import { AUDIO_KIND_SPEND_INTENT } from "@/lib/llm-usage-intents";
import { logVerboseAudioSpend } from "@/lib/llm-usage-verbose-log";
import { createLogger } from "@/lib/logger";
import { notifyUser } from "@/lib/notifications";
import {
	type AudioCampaignContext,
	type AudioEntityContext,
	buildAudioPrompt,
	buildAudioTitle,
} from "@/lib/prompts/audio-prompts";
import type { Env } from "@/middleware/auth";
import type {
	AudioKind,
	AudioSourceRef,
	CampaignAudioRecord,
} from "@/types/campaign-audio";
import { defaultLoopableForKind } from "@/types/campaign-audio";
import {
	AudioGenerationError,
	AudioKindUnavailableError,
} from "./audio-provider";
import type { AudioProviderEnv } from "./audio-provider-factory";
import {
	type AudioCapability,
	describeAudioCapabilities,
	resolveAudioProvider,
} from "./audio-provider-factory";

/**
 * Orchestrates generated campaign audio (issue #756): build the prompt from
 * campaign context, call a provider, store the blob in R2 and the metadata in
 * D1, record spend, and notify the GM.
 *
 * Generation is ASYNC by construction. Audio models take seconds to a minute,
 * which is far past what a chat turn or an HTTP request should hold open, so the
 * public entry point writes a `pending` row, returns it immediately, and lets the
 * caller hand the actual work to `ctx.waitUntil`. Every terminal state — ready or
 * failed — reports back over the existing NOTIFICATIONS Durable Object.
 */

/** R2 layout: campaign-scoped so deleting a campaign's audio is a prefix list. */
export function buildAudioR2Key(campaignId: string, audioId: string): string {
	return `campaigns/${campaignId}/audio/${audioId}.mp3`;
}

export interface GenerateAudioRequest {
	campaignId: string;
	kind: AudioKind;
	username: string;
	/** Direct GM steer; wins over derived context when present. */
	hint?: string | null;
	/** Entity to draw sensory detail from (a location, monster, or NPC). */
	entityId?: string | null;
	/** Scene beat text, e.g. a planning task title or runsheet scene. */
	scene?: string | null;
	/** For `voice`: the exact line to speak. */
	line?: string | null;
	/** Provider voice/speaker id for the speech kinds. */
	voice?: string | null;
	durationSec?: number | null;
	/** For `music`: allow vocals. Defaults to instrumental, which tables want. */
	instrumental?: boolean | null;
	title?: string | null;
	description?: string | null;
	loopable?: boolean | null;
	source?: AudioSourceRef | null;
}

export interface PreparedAudio {
	record: CampaignAudioRecord;
	/** Runs the provider call and finalizes the row. Hand to `ctx.waitUntil`. */
	run: () => Promise<void>;
}

/** Env keys the provider factory reads, resolved through the secrets path. */
const AUDIO_SECRET_KEYS = [
	"ELEVENLABS_API_KEY",
	"AI_GATEWAY_ACCOUNT_ID",
	"AI_GATEWAY_ID",
	"AUDIO_GATEWAY_BASE_URL",
	"ELEVENLABS_VOICE_ID",
	"AUDIO_VOICE_PROVIDER",
] as const;

/**
 * Build the env shape the provider factory expects.
 *
 * Secrets can live in `.dev.vars`, a binding, or the secrets store, so they are
 * resolved through `getEnvVar` rather than read off `env` directly — otherwise
 * the gateway provider would look unconfigured in exactly the environments where
 * it is configured.
 */
export async function resolveAudioProviderEnv(
	env: Env
): Promise<AudioProviderEnv> {
	const resolved: Record<string, string | undefined> = {};

	await Promise.all(
		AUDIO_SECRET_KEYS.map(async (key) => {
			const value = await getEnvVar(env, key, false).catch(() => "");
			if (value) resolved[key] = value;
		})
	);

	return {
		...resolved,
		AI: env.AI as unknown as AudioProviderEnv["AI"],
	} as AudioProviderEnv;
}

export async function getAudioCapabilities(
	env: Env
): Promise<AudioCapability[]> {
	return describeAudioCapabilities(await resolveAudioProviderEnv(env));
}

/** Pull campaign tone from the campaign record. */
async function loadCampaignContext(
	env: Env,
	campaignId: string
): Promise<AudioCampaignContext | null> {
	const campaign =
		await getDAOFactory(env).campaignDAO.getCampaignById(campaignId);
	if (!campaign) return null;

	const row = campaign as unknown as {
		name?: string;
		description?: string | null;
		game_system?: string | null;
		metadata?: string | null;
	};

	return {
		name: row.name ?? "Campaign",
		description: row.description ?? null,
		tone: readToneFromMetadata(row.metadata),
		gameSystem: row.game_system ?? null,
	};
}

/** Campaign metadata is a JSON blob; tone is optional and often absent. */
function readToneFromMetadata(
	metadata: string | null | undefined
): string | null {
	if (!metadata) return null;
	try {
		const parsed = JSON.parse(metadata) as { tone?: unknown };
		return typeof parsed.tone === "string" ? parsed.tone : null;
	} catch {
		return null;
	}
}

async function loadEntityContext(
	env: Env,
	entityId: string
): Promise<AudioEntityContext | null> {
	const entity = await getDAOFactory(env).entityDAO.getEntityById(entityId);
	if (!entity) return null;

	return {
		name: entity.name,
		entityType: entity.entityType,
		description: readEntityDescription(entity.content),
	};
}

/**
 * Entity content is type-specific and untyped at this layer, so take the first
 * plausible prose field rather than assuming a shape that only holds for some
 * entity types.
 */
function readEntityDescription(content: unknown): string | null {
	if (!content || typeof content !== "object") return null;
	const record = content as Record<string, unknown>;
	for (const field of ["description", "summary", "appearance", "details"]) {
		const value = record[field];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return null;
}

/**
 * Record where a track came from, so the player UI can show it beside its scene.
 *
 * An explicit `source` from the caller always wins; otherwise the entity is the
 * more specific origin, then the scene, then nothing.
 */
function deriveSource(
	request: GenerateAudioRequest,
	entity: AudioEntityContext | null
): AudioSourceRef {
	if (request.source) return request.source;
	if (entity && request.entityId) {
		return { kind: "entity", id: request.entityId, label: entity.name };
	}
	if (request.scene) {
		return { kind: "scene", id: null, label: request.scene };
	}
	return { kind: "manual", id: null, label: null };
}

/**
 * Create the pending row and return a runner for the slow part.
 *
 * Splitting preparation from execution is what lets an HTTP handler answer 202
 * immediately and an agent tool reply "I'm working on it" in the same chat turn,
 * while the provider call continues on `ctx.waitUntil`.
 */
export async function prepareAudioGeneration(
	env: Env,
	request: GenerateAudioRequest
): Promise<PreparedAudio> {
	const campaign = await loadCampaignContext(env, request.campaignId);
	if (!campaign) {
		throw new Error("Campaign not found");
	}

	const entity = request.entityId
		? await loadEntityContext(env, request.entityId)
		: null;

	const promptInput = {
		kind: request.kind,
		campaign,
		entity,
		scene: request.scene ?? null,
		hint: request.hint ?? null,
		line: request.line ?? null,
	};

	const prompt = buildAudioPrompt(promptInput);
	const title = request.title?.trim() || buildAudioTitle(promptInput);

	const audioId = crypto.randomUUID();
	const daoFactory = getDAOFactory(env);

	await daoFactory.campaignAudioDAO.createAudio(audioId, {
		campaignId: request.campaignId,
		kind: request.kind,
		title,
		description: request.description ?? null,
		prompt,
		loopable: request.loopable ?? defaultLoopableForKind(request.kind),
		source: deriveSource(request, entity),
		createdBy: request.username,
	});

	const record = await daoFactory.campaignAudioDAO.getAudioById(audioId);
	if (!record) {
		throw new Error("Failed to create audio record");
	}

	return {
		record,
		run: () => runAudioGeneration(env, record, request),
	};
}

/**
 * Perform the provider call and finalize the row.
 *
 * Never throws: this runs detached on `waitUntil`, where an unhandled rejection
 * would be invisible. Every failure path writes `failed` with a reason and
 * notifies, so the GM always learns the outcome.
 */
export async function runAudioGeneration(
	env: Env,
	record: CampaignAudioRecord,
	request: GenerateAudioRequest
): Promise<void> {
	const logger = createLogger(
		env as unknown as Record<string, unknown>,
		"[audio-generation]"
	);
	const daoFactory = getDAOFactory(env);

	try {
		const providerEnv = await resolveAudioProviderEnv(env);
		const provider = resolveAudioProvider(providerEnv, record.kind);

		const generated = await provider.generate({
			kind: record.kind,
			prompt: record.prompt,
			durationSec: request.durationSec ?? undefined,
			voice: request.voice ?? undefined,
			// Taken from the persisted row, not the request: `loopable` is where the
			// per-kind default was already resolved, so asking the model to render a
			// seamless wrap and marking the track as looping can never disagree.
			loop: record.loopable,
			instrumental: request.instrumental ?? undefined,
		});

		const r2Key = buildAudioR2Key(record.campaignId, record.id);
		await env.R2.put(r2Key, generated.bytes, {
			httpMetadata: { contentType: generated.contentType },
		});

		await daoFactory.campaignAudioDAO.completeAudio(record.id, {
			r2Key,
			contentType: generated.contentType,
			durationSec: generated.durationSec,
			sizeBytes: generated.bytes.byteLength,
			provider: provider.name,
			model: generated.model,
		});

		logVerboseAudioSpend(env as unknown as Record<string, unknown>, {
			intent: AUDIO_KIND_SPEND_INTENT[record.kind],
			source: "audio-generation-service",
			username: record.createdBy,
			seconds: generated.durationSec ?? 0,
			secondsAreEstimate: generated.durationIsEstimate,
			provider: provider.name,
			model: generated.model,
			campaignId: record.campaignId,
			extras: { kind: record.kind, bytes: generated.bytes.byteLength },
		});

		await notifySafely(env, record.createdBy, {
			type: NOTIFICATION_TYPES.AUDIO_READY,
			title: "Audio ready",
			message: `🔊 "${record.title}" is ready to play.`,
			data: {
				campaignId: record.campaignId,
				audioId: record.id,
				kind: record.kind,
			},
		});
	} catch (error) {
		const message = describeFailure(error);
		logger.warn(`Audio generation failed for ${record.id}: ${message}`);

		await daoFactory.campaignAudioDAO
			.failAudio(record.id, message)
			.catch(() => {});

		await notifySafely(env, record.createdBy, {
			type: NOTIFICATION_TYPES.AUDIO_GENERATION_FAILED,
			title: "Audio generation failed",
			message: `⚠️ "${record.title}" could not be generated. ${message}`,
			data: {
				campaignId: record.campaignId,
				audioId: record.id,
				kind: record.kind,
				// A permanent capability gap must not be offered as retryable.
				retryable: !(error instanceof AudioKindUnavailableError),
			},
		});
	}
}

/**
 * Turn a thrown error into something safe to show a GM.
 *
 * Capability gaps are quoted verbatim because they explain a real platform
 * limitation the GM should understand. Provider errors are not: they can carry
 * account, quota, and key detail.
 */
function describeFailure(error: unknown): string {
	if (error instanceof AudioKindUnavailableError) return error.message;
	if (error instanceof AudioGenerationError) {
		return "The audio provider could not complete this request.";
	}
	return error instanceof Error && /required|must/i.test(error.message)
		? error.message
		: "Unexpected error during audio generation.";
}

async function notifySafely(
	env: Env,
	username: string,
	payload: Parameters<typeof notifyUser>[2]
): Promise<void> {
	try {
		await notifyUser(env, username, payload);
	} catch {
		// Notifications are best-effort; the row already records the outcome.
	}
}

/** Delete a track's blob and row together, so R2 never keeps an orphan. */
export async function deleteCampaignAudio(
	env: Env,
	record: CampaignAudioRecord
): Promise<void> {
	if (record.r2Key) {
		await env.R2.delete(record.r2Key).catch(() => {});
	}
	await getDAOFactory(env).campaignAudioDAO.deleteAudio(record.id);
}

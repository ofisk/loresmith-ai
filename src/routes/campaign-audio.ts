import { getDAOFactory } from "@/dao/dao-factory";
import { CampaignAccessDeniedError } from "@/lib/errors";
import {
	type ContextWithAuth,
	ensureCampaignAccess,
	getUserAuth,
	requireCanEdit,
	requireCanSeeSpoilers,
	requireParam,
} from "@/lib/route-utils";
import type { GenerateAudioRequest } from "@/services/audio/audio-generation-service";
import {
	deleteCampaignAudio,
	getAudioCapabilities,
	prepareAudioGeneration,
} from "@/services/audio/audio-generation-service";
import type { AudioKind, CampaignAudioRecord } from "@/types/campaign-audio";
import { AUDIO_KINDS, isAudioKind } from "@/types/campaign-audio";

/**
 * Generated campaign audio (issue #756).
 *
 * Every handler gates on `requireCanSeeSpoilers` or `requireCanEdit`, both of
 * which exclude the player roles. That is stricter than "audio is just sound"
 * suggests, and it is deliberate: track titles and descriptions are built from
 * campaign entities, so a list of tracks is a list of what is coming. Audio must
 * not become reachable through the player-facing share flow
 * (`src/routes/campaign-share.ts`). A player-facing at-the-table surface is
 * follow-on work (#743) and needs the licensing question in #756 settled first.
 */

function handleError(
	c: ContextWithAuth,
	error: unknown,
	fallbackMessage: string
): Response {
	if (error instanceof CampaignAccessDeniedError) {
		return c.json({ error: "Access denied" }, 403);
	}
	return c.json(
		{ error: fallbackMessage },
		error instanceof Error && /required|must|not found/i.test(error.message)
			? 400
			: 500
	);
}

/**
 * Load a track and confirm it belongs to the campaign in the path.
 *
 * Answers 404 rather than 403 for a cross-campaign id, so probing ids cannot
 * confirm that a track exists in a campaign the caller cannot read.
 */
async function loadAudioForCampaign(
	c: ContextWithAuth,
	campaignId: string,
	audioId: string
): Promise<CampaignAudioRecord | Response> {
	const record = await getDAOFactory(c.env).campaignAudioDAO.getAudioById(
		audioId
	);

	if (!record || record.campaignId !== campaignId) {
		return c.json({ error: "Audio not found" }, 404);
	}
	return record;
}

/** Report which audio kinds this deployment can actually generate. */
export async function handleGetAudioCapabilities(c: ContextWithAuth) {
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;

		const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
		if (!hasAccess) return c.json({ error: "Campaign not found" }, 404);
		await requireCanSeeSpoilers(c, campaignId);

		return c.json({ capabilities: await getAudioCapabilities(c.env) });
	} catch (error) {
		return handleError(c, error, "Failed to read audio capabilities");
	}
}

interface GenerateAudioBody {
	kind?: unknown;
	hint?: string;
	entityId?: string;
	scene?: string;
	line?: string;
	voice?: string;
	durationSec?: number;
	title?: string;
	description?: string;
	loopable?: boolean;
}

/**
 * Optional request fields the service expects as `null` rather than `undefined`.
 *
 * Driven off a list rather than written out as a chain of `??` so the mapping
 * stays one branch instead of one per field.
 */
const NULLABLE_REQUEST_FIELDS = [
	"hint",
	"entityId",
	"scene",
	"line",
	"voice",
	"durationSec",
	"title",
	"description",
	"loopable",
] as const;

/** Normalize the optional fields to the service's `null`-based shape. */
function toGenerateRequest(
	body: GenerateAudioBody,
	kind: AudioKind,
	campaignId: string,
	username: string
): GenerateAudioRequest {
	const optional: Record<string, unknown> = {};
	for (const field of NULLABLE_REQUEST_FIELDS) {
		optional[field] = body[field] ?? null;
	}
	return {
		campaignId,
		kind,
		username,
		...optional,
	} as GenerateAudioRequest;
}

/** `null` when the body is valid; otherwise the 400 to return. */
function validateGenerateBody(
	c: ContextWithAuth,
	body: GenerateAudioBody
): Response | null {
	if (!isAudioKind(body.kind)) {
		// Listed from the source of truth rather than spelled out, so adding a kind
		// cannot leave this message quietly describing the old set.
		return c.json(
			{ error: `kind must be one of: ${AUDIO_KINDS.join(", ")}` },
			400
		);
	}
	if (body.kind === "voice" && !body.line?.trim()) {
		return c.json({ error: "line is required when generating NPC voice" }, 400);
	}
	return null;
}

/**
 * Run the generation detached when the runtime offers an execution context.
 *
 * Falls back to awaiting rather than dropping the work, so tests and any local
 * path without an execution context still produce a track.
 */
async function runDetached(
	c: ContextWithAuth,
	run: () => Promise<void>
): Promise<void> {
	const executionCtx =
		"executionCtx" in c
			? (
					c as unknown as {
						executionCtx?: { waitUntil(p: Promise<unknown>): void };
					}
				).executionCtx
			: undefined;

	if (executionCtx) {
		executionCtx.waitUntil(run());
		return;
	}
	await run();
}

/**
 * Start a generation and answer 202 immediately.
 *
 * The provider call runs on `waitUntil` because audio takes seconds to a minute;
 * holding the request open for it would time out and would block the chat turn
 * that triggered it. The returned `pending` record is what the UI polls or
 * updates from the completion notification.
 */
export async function handleGenerateAudio(c: ContextWithAuth) {
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;

		const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
		if (!hasAccess) return c.json({ error: "Campaign not found" }, 404);
		await requireCanEdit(c, campaignId);

		const body = (await c.req.json().catch(() => ({}))) as GenerateAudioBody;

		const invalid = validateGenerateBody(c, body);
		if (invalid) return invalid;

		const prepared = await prepareAudioGeneration(
			c.env,
			toGenerateRequest(body, body.kind as AudioKind, campaignId, auth.username)
		);

		await runDetached(c, prepared.run);

		return c.json({ audio: prepared.record }, 202);
	} catch (error) {
		return handleError(c, error, "Failed to start audio generation");
	}
}

export async function handleListAudio(c: ContextWithAuth) {
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;

		const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
		if (!hasAccess) return c.json({ error: "Campaign not found" }, 404);
		await requireCanSeeSpoilers(c, campaignId);

		const kindParam = c.req.query("kind");
		const audio = await getDAOFactory(
			c.env
		).campaignAudioDAO.listAudioForCampaign(campaignId, {
			kind: isAudioKind(kindParam) ? kindParam : undefined,
			sourceKind: c.req.query("sourceKind") || undefined,
			sourceId: c.req.query("sourceId") || undefined,
		});

		return c.json({ audio });
	} catch (error) {
		return handleError(c, error, "Failed to list campaign audio");
	}
}

export async function handleGetAudio(c: ContextWithAuth) {
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const audioId = requireParam(c, "audioId");
		if (audioId instanceof Response) return audioId;

		const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
		if (!hasAccess) return c.json({ error: "Campaign not found" }, 404);
		await requireCanSeeSpoilers(c, campaignId);

		const record = await loadAudioForCampaign(c, campaignId, audioId);
		if (record instanceof Response) return record;

		return c.json({ audio: record });
	} catch (error) {
		return handleError(c, error, "Failed to load audio");
	}
}

/**
 * Stream the audio bytes.
 *
 * Served through the Worker rather than as a public R2 URL so playback carries
 * the same campaign authorization as everything else — a leaked URL is not a
 * permanent unauthenticated handle on campaign content.
 */
export async function handleStreamAudio(c: ContextWithAuth) {
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const audioId = requireParam(c, "audioId");
		if (audioId instanceof Response) return audioId;

		const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
		if (!hasAccess) return c.json({ error: "Campaign not found" }, 404);
		await requireCanSeeSpoilers(c, campaignId);

		const record = await loadAudioForCampaign(c, campaignId, audioId);
		if (record instanceof Response) return record;

		if (record.status !== "ready" || !record.r2Key) {
			return c.json(
				{ error: "Audio is not ready", status: record.status },
				409
			);
		}

		const object = await c.env.R2.get(record.r2Key);
		if (!object) {
			return c.json({ error: "Audio file is missing" }, 404);
		}

		return new Response(object.body as unknown as ReadableStream, {
			headers: {
				"Content-Type": record.contentType ?? "audio/mpeg",
				"Content-Length": String(object.size),
				// Tracks are immutable once ready, so the browser may keep them for the
				// length of a session — which is the point, since they loop at the table.
				"Cache-Control": "private, max-age=3600",
			},
		});
	} catch (error) {
		return handleError(c, error, "Failed to stream audio");
	}
}

export async function handleUpdateAudio(c: ContextWithAuth) {
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const audioId = requireParam(c, "audioId");
		if (audioId instanceof Response) return audioId;

		const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
		if (!hasAccess) return c.json({ error: "Campaign not found" }, 404);
		await requireCanEdit(c, campaignId);

		const record = await loadAudioForCampaign(c, campaignId, audioId);
		if (record instanceof Response) return record;

		const body = (await c.req.json().catch(() => ({}))) as {
			title?: string;
			description?: string | null;
			loopable?: boolean;
		};

		if (body.title !== undefined && !body.title.trim()) {
			return c.json({ error: "title must not be empty" }, 400);
		}

		await getDAOFactory(c.env).campaignAudioDAO.updateAudio(audioId, {
			title: body.title?.trim(),
			description: body.description,
			loopable: body.loopable,
		});

		const updated = await getDAOFactory(c.env).campaignAudioDAO.getAudioById(
			audioId
		);
		return c.json({ audio: updated });
	} catch (error) {
		return handleError(c, error, "Failed to update audio");
	}
}

export async function handleDeleteAudio(c: ContextWithAuth) {
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const audioId = requireParam(c, "audioId");
		if (audioId instanceof Response) return audioId;

		const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
		if (!hasAccess) return c.json({ error: "Campaign not found" }, 404);
		await requireCanEdit(c, campaignId);

		const record = await loadAudioForCampaign(c, campaignId, audioId);
		if (record instanceof Response) return record;

		await deleteCampaignAudio(c.env, record);
		return c.json({ success: true });
	} catch (error) {
		return handleError(c, error, "Failed to delete audio");
	}
}

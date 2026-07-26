/**
 * Generated campaign audio: scene ambience, campaign theme music, and
 * creature/NPC vocalizations. See issue #756.
 *
 * Audio is a campaign asset, not a chat artifact: the blob lives in R2, the
 * metadata in D1 (`docs/STORAGE_STRATEGY.md`), and a track is re-usable across
 * sessions. Generation is asynchronous — a row is written in `pending` and
 * transitions to `ready` or `failed` — because audio models take seconds to a
 * minute and must not block a chat turn.
 *
 * The four kinds are NOT interchangeable, and the split is a platform fact
 * rather than a design preference: Workers AI ships speech models but no
 * text-to-music or text-to-sound-effect model. `voice` and `creature` are
 * therefore servable today; `ambience` and `music` need an external model
 * reached through Cloudflare AI Gateway. See `AUDIO_KIND_CAPABILITY` below and
 * `src/services/audio/audio-provider-factory.ts`.
 */

export const AUDIO_KINDS = ["ambience", "music", "creature", "voice"] as const;

/** What the caller wants to hear, which also selects the provider. */
export type AudioKind = (typeof AUDIO_KINDS)[number];

export function isAudioKind(value: unknown): value is AudioKind {
	return typeof value === "string" && AUDIO_KINDS.includes(value as AudioKind);
}

/**
 * Which kinds a speech model can serve versus which need a sound/music model.
 *
 * Kept as data rather than scattered `if (kind === "voice")` checks so that the
 * day Cloudflare ships a text-to-music model, the change is one table entry plus
 * a provider class — not a search across the codebase.
 */
export const AUDIO_KIND_CAPABILITY: Record<
	AudioKind,
	"speech" | "sound" | "music"
> = {
	voice: "speech",
	creature: "speech",
	ambience: "sound",
	music: "music",
};

export const AUDIO_STATUSES = ["pending", "ready", "failed"] as const;

export type AudioStatus = (typeof AUDIO_STATUSES)[number];

/**
 * What the track was generated from, so the player UI can surface a track next
 * to the thing it belongs to (a runsheet scene, an entity, a planning beat) and
 * the GM can trace a prompt back to its source.
 */
export type AudioSourceKind =
	| "scene"
	| "entity"
	| "planning_task"
	| "session_digest"
	| "manual";

export interface AudioSourceRef {
	kind: AudioSourceKind;
	/** Id of the originating record, when it has one. */
	id?: string | null;
	/** Human-readable origin, e.g. "The flooded crypt". */
	label?: string | null;
}

/** A generated audio track as stored in D1. */
export interface CampaignAudioRecord {
	id: string;
	campaignId: string;
	kind: AudioKind;
	title: string;
	description: string | null;
	/**
	 * The prompt actually sent to the provider. Stored verbatim so a GM can see
	 * what campaign context produced a track, and so a regenerate is reproducible.
	 */
	prompt: string;
	/** R2 object key. Null until generation succeeds. */
	r2Key: string | null;
	contentType: string | null;
	durationSec: number | null;
	sizeBytes: number | null;
	provider: string | null;
	model: string | null;
	status: AudioStatus;
	/** Populated only when status is `failed`; shown to the GM. */
	errorMessage: string | null;
	/**
	 * Whether the track is meant to loop at the table. Ambience and music loop;
	 * a one-shot roar or a line of NPC dialogue does not.
	 */
	loopable: boolean;
	source: AudioSourceRef | null;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
}

/** Listing shape — same as the record; there is no oversized column to omit. */
export type CampaignAudioSummary = CampaignAudioRecord;

export interface CreateCampaignAudioInput {
	campaignId: string;
	kind: AudioKind;
	title: string;
	description?: string | null;
	prompt: string;
	loopable: boolean;
	source?: AudioSourceRef | null;
	createdBy: string;
}

export interface CompleteCampaignAudioInput {
	r2Key: string;
	contentType: string;
	durationSec: number | null;
	sizeBytes: number;
	provider: string;
	model: string;
}

export interface UpdateCampaignAudioInput {
	title?: string;
	description?: string | null;
	loopable?: boolean;
}

/**
 * Ambience and music are looped under a scene for as long as it lasts; voice and
 * creature sounds are fired once. Used as the default when a caller does not say.
 */
export function defaultLoopableForKind(kind: AudioKind): boolean {
	return kind === "ambience" || kind === "music";
}

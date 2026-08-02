import type { AudioKind } from "@/types/campaign-audio";
import {
	AudioGenerationError,
	type AudioGenerationRequest,
	type AudioProvider,
	estimateDurationSec,
	type GeneratedAudio,
	toAudioBytes,
} from "./audio-provider";

/**
 * Scene ambience, sound effects, creature vocalizations, theme music, and NPC
 * voices, routed through Cloudflare AI Gateway to ElevenLabs (issue #756).
 *
 * Why this exists at all: the Workers AI catalog has no text-to-music and no
 * text-to-sound-effect model, so those kinds cannot be served first-party.
 * Going through AI Gateway rather than calling the vendor directly keeps caching,
 * rate limiting, logging, and cost visibility on Cloudflare — which matters more
 * for audio than for text, because a single generation costs orders of magnitude
 * more than a completion and identical scene prompts recur constantly across
 * campaigns ("tavern murmur", "rain on stone").
 *
 * This provider is INERT UNLESS CONFIGURED. With `ELEVENLABS_API_KEY` unset,
 * `createGatewayAudioProvider` returns null, the factory reports the sound and
 * music kinds as unavailable, and the UI explains why. Setting the secret is the
 * deliberate act that turns it on.
 *
 * Three different ElevenLabs endpoints back the five kinds, which is why
 * `buildRequest` dispatches per kind rather than the request being uniform:
 *
 * | Kind                    | Endpoint               | Model                     |
 * |-------------------------|------------------------|---------------------------|
 * | ambience, sfx, creature | `/v1/sound-generation` | `eleven_text_to_sound_v2` |
 * | music                   | `/v1/music`            | `music_v1`                |
 * | voice                   | `/v1/text-to-speech`   | `eleven_multilingual_v2`  |
 */

const SUPPORTED_KINDS: readonly AudioKind[] = [
	"ambience",
	"sfx",
	"music",
	"creature",
	"voice",
];

/**
 * Sound Effects v2 caps a single generation at 30 seconds. Table use wants
 * minutes, so a short bed is generated and looped rather than this provider
 * attempting a long generation the model cannot produce.
 */
export const MAX_SOUND_EFFECT_SEC = 30;

/** Default bed length: long enough that a loop is not obviously repetitive. */
export const DEFAULT_AMBIENCE_SEC = 22;

/** A one-shot effect wants to be short; a 20-second door slam is not a door slam. */
export const DEFAULT_SFX_SEC = 5;

/**
 * The `/v1/music` endpoint accepts 3s–600s. The ceiling here is deliberately
 * lower than the API's: music is the most expensive kind per generation, and a
 * five-minute loop already outlasts any scene a GM plays it under.
 */
export const MAX_MUSIC_SEC = 300;
export const MIN_MUSIC_SEC = 10;
export const DEFAULT_MUSIC_SEC = 60;

/**
 * Requested explicitly rather than relying on the vendor default, because the
 * duration estimate below divides by this exact bitrate — a silent default
 * change would silently corrupt every reported track length.
 */
const OUTPUT_FORMAT = "mp3_44100_128";
const ELEVENLABS_MP3_BITS_PER_SECOND = 128_000;

/** Default premade ElevenLabs voice, overridable per request via `voice`. */
export const DEFAULT_ELEVENLABS_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

export const DEFAULT_SOUND_MODEL = "eleven_text_to_sound_v2";
export const DEFAULT_MUSIC_MODEL = "music_v1";
export const DEFAULT_SPEECH_MODEL = "eleven_multilingual_v2";

export interface GatewayAudioProviderConfig {
	apiKey: string;
	/** Full base URL to the vendor through AI Gateway, no trailing slash. */
	baseUrl: string;
	soundModel?: string;
	musicModel?: string;
	speechModel?: string;
	voiceId?: string;
}

/** Env keys this provider reads. All must be present for it to activate. */
export interface GatewayAudioEnv {
	ELEVENLABS_API_KEY?: string;
	AI_GATEWAY_ACCOUNT_ID?: string;
	AI_GATEWAY_ID?: string;
	/** Escape hatch for tests and for pointing at a different gateway/vendor. */
	AUDIO_GATEWAY_BASE_URL?: string;
	/** Default ElevenLabs voice id for `kind=voice`. */
	ELEVENLABS_VOICE_ID?: string;
}

export function buildGatewayBaseUrl(env: GatewayAudioEnv): string | null {
	if (env.AUDIO_GATEWAY_BASE_URL) {
		return env.AUDIO_GATEWAY_BASE_URL.replace(/\/+$/, "");
	}
	if (!env.AI_GATEWAY_ACCOUNT_ID || !env.AI_GATEWAY_ID) return null;
	return `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/elevenlabs`;
}

/**
 * Build the provider, or return null when it is not configured.
 *
 * Returning null rather than throwing is deliberate: an unconfigured ambience
 * provider is the expected default state of this repository, not an error.
 */
export function createGatewayAudioProvider(
	env: GatewayAudioEnv
): GatewayAudioProvider | null {
	const apiKey = env.ELEVENLABS_API_KEY;
	if (!apiKey) return null;

	const baseUrl = buildGatewayBaseUrl(env);
	if (!baseUrl) return null;

	return new GatewayAudioProvider({
		apiKey,
		baseUrl,
		voiceId: env.ELEVENLABS_VOICE_ID,
	});
}

interface VendorRequest {
	path: string;
	model: string;
	body: Record<string, unknown>;
}

export class GatewayAudioProvider implements AudioProvider {
	readonly name = "ai-gateway:elevenlabs";

	private readonly soundModel: string;
	private readonly musicModel: string;
	private readonly speechModel: string;
	private readonly voiceId: string;

	constructor(private readonly config: GatewayAudioProviderConfig) {
		this.soundModel = config.soundModel ?? DEFAULT_SOUND_MODEL;
		this.musicModel = config.musicModel ?? DEFAULT_MUSIC_MODEL;
		this.speechModel = config.speechModel ?? DEFAULT_SPEECH_MODEL;
		this.voiceId = config.voiceId || DEFAULT_ELEVENLABS_VOICE_ID;
	}

	supports(kind: AudioKind): boolean {
		return SUPPORTED_KINDS.includes(kind);
	}

	async generate(request: AudioGenerationRequest): Promise<GeneratedAudio> {
		if (!this.supports(request.kind)) {
			throw new AudioGenerationError(
				this.name,
				`Gateway audio provider cannot generate ${request.kind} audio`
			);
		}

		const { path, body, model } = this.buildRequest(request);
		const response = await this.post(path, body);
		const bytes = await toAudioBytes(response);

		if (bytes.byteLength === 0) {
			throw new AudioGenerationError(this.name, "Provider returned no audio");
		}

		return {
			bytes,
			contentType: "audio/mpeg",
			// Derived from encoded size rather than trusted from the request, so a
			// truncated response is not reported — or billed — as a full-length track.
			durationSec:
				estimateDurationSec(bytes.byteLength, ELEVENLABS_MP3_BITS_PER_SECOND) ??
				null,
			durationIsEstimate: true,
			model,
		};
	}

	/** Dispatch to the right ElevenLabs endpoint for the kind. */
	private buildRequest(request: AudioGenerationRequest): VendorRequest {
		if (request.kind === "music") return this.buildMusicRequest(request);
		if (request.kind === "voice") return this.buildSpeechRequest(request);
		return this.buildSoundRequest(request);
	}

	private buildMusicRequest(request: AudioGenerationRequest): VendorRequest {
		const durationSec = clampRange(
			request.durationSec ?? DEFAULT_MUSIC_SEC,
			MIN_MUSIC_SEC,
			MAX_MUSIC_SEC
		);
		return {
			path: "/v1/music",
			model: this.musicModel,
			body: {
				prompt: request.prompt,
				music_length_ms: Math.round(durationSec * 1000),
				model_id: this.musicModel,
				// Eleven Music sings by default. A theme with an AI vocalist over it is
				// unusable at a table, where the GM is the only voice that should be
				// heard, so instrumental is forced unless a caller opts out.
				force_instrumental: request.instrumental ?? true,
			},
		};
	}

	private buildSpeechRequest(request: AudioGenerationRequest): VendorRequest {
		const voice = request.voice || this.voiceId;
		return {
			path: `/v1/text-to-speech/${encodeURIComponent(voice)}`,
			model: this.speechModel,
			body: {
				// For speech the prompt IS the line to speak — see `buildVoicePrompt`.
				text: request.prompt,
				model_id: this.speechModel,
			},
		};
	}

	private buildSoundRequest(request: AudioGenerationRequest): VendorRequest {
		const fallback =
			request.kind === "ambience" ? DEFAULT_AMBIENCE_SEC : DEFAULT_SFX_SEC;
		const durationSec = clampRange(
			request.durationSec ?? fallback,
			1,
			MAX_SOUND_EFFECT_SEC
		);

		const body: Record<string, unknown> = {
			text: request.prompt,
			duration_seconds: durationSec,
			// Bias toward following the prompt over the model's own aesthetic;
			// a GM asking for "dripping water" wants dripping water.
			prompt_influence: 0.6,
			model_id: this.soundModel,
		};

		// The v2 sound model can render a bed that wraps seamlessly, which is
		// strictly better than crossfading a non-looping one at playback time. The
		// flag is rejected by v1, so it is only sent when the model can take it.
		if (request.loop && this.soundModel === DEFAULT_SOUND_MODEL) {
			body.loop = true;
		}

		return { path: "/v1/sound-generation", model: this.soundModel, body };
	}

	private async post(
		path: string,
		body: Record<string, unknown>
	): Promise<Response> {
		let response: Response;
		try {
			response = await fetch(
				`${this.config.baseUrl}${path}?output_format=${OUTPUT_FORMAT}`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"xi-api-key": this.config.apiKey,
						Accept: "audio/mpeg",
					},
					body: JSON.stringify(body),
				}
			);
		} catch (error) {
			throw new AudioGenerationError(
				this.name,
				error instanceof Error ? error.message : "Gateway request failed"
			);
		}

		if (!response.ok) {
			// Read the body for the vendor's reason, but never surface it verbatim to
			// the GM — it can contain account and quota detail.
			const detail = await response.text().catch(() => "");
			throw new AudioGenerationError(
				this.name,
				`Audio provider returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`
			);
		}

		return response;
	}
}

function clampRange(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
